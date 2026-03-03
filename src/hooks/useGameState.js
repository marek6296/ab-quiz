import { useState, useCallback, useEffect } from 'react';
import { checkWin } from '../utils/pathfinding';
import { supabase } from '../lib/supabase';

export const generateInitialBoard = (rules) => {
    return Array.from({ length: 28 }, (_, i) => {
        let special = 'normal';
        if (rules === 'points') {
            const rand = Math.random();
            if (rand > 0.85) special = 'double';
            else if (rand > 0.70) special = 'risk';
        }
        return { id: i + 1, owner: 'unowned', special };
    });
};

export const useGameState = ({ userId, gameMode, gameRules = 'hex', activeGameId }) => {
    const [board, setBoard] = useState(generateInitialBoard(gameRules));
    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [winner, setWinner] = useState(null);
    const [gameData, setGameData] = useState(null); // stores player mappings

    // Points Mode State
    const [p1Score, setP1Score] = useState(0);
    const [p2Score, setP2Score] = useState(0);
    const [p1Combo, setP1Combo] = useState(0);
    const [p2Combo, setP2Combo] = useState(0);

    // Load initial board or subscribe to realtime if online
    useEffect(() => {
        if (gameMode !== '1v1_online' || !activeGameId) return;

        const fetchGame = async () => {
            const { data } = await supabase.from('games').select('*').eq('id', activeGameId).single();
            if (data) {
                setGameData(data);
                setBoard(data.board_state);
                setP1Score(data.p1_score || 0);
                setP2Score(data.p2_score || 0);
                setP1Combo(data.p1_combo || 0);
                setP2Combo(data.p2_combo || 0);
                // determine current player 1 or 2 based on ID
                setCurrentPlayer(data.current_turn === data.player1_id ? 1 : 2);
                if (data.winner_id) setWinner(data.winner_id === data.player1_id ? 1 : 2);
            }
        };

        fetchGame();

        const subscription = supabase
            .channel(`game_${activeGameId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${activeGameId}`
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    // Game was abandoned by the other player or deleted
                    alert("Hra bola ukončená druhým hráčom.");
                    window.location.reload();
                    return;
                }
                if (payload.eventType === 'UPDATE') {
                    const newData = payload.new;
                    setGameData(newData);
                    setBoard(newData.board_state);
                    setP1Score(newData.p1_score || 0);
                    setP2Score(newData.p2_score || 0);
                    setP1Combo(newData.p1_combo || 0);
                    setP2Combo(newData.p2_combo || 0);
                    setCurrentPlayer(newData.current_turn === newData.player1_id ? 1 : 2);
                    if (newData.winner_id) setWinner(newData.winner_id === newData.player1_id ? 1 : 2);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [gameMode, activeGameId]);


    // Checks for win condition whenever board or score changes
    useEffect(() => {
        if (winner || !board) return; // Game over

        let newWinner = null;

        if (gameRules === 'points') {
            // Points Mode Win Conditions: First to 150 points or full board
            if (p1Score >= 150) newWinner = 1;
            else if (p2Score >= 150) newWinner = 2;
            else {
                // Check if board is full
                const isFull = board.every(h => h.owner !== 'unowned');
                if (isFull) {
                    newWinner = p1Score >= p2Score ? 1 : 2; // In real game, tiebreakers might be needed
                }
            }
        } else {
            // Hex (Pathfinding) Mode Win Conditions
            const player1Nodes = board.filter(h => h.owner === 'player1').map(h => h.id);
            const player2Nodes = board.filter(h => h.owner === 'player2').map(h => h.id);

            if (checkWin(player1Nodes, 1)) newWinner = 1;
            else if (checkWin(player2Nodes, 2)) newWinner = 2;
        }

        if (newWinner) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setWinner(newWinner);
        }
    }, [board, winner, gameRules, p1Score, p2Score]);

    const claimHexagon = useCallback(async (hexId, targetOwner, pointsEarned = 0, breakCombo = false) => {
        if (winner) return;

        // Calculate new scores and combos
        let newP1Score = p1Score;
        let newP2Score = p2Score;
        let newP1Combo = p1Combo;
        let newP2Combo = p2Combo;

        if (targetOwner === 'player1') {
            const hex = board.find(h => h.id === hexId);
            const actualPoints = hex?.special === 'double' ? pointsEarned * 2 : pointsEarned;
            newP1Score += actualPoints;
            newP1Combo += 1;
        } else if (targetOwner === 'player2') {
            const hex = board.find(h => h.id === hexId);
            const actualPoints = hex?.special === 'double' ? pointsEarned * 2 : pointsEarned;
            newP2Score += actualPoints;
            newP2Combo += 1;
        } else if (targetOwner === 'unowned' && breakCombo) {
            // This happens when the actively guessing player gets it wrong
            const hex = board.find(h => h.id === hexId);
            if (currentPlayer === 1) {
                newP1Combo = 0;
                if (hex?.special === 'risk') newP1Score = Math.max(0, newP1Score - 15);
            } else if (currentPlayer === 2) {
                newP2Combo = 0;
                if (hex?.special === 'risk') newP2Score = Math.max(0, newP2Score - 15);
            }
        }

        // Apply state locally immediately
        setP1Score(newP1Score);
        setP2Score(newP2Score);
        setP1Combo(newP1Combo);
        setP2Combo(newP2Combo);

        if (gameMode === '1v1_online' && activeGameId && gameData) {
            // Online Mode
            // 1. Calculate new board
            const newBoard = board.map(hex => hex.id === hexId && hex.owner === 'unowned' ? { ...hex, owner: targetOwner } : hex);

            // 2. Next player ID (only switch turn if a full cycle happened, but for now we follow old logic)
            const nextTurnId = currentPlayer === 1 ? gameData.player2_id : gameData.player1_id;

            // 3. Early Win check for the DB
            let finalWinnerId = null;
            if (gameRules === 'points') {
                if (newP1Score >= 150) finalWinnerId = gameData.player1_id;
                else if (newP2Score >= 150) finalWinnerId = gameData.player2_id;
                else if (newBoard.every(h => h.owner !== 'unowned')) {
                    finalWinnerId = newP1Score >= newP2Score ? gameData.player1_id : gameData.player2_id;
                }
            } else {
                const targetNodes = newBoard.filter(h => h.owner === targetOwner).map(h => h.id);
                if (checkWin(targetNodes, targetOwner === 'player1' ? 1 : 2)) {
                    finalWinnerId = userId; // current player won
                }
            }

            // Immediately apply locally to avoid lag
            setBoard(newBoard);
            setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
            if (finalWinnerId) setWinner(currentPlayer);

            const updates = {
                board_state: newBoard,
                current_turn: nextTurnId,
                p1_score: newP1Score,
                p2_score: newP2Score,
                p1_combo: newP1Combo,
                p2_combo: newP2Combo,
                active_modal: null,
                updated_at: new Date()
            };
            if (finalWinnerId) {
                updates.winner_id = finalWinnerId;
                updates.status = 'finished';
            }

            await supabase.from('games').update(updates).eq('id', activeGameId);

        } else {
            // Local Mode
            if (targetOwner !== 'unowned') {
                setBoard(prev =>
                    prev.map(hex => hex.id === hexId && hex.owner === 'unowned' ? { ...hex, owner: targetOwner } : hex)
                );
            }
            setCurrentPlayer(prev => prev === 1 ? 2 : 1);
        }
    }, [winner, board, gameMode, activeGameId, gameData, currentPlayer, userId, gameRules, p1Score, p2Score, p1Combo, p2Combo]);

    const resetGame = useCallback(() => {
        setBoard(generateInitialBoard(gameRules));
        setCurrentPlayer(1);
        setWinner(null);
        setP1Score(0);
        setP2Score(0);
        setP1Combo(0);
        setP2Combo(0);
    }, [gameRules]);

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
        localPlayerNum,
        p1Score,
        p2Score,
        p1Combo,
        p2Combo,
        gameData
    };
};
