import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { updateBoardWithClaim, generateInitialBoard } from '../game-engine/board';
import { calculateClaimResults } from '../game-engine/scoring';
import { evaluateWinCondition, getNextTurnPlayer, getNextTurnDbId } from '../game-engine/turnManager';
import { useGameStore } from '../game-engine/store';

export const useGameState = ({ userId, gameMode, gameRules = 'hex', activeGameId, manualExitRef }) => {
    // Attempt to load from localStorage first if it's a local game
    const loadLocalState = () => {
        if (gameMode !== '1v1_online') {
            try {
                const saved = localStorage.getItem('ab_quiz_local_state');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.gameRules === gameRules) {
                        return parsed;
                    }
                }
            } catch (e) {
                console.error("Failed to load local state", e);
            }
        }
        return null;
    };

    const localInitial = loadLocalState();

    const [board, setBoard] = useState(localInitial?.board || generateInitialBoard(gameRules));
    const [currentPlayer, setCurrentPlayer] = useState(localInitial?.currentPlayer || 1);
    const [winner, setWinner] = useState(localInitial?.winner || null);
    const [gameData, setGameData] = useState(null); // stores player mappings
    const [presenceCount, setPresenceCount] = useState(1); // Track online players

    // Points Mode State
    const [p1Score, setP1Score] = useState(localInitial?.p1Score || 0);
    const [p2Score, setP2Score] = useState(localInitial?.p2Score || 0);
    const [p1Combo, setP1Combo] = useState(localInitial?.p1Combo || 0);
    const [p2Combo, setP2Combo] = useState(localInitial?.p2Combo || 0);

    // Seen Questions Tracking
    const [seenIds, setSeenIds] = useState([]);
    const [disconnectReason, setDisconnectReason] = useState(null);

    // For local games vs BOT, just fetch current user's seen questions once
    useEffect(() => {
        if (gameMode !== '1v1_online' && userId) {
            supabase.from('user_seen_questions')
                .select('question_id')
                .eq('user_id', userId)
                .then(({ data }) => {
                    if (data) setSeenIds(data.map(s => s.question_id));
                });
        }
    }, [gameMode, userId]);

    // Continuous Persistence for Local Games
    useEffect(() => {
        if (gameMode !== '1v1_online' && board && board.length > 0) {
            localStorage.setItem('ab_quiz_local_state', JSON.stringify({
                gameRules, board, currentPlayer, winner, p1Score, p2Score, p1Combo, p2Combo
            }));
        }
    }, [gameMode, gameRules, board, currentPlayer, winner, p1Score, p2Score, p1Combo, p2Combo]);

    const [channel, setChannel] = useState(null);

    // Load initial board or subscribe to realtime if online
    useEffect(() => {
        if (gameMode !== '1v1_online' || !activeGameId) return;

        const fetchGame = async (retries = 3) => {
            const { data, error } = await supabase.from('games').select('*').eq('id', activeGameId).single();
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

                // Fetch seen questions for both players to avoid repetition
                const { data: seenData } = await supabase
                    .from('user_seen_questions')
                    .select('question_id')
                    .in('user_id', [data.player1_id, data.player2_id]);

                if (seenData) {
                    setSeenIds(seenData.map(s => s.question_id));
                }
            } else if (error && error.code === 'PGRST116') {
                if (retries > 0) {
                    // Retry short delay for Supabase replication lag
                    setTimeout(() => fetchGame(retries - 1), 800);
                } else {
                    // Hra uz neexistuje (0 rows returned)
                    alert('Túto hru už server neeviduje (ukončená).');
                    useGameStore.getState().resetToLobby();
                }
            }
        };

        fetchGame();

        const subscription = supabase
            .channel(`game_${activeGameId}`, {
                config: {
                    presence: {
                        key: userId,
                    },
                },
            })
            .on('presence', { event: 'sync' }, () => {
                const newState = subscription.presenceState();
                setPresenceCount(Object.keys(newState).length);
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${activeGameId}`
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    if (manualExitRef?.current) return; // Silent for the leaver
                    // Game was abandoned by the other player or deleted
                    setDisconnectReason("Hra bola ukončená druhým hráčom.");
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
                    if (newData.status === 'finished' && !newData.winner_id) {
                        if (manualExitRef?.current) return; // Silent for the leaver
                        setDisconnectReason("Súper opustil hru.");
                        return;
                    }
                    if (newData.winner_id) setWinner(newData.winner_id === newData.player1_id ? 1 : 2);
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await subscription.track({ online_at: new Date().toISOString() });
                }
            });

        setChannel(subscription);

        return () => {
            supabase.removeChannel(subscription);
            setChannel(null);
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

        // Získanie loggera
        const { addDebugLog } = useGameStore.getState();

        // Log the outcome
        if (targetOwner === 'unowned' || targetOwner === 'black') {
            addDebugLog(`Hexagón ${hexId} neobsadený (zle zodpovedaná otázka)`);
        } else {
            const pointsText = pointsEarned > 0 ? ` (+${pointsEarned}b)` : '';
            addDebugLog(`Hráč ${targetOwner} obsadil hexagón ${hexId}${pointsText}`);
        }

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

            // Immediately apply locally to avoid lag (Optimistic UI)
            setBoard(newBoard);
            setCurrentPlayer(getNextTurnPlayer(currentPlayer));
            if (newWinnerNum) setWinner(newWinnerNum);

            // Let the server validate and permanently save the move
            const { error } = await supabase.functions.invoke('process-move', {
                body: {
                    gameId: activeGameId,
                    hexId,
                    targetOwner,
                    pointsEarned,
                    breakCombo
                }
            });

            if (error) {
                console.error("Server zamietol ťah:", error);
                alert(`Chyba pri synchronizácii: ${error.message || 'Hra zostala v zaseknutom stave. Skúste obnoviť stránku.'}`);
                // Failsafe: Pokus o rucne vymazanie modalneho okna v DB (ak ma hrac RLS prava)
                supabase.from('games').update({ active_modal: null }).eq('id', activeGameId).then();
                // Refresh local state based on what's in DB (rollback optimistic UI)
                window.location.reload();
            }

        } else {
            // Local Mode
            if (targetOwner === 'player1' || targetOwner === 'player2' || targetOwner === 'black') {
                setBoard(updateBoardWithClaim(board, hexId, targetOwner));
            }
            setCurrentPlayer(getNextTurnPlayer(currentPlayer));
        }
    }, [winner, board, gameMode, activeGameId, gameData, currentPlayer, userId, gameRules, p1Score, p2Score, p1Combo, p2Combo]);

    const resetGame = useCallback((forceRules) => {
        const rulesToUse = forceRules || gameRules;
        setBoard(generateInitialBoard(rulesToUse));
        setCurrentPlayer(1);
        setWinner(null);
        setP1Score(0);
        setP2Score(0);
        setP1Combo(0);
        setP2Combo(0);
        setGameData(null); // Clear old online game mappings when restarting
        localStorage.removeItem('ab_quiz_local_state');
        localStorage.removeItem('ab_quiz_local_modal');
    }, [gameRules]);

    // For App.jsx, we need a way to know WHICH player the local user is to restrict clicks
    const localPlayerNum = gameMode === '1v1_online' && gameData
        ? (gameData.player1_id === userId ? 1 : 2)
        : 1; // if local BOT, local user is always player 1 

    const markQuestionAsSeen = useCallback(async (qId) => {
        if (!userId || !qId) return;

        // Optimistically update local state
        setSeenIds(prev => [...new Set([...prev, qId])]);

        // Persist to DB
        const { error } = await supabase.from('user_seen_questions').upsert({
            user_id: userId,
            question_id: qId
        }, { onConflict: 'user_id, question_id' });

        if (error) console.error("Error saving seen question:", error);
    }, [userId]);

    return {
        board,
        currentPlayer,
        winner,
        claimHexagon,
        resetGame,
        localPlayerNum,
        p1Score,
        p2Score,
        p1Combo, p2Combo,
        gameData, presenceCount, seenIds, markQuestionAsSeen,
        disconnectReason, setDisconnectReason,
        channel
    };
};
