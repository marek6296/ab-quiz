import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateInitialBoard, updateBoardWithClaim } from '../game-engine/board';
import { calculateClaimResults } from '../game-engine/scoring';
import { evaluateWinCondition, getNextTurnPlayer, getNextTurnDbId } from '../game-engine/turnManager';

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

        const newWinner = evaluateWinCondition({
            board,
            gameRules,
            p1Score,
            p2Score,
            targetOwner: 'unowned' // Just a passive check, no specific target Owner
        });

        if (newWinner) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setWinner(newWinner);
        }
    }, [board, winner, gameRules, p1Score, p2Score]);

    const claimHexagon = useCallback(async (hexId, targetOwner, pointsEarned = 0, breakCombo = false) => {
        if (winner) return;

        const hex = board.find(h => h.id === hexId);

        // Calculate new scores and combos
        const results = calculateClaimResults({
            targetOwner,
            pointsEarned,
            breakCombo,
            currentPlayer,
            hexSpecialInfo: hex?.special,
            currentScoresAndCombos: { p1Score, p2Score, p1Combo, p2Combo }
        });

        const { newP1Score, newP2Score, newP1Combo, newP2Combo } = results;

        // Apply state locally immediately
        setP1Score(newP1Score);
        setP2Score(newP2Score);
        setP1Combo(newP1Combo);
        setP2Combo(newP2Combo);

        if (gameMode === '1v1_online' && activeGameId && gameData) {
            // Online Mode
            // 1. Calculate new board
            const newBoard = updateBoardWithClaim(board, hexId, targetOwner);

            // 2. Next player ID
            const nextTurnId = getNextTurnDbId(currentPlayer, gameData);

            // 3. Early Win check for the DB
            let finalWinnerId = null;
            const newWinnerNum = evaluateWinCondition({
                board: newBoard,
                gameRules,
                p1Score: newP1Score,
                p2Score: newP2Score,
                targetOwner
            });
            if (newWinnerNum) {
                finalWinnerId = newWinnerNum === 1 ? gameData.player1_id : gameData.player2_id;
            }

            // Immediately apply locally to avoid lag
            setBoard(newBoard);
            setCurrentPlayer(getNextTurnPlayer(currentPlayer));
            if (newWinnerNum) setWinner(newWinnerNum);

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
                setBoard(updateBoardWithClaim(board, hexId, targetOwner));
            }
            setCurrentPlayer(getNextTurnPlayer(currentPlayer));
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
