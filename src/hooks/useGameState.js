import { useState, useCallback, useEffect } from 'react';
import { checkWin } from '../utils/pathfinding';
import { supabase } from '../lib/supabase';

export const useGameState = ({ userId, gameMode, activeGameId }) => {
    const [board, setBoard] = useState(
        Array.from({ length: 28 }, (_, i) => ({ id: i + 1, owner: 'unowned' }))
    );
    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [winner, setWinner] = useState(null);
    const [gameData, setGameData] = useState(null); // stores player mappings

    // Load initial board or subscribe to realtime if online
    useEffect(() => {
        if (gameMode !== '1v1_online' || !activeGameId) return;

        const fetchGame = async () => {
            const { data } = await supabase.from('games').select('*').eq('id', activeGameId).single();
            if (data) {
                setGameData(data);
                setBoard(data.board_state);
                // determine current player 1 or 2 based on ID
                setCurrentPlayer(data.current_turn === data.player1_id ? 1 : 2);
                if (data.winner_id) setWinner(data.winner_id === data.player1_id ? 1 : 2);
            }
        };

        fetchGame();

        const subscription = supabase
            .channel(`game_${activeGameId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${activeGameId}`
            }, (payload) => {
                const newData = payload.new;
                setGameData(newData);
                setBoard(newData.board_state);
                setCurrentPlayer(newData.current_turn === newData.player1_id ? 1 : 2);
                if (newData.winner_id) setWinner(newData.winner_id === newData.player1_id ? 1 : 2);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [gameMode, activeGameId]);


    // Checks for win condition whenever board changes
    useEffect(() => {
        if (winner || !board) return; // Game over

        const player1Nodes = board.filter(h => h.owner === 'player1').map(h => h.id);
        const player2Nodes = board.filter(h => h.owner === 'player2').map(h => h.id);

        let newWinner = null;
        if (checkWin(player1Nodes)) newWinner = 1;
        else if (checkWin(player2Nodes)) newWinner = 2;

        if (newWinner) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setWinner(newWinner);
        }
    }, [board, winner]);

    const claimHexagon = useCallback(async (hexId, targetOwner) => {
        if (winner) return;

        if (gameMode === '1v1_online' && activeGameId && gameData) {
            // Online Mode
            // 1. Calculate new board
            const newBoard = board.map(hex => hex.id === hexId ? { ...hex, owner: targetOwner } : hex);

            // 2. Next player ID
            const nextTurnId = currentPlayer === 1 ? gameData.player2_id : gameData.player1_id;

            // 3. Early Win check for the DB
            let finalWinnerId = null;
            const targetNodes = newBoard.filter(h => h.owner === targetOwner).map(h => h.id);
            if (checkWin(targetNodes)) {
                finalWinnerId = userId; // current player won
            }

            // Immediately apply locally to avoid lag
            setBoard(newBoard);
            setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
            if (finalWinnerId) setWinner(currentPlayer);

            const updates = {
                board_state: newBoard,
                current_turn: nextTurnId,
                updated_at: new Date()
            };
            if (finalWinnerId) {
                updates.winner_id = finalWinnerId;
                updates.status = 'finished';
            }

            await supabase.from('games').update(updates).eq('id', activeGameId);

        } else {
            // Local Mode
            setBoard(prev =>
                prev.map(hex => hex.id === hexId ? { ...hex, owner: targetOwner } : hex)
            );
            setCurrentPlayer(prev => prev === 1 ? 2 : 1);
        }
    }, [winner, board, gameMode, activeGameId, gameData, currentPlayer, userId]);

    const resetGame = useCallback(() => {
        setBoard(Array.from({ length: 28 }, (_, i) => ({ id: i + 1, owner: 'unowned' })));
        setCurrentPlayer(1);
        setWinner(null);
    }, []);

    // For App.jsx, we need a way to know WHICH player the local user is to restrict clicks
    const localPlayerNum = gameMode === '1v1_online' && gameData
        ? (gameData.player1_id === userId ? 1 : 2)
        : 1; // if local BOT, local user is always player 1 

    return {
        board,
        currentPlayer,
        winner,
        claimHexagon,
        resetGame,
        localPlayerNum
    };
};
