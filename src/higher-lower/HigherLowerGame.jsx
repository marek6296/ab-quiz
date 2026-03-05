import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getRandomGameSequence } from './hlDataset';
import { useAudio } from '../hooks/useAudio';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

const CountUp = ({ value, isRevealing }) => {
    const count = useMotionValue(0);
    const rounded = useTransform(count, Math.round);

    useEffect(() => {
        if (isRevealing) {
            count.set(0);
            const controls = animate(count, value, { duration: 1.0, ease: 'easeOut' });
            return controls.stop;
        } else {
            count.set(value); // instant if not revealing
        }
    }, [value, isRevealing, count]);

    return <motion.span>{rounded}</motion.span>;
};

export const HigherLowerGame = ({ activeGame, players, gameChannel, latestPlayerGuess, onLeave, onSetGame }) => {
    const { user } = useAuth();
    const { playSound } = useAudio();
    const isHost = activeGame?.host_id === user?.id;
    const [myGuess, setMyGuess] = useState(null);
    const [timeLeft, setTimeLeft] = useState(100);
    const [isLeaving, setIsLeaving] = useState(false);

    const tickerRef = useRef(null);
    const gameState = activeGame?.state || {};

    const activeGameRef = useRef(activeGame);
    const playersRef = useRef(players);
    const gameStateRef = useRef(gameState);

    useEffect(() => {
        activeGameRef.current = activeGame;
        gameStateRef.current = activeGame?.state || {};
    }, [activeGame]);

    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const myRecord = players.find(p => p.user_id === user?.id);

    const maxLocalRealPlayersRef = useRef(0);

    // Host Migration & Local Auto-Victory
    useEffect(() => {
        if (!players.length || !user || !activeGame) return;

        const realPlayers = players.filter(p => !p.is_bot);
        const realPlayersCount = realPlayers.length;
        const hostStillHere = players.some(p => p.user_id === activeGame.host_id);

        // Keep track locally of the maximum players seen
        if (realPlayersCount > maxLocalRealPlayersRef.current) {
            maxLocalRealPlayersRef.current = realPlayersCount;
        }

        const amIStillAlive = players.some(p => p.user_id === user.id);

        // Auto Victory Check (If we ever saw 2+ players and now there's 1 or 0 left, end the game)
        if (amIStillAlive && !isLeaving && maxLocalRealPlayersRef.current >= 2 && realPlayersCount <= 1 && gameState.phase !== 'finished') {
            console.log("Local Auto Victory triggered! Opponent abandoned the game.");
            const finishState = { ...gameState, phase: 'finished', win_reason: 'opponent_abandoned' };
            // Update local state instantly to show the victory screen
            if (onSetGame) {
                onSetGame(prev => ({ ...prev, state: finishState }));
            }
            // Attempt to close out the game in DB, though local UI matters most.
            supabase.from('higher_lower_games').update({ status: 'completed', state: finishState }).eq('id', activeGame.id).then();
        }

        // Host Migration (if Host disappeared, lowest string user_id takes over)
        if (!hostStillHere && realPlayersCount > 0 && gameState.phase !== 'finished' && activeGame.status === 'playing') {
            const nextHostId = [...realPlayers].sort((a, b) => a.user_id.localeCompare(b.user_id))[0].user_id;
            if (nextHostId === user.id) {
                console.log("Host migration: I am the new host!");
                supabase.from('higher_lower_games').update({ host_id: user.id }).eq('id', activeGame.id).then();
            }
        }
    }, [players, activeGame.host_id, user, gameState.phase, activeGame.status, activeGame.id, isLeaving, onSetGame]);

    // Host loop
    useEffect(() => {
        if (!isHost) return;

        let active = true;
        const loop = async () => {
            if (!active) return;

            const currentGame = activeGameRef.current;
            const state = gameStateRef.current;
            const currentPlayers = playersRef.current;

            if (!currentGame || currentGame.status === 'completed') return;

            const now = Date.now();
            const phase = state.phase;

            async function broadcastState(updates) {
                const newState = { ...state, ...updates };
                gameStateRef.current = newState; // Optimistic update prevents recursive host spam

                if (onSetGame) {
                    onSetGame(prev => prev ? { ...prev, state: newState } : prev);
                }
                try {
                    await gameChannel?.send({
                        type: 'broadcast',
                        event: 'phase_change',
                        payload: { state: newState }
                    });
                } catch (err) {
                    console.log("Channel not ready for broadcast");
                }
                const { error } = await supabase.from('higher_lower_games').update({ state: newState }).eq('id', currentGame.id);
                if (error) console.error("Host state update error:", error);
            }

            async function evaluatePlayer(player, guessRecord, firstItem, secondItem) {
                const guess = typeof guessRecord === 'object' ? guessRecord.value : guessRecord;
                const answeredAt = typeof guessRecord === 'object' ? guessRecord.timestamp : now;
                const elapsed = Math.max(0, answeredAt - (state.phase_start_time || now));

                const isHigher = Number(secondItem.value) >= Number(firstItem.value);
                const isCorrect = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);

                let pointsEarned = 0;
                if (isCorrect && guess !== 'timeout') {
                    // 1000 points max, dropping down to minimum 200 at the end of the 8 seconds.
                    pointsEarned = Math.floor(1000 - (elapsed / 8000) * 800);
                    pointsEarned = Math.max(200, Math.min(1000, pointsEarned));
                }

                const newScore = (player.score || 0) + pointsEarned;

                await supabase.from('higher_lower_players').update({
                    score: newScore,
                    round_points_awarded: pointsEarned
                }).eq('id', player.id);
            }

            try {
                if (phase === 'init') {
                    if (!state.phase_start_time) {
                        const seqData = await getRandomGameSequence(50);
                        await broadcastState({
                            phase: 'spawning_clear',
                            round_index: 0,
                            sequence: seqData.sequence,
                            topic: seqData.topic,
                            metric: seqData.metric,
                            phase_start_time: now,
                            answers: {}
                        });
                    }
                } else if (phase === 'spawning_clear') {
                    if (now - (state.phase_start_time || now) >= 400) {
                        const nextIndex = state.is_next_round ? state.round_index + 1 : state.round_index;
                        await broadcastState({
                            phase: 'spawning_left',
                            phase_start_time: now,
                            round_index: nextIndex,
                            is_next_round: false,
                            answers: {}
                        });
                    }
                } else if (phase === 'spawning_left') {
                    if (now - (state.phase_start_time || now) >= 600) {
                        await broadcastState({ phase: 'spawning_right', phase_start_time: now });
                    }
                } else if (phase === 'spawning_right') {
                    if (now - (state.phase_start_time || now) >= 600) {
                        await broadcastState({ phase: 'stabilize', phase_start_time: now });
                    }
                } else if (phase === 'stabilize') {
                    if (now - (state.phase_start_time || now) >= 600) {
                        await broadcastState({ phase: 'reveal_buttons', phase_start_time: now });
                    }
                } else if (phase === 'reveal_buttons') {
                    if (now - (state.phase_start_time || now) >= 300) {
                        await broadcastState({ phase: 'question', phase_start_time: now });
                    }
                } else if (phase === 'question') {
                    const activePlayers = currentPlayers.filter(p => !p.eliminated);
                    const elapsed = now - (state.phase_start_time || now);

                    // Bot logic
                    const currentAnswers = { ...(state.answers || {}) };
                    let answersChanged = false;
                    currentPlayers.forEach(p => {
                        if (p.is_bot && !currentAnswers[p.id]) {
                            // Assign a unique thinking time for the bot for this round so it doesn't instantly snap
                            const botThinkDelay = 3000 + (parseInt(p.id.replace(/\D/g, '') || 0) % 2000); // stable pseudo-random
                            if (elapsed > botThinkDelay) {
                                const botD = currentGame.settings?.bot_difficulty || 2;
                                const accuracy = botD === 1 ? 0.5 : botD === 2 ? 0.65 : 0.8;
                                const firstItem = state.sequence[state.round_index];
                                const secondItem = state.sequence[state.round_index + 1];
                                const isHigher = secondItem.value >= firstItem.value;
                                const isCorrectGuess = Math.random() < accuracy;
                                currentAnswers[p.id] = {
                                    value: isCorrectGuess ? (isHigher ? 'higher' : 'lower') : (isHigher ? 'lower' : 'higher'),
                                    timestamp: now
                                };
                                answersChanged = true;
                            }
                        }
                    });

                    if (answersChanged) {
                        await broadcastState({ answers: currentAnswers });
                    } else {
                        const allAnswered = currentPlayers.length > 0 && currentPlayers.every(p => currentAnswers[p.id]);
                        if (elapsed >= 8000 || allAnswered) {
                            await broadcastState({ phase: 'reveal_value', phase_start_time: now, answers: currentAnswers });
                        }
                    }
                } else if (phase === 'reveal_value') {
                    if (now - (state.phase_start_time || now) >= 1000) {
                        const firstItem = state.sequence[state.round_index];
                        const secondItem = state.sequence[state.round_index + 1];
                        for (const p of currentPlayers) {
                            const guessRecord = state.answers?.[p.id];
                            await evaluatePlayer(p, guessRecord || 'timeout', firstItem, secondItem);
                        }
                        await broadcastState({ phase: 'reveal_result', phase_start_time: now });
                    }
                } else if (phase === 'reveal_result') {
                    if (now - (state.phase_start_time || now) >= 2000) {
                        await broadcastState({ phase: 'round_scoreboard', phase_start_time: now });
                    }
                } else if (phase === 'round_scoreboard') {
                    if (now - (state.phase_start_time || now) >= 4000) {
                        const isGameOver = state.round_index >= 9;

                        if (isGameOver) {
                            await broadcastState({ phase: 'finished', phase_start_time: now });
                            await supabase.from('higher_lower_games').update({ status: 'completed' }).eq('id', currentGame.id);
                        } else {
                            await broadcastState({ phase: 'cleanup_round', phase_start_time: now, answers: {} });
                        }
                    }
                } else if (phase === 'cleanup_round') {
                    if (now - (state.phase_start_time || now) >= 400) {
                        await broadcastState({ phase: 'spawning_clear', phase_start_time: now, round_index: state.round_index + 1 });
                    }
                }
            } catch (err) {
                console.error("Host loop error:", err);
            }

            if (active) {
                tickerRef.current = setTimeout(loop, 200); // Check more frequently for better timing
            }
        };

        loop();

        return () => {
            active = false;
            if (tickerRef.current) clearTimeout(tickerRef.current);
        };
    }, [isHost, gameChannel]);


    // Timer logic and guess cleanup
    useEffect(() => {
        let isCurrentPhase = true;
        if (gameState.phase === 'question') {
            const start = gameState.phase_start_time;
            const updateTimer = () => {
                if (!isCurrentPhase) return;
                const elapsed = Date.now() - start;
                const left = Math.max(0, 8000 - elapsed);
                setTimeLeft((left / 8000) * 100);
            };
            const t = setInterval(updateTimer, 50);
            return () => {
                isCurrentPhase = false;
                clearInterval(t);
            };
        } else {
            setTimeLeft(0);
        }
    }, [gameState.phase, gameState.phase_start_time]);

    // Reset myGuess when entering spawning_clear
    useEffect(() => {
        if (gameState.phase === 'spawning_clear') {
            setMyGuess(null);
        }
    }, [gameState.phase, gameState.round_index]);

    // Receive guesses from HigherLowerApp's persistent channel listener
    useEffect(() => {
        if (!latestPlayerGuess) return;
        if (isHost && activeGameRef.current) {
            const { playerId, guess } = latestPlayerGuess;

            // Read from the live ref to avoid closure staleness
            const currentState = gameStateRef.current || {};
            const currentAnswers = currentState.answers || {};

            // Skip if already recorded
            if (currentAnswers[playerId] && currentAnswers[playerId].value === guess.value) return;

            const newAnswers = { ...currentAnswers, [playerId]: guess };
            const newState = { ...currentState, answers: newAnswers };

            // Immediately apply to global ref to prevent the loop from overwriting it
            gameStateRef.current = newState;

            if (onSetGame) {
                onSetGame(prev => prev ? { ...prev, state: newState } : prev);
            }

            // Sync to DB for persistence and state mirroring
            supabase.from('higher_lower_games').update({
                state: newState
            }).eq('id', activeGameRef.current.id);
        }
    }, [latestPlayerGuess, isHost, onSetGame]);

    const handleGuess = (guess) => {
        if (myGuess || !['question', 'reveal_buttons'].includes(gameState.phase)) return;
        setMyGuess(guess);

        if (myRecord?.eliminated) return;

        const guessRecord = { value: guess, timestamp: Date.now() };

        // Optimistic UI update instantly
        const updatedAnswers = { ...(gameState.answers || {}), [myRecord.id]: guessRecord };
        if (onSetGame) {
            onSetGame(prev => ({
                ...prev,
                state: { ...prev.state, answers: updatedAnswers }
            }));
        }

        gameChannel?.send({
            type: 'broadcast',
            event: 'player_guess',
            payload: { playerId: myRecord.id, guess: guessRecord }
        });
    };

    const firstItem = gameState.sequence?.[gameState.round_index];
    const secondItem = gameState.sequence?.[gameState.round_index + 1];

    // Evaluate correctness for visuals
    let isCorrect = null;
    let visualGuess = myGuess;

    if (['reveal_value', 'reveal_result'].includes(gameState.phase) && firstItem && secondItem) {
        const record = gameState.answers?.[myRecord?.id];
        let vg = myGuess;

        if (!vg && record) {
            vg = typeof record === 'object' ? record.value : record;
        }

        if (vg && vg !== 'timeout') {
            const isHigher = Number(secondItem.value) >= Number(firstItem.value);
            isCorrect = (vg === 'higher' && isHigher) || (vg === 'lower' && !isHigher);
            visualGuess = vg;
        } else if (vg === 'timeout') {
            isCorrect = false;
            visualGuess = 'timeout';
        }
    }

    // Audio effects
    useEffect(() => {
        if (gameState.phase === 'reveal_result') {
            if (isCorrect === true) {
                playSound('correct');
            } else {
                playSound('wrong');
            }
        }
    }, [gameState.phase, isCorrect, playSound]);

    const showLeftCard = ['spawning_left', 'spawning_right', 'stabilize', 'reveal_buttons', 'question', 'reveal_value', 'reveal_result'].includes(gameState.phase);
    const showRightCard = ['spawning_right', 'stabilize', 'reveal_buttons', 'question', 'reveal_value', 'reveal_result'].includes(gameState.phase);

    const cardVariants = {
        hiddenLeft: { x: -300, opacity: 0, scale: 0.8 },
        hiddenRight: { x: 300, opacity: 0, scale: 0.8 },
        visible: { x: 0, opacity: 1, scale: 1 },
        exitLeft: { x: -300, opacity: 0, scale: 0.8 },
        exitRight: { x: 300, opacity: 0, scale: 0.8 }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: 'white', overflow: 'hidden' }}>

            {/* Top Bar */}
            <div className="hl-topbar">
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {players.map(p => (
                        <div key={p.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative',
                            opacity: p.eliminated ? 0.4 : 1, filter: p.eliminated ? 'grayscale(100%)' : 'none',
                        }}>
                            <img src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{p.player_name}</div>
                                <div style={{ color: '#facc15', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.2rem', position: 'relative' }}>
                                    Skóre: {p.score} {p.score >= 5 && <span style={{ animation: 'pulse 1s infinite' }}>🔥</span>}
                                    <AnimatePresence>
                                        {gameState.phase === 'reveal_result' && (gameState.answers?.[p.id] === (secondItem?.value >= firstItem?.value ? 'higher' : 'lower')) && !p.eliminated && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.5 }}
                                                animate={{ opacity: 1, y: -20, scale: 1.2 }}
                                                exit={{ opacity: 0, scale: 0 }}
                                                transition={{ duration: 0.4, type: 'spring' }}
                                                style={{ position: 'absolute', color: '#10b981', fontWeight: '900', fontSize: '1.2rem', left: '100%', marginLeft: '5px', textShadow: '0 0 5px rgba(16,185,129,0.5)' }}
                                            >
                                                +1
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="danger" onClick={() => { setIsLeaving(true); onLeave(); }} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px' }}>Opustiť</button>
            </div>

            {/* Header Topic */}
            {gameState.topic && (
                <div className="hl-topic-container" style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.2rem', color: '#94a3b8', margin: 0 }}>Kategória</h2>
                    <h1 className="hl-main-title" style={{ color: '#facc15', margin: 0, textShadow: '0 0 10px rgba(250, 204, 21, 0.4)' }}>{gameState.topic}</h1>
                </div>
            )}

            {/* Main Stage */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

                {gameState.phase === 'init' && <h2 style={{ fontSize: '2rem' }}>Generujem dáta...</h2>}

                {showLeftCard && firstItem && secondItem && (
                    <div className="hl-board">

                        {/* FIRST ITEM */}
                        <AnimatePresence>
                            {showLeftCard && (
                                <motion.div
                                    key={`left-${firstItem.name}-${gameState.round_index}`}
                                    variants={cardVariants}
                                    initial="hiddenLeft"
                                    animate="visible"
                                    exit="exitLeft"
                                    transition={{ type: 'spring', damping: 20, stiffness: 100, duration: 0.6 }}
                                    className="hl-card hl-card-first"
                                    style={{
                                        border: gameState.phase === 'reveal_result' ? (isCorrect === true ? '4px solid #10b981' : '4px solid #ef4444') : '2px solid rgba(255,255,255,0.1)',
                                        background: gameState.phase === 'reveal_result' ? (isCorrect === true ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255,255,255,0.05)',
                                        boxShadow: gameState.phase === 'reveal_result' && isCorrect === true ? '0 0 40px rgba(16,185,129,0.3)' : gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? '0 0 40px rgba(239,68,68,0.3)' : 'none',
                                        animation: gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? 'shake 0.8s' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div className="hl-image" style={{ lineHeight: '1' }}>{firstItem.image}</div>
                                        <h3 className="hl-title" style={{ lineHeight: '1.3', margin: 0 }}>"{firstItem.name}"</h3>
                                    </div>
                                    <div className="hl-value-container">
                                        <div className="hl-value-text" style={{ fontWeight: '900', color: '#38bdf8' }}>
                                            {firstItem.value.toLocaleString()}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: '0.5rem' }}>{gameState.metric}</div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {showRightCard && (
                                <motion.div
                                    className="hl-vs"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ type: 'spring', damping: 15 }}
                                    style={{ zIndex: 10 }}
                                >
                                    VS
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* SECOND ITEM */}
                        <AnimatePresence>
                            {showRightCard && (
                                <motion.div
                                    key={`right-${secondItem.name}-${gameState.round_index}`}
                                    variants={cardVariants}
                                    initial="hiddenRight"
                                    animate="visible"
                                    exit="exitRight"
                                    transition={{ type: 'spring', damping: 20, stiffness: 100, duration: 0.6 }}
                                    className="hl-card hl-card-second"
                                    style={{
                                        border: gameState.phase === 'reveal_result' ? (isCorrect === true ? '4px solid #10b981' : '4px solid #ef4444') : '2px solid rgba(255,255,255,0.1)',
                                        background: gameState.phase === 'reveal_result' ? (isCorrect === true ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255,255,255,0.05)',
                                        boxShadow: gameState.phase === 'reveal_result' && isCorrect === true ? '0 0 40px rgba(16,185,129,0.3)' : gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? '0 0 40px rgba(239,68,68,0.3)' : 'none',
                                        animation: gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? 'shake 0.8s' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div className="hl-image" style={{ lineHeight: '1' }}>{secondItem.image}</div>
                                        <h3 className="hl-title" style={{ lineHeight: '1.3', margin: 0 }}>"{secondItem.name}"</h3>
                                    </div>

                                    <div className="hl-value-container">
                                        {['reveal_value', 'reveal_result'].includes(gameState.phase) ? (
                                            <>
                                                <div className="hl-value-text" style={{ fontWeight: '900', color: gameState.phase === 'reveal_result' ? (isCorrect === true ? '#10b981' : '#ef4444') : '#facc15' }}>
                                                    {visualGuess !== 'timeout' ? (
                                                        <CountUp value={secondItem.value} isRevealing={gameState.phase === 'reveal_value'} />
                                                    ) : "ČAS VYPRŠAL!"}
                                                </div>
                                                <div style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: '0.5rem' }}>{gameState.metric}</div>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '240px', justifyContent: 'center' }}>
                                                {['reveal_buttons', 'question'].includes(gameState.phase) && (
                                                    !myGuess ? (
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                            <button
                                                                className="primary hl-btn"
                                                                onClick={() => handleGuess('higher')}
                                                                disabled={myRecord?.eliminated}
                                                                style={{ background: '#3b82f6', border: 'none', borderRadius: '12px' }}>
                                                                Vyššie ⬆
                                                            </button>
                                                            <button
                                                                className="danger hl-btn"
                                                                onClick={() => handleGuess('lower')}
                                                                disabled={myRecord?.eliminated}
                                                                style={{ background: '#f97316', border: 'none', borderRadius: '12px' }}>
                                                                Nižšie ⬇
                                                            </button>
                                                        </motion.div>
                                                    ) : (
                                                        <div style={{ color: '#94a3b8', fontSize: '1.2rem', animation: 'pulse 1.5s infinite', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40px' }}>
                                                            Čakám na súpera...
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <div style={{
                    marginTop: '3rem', width: '100%', maxWidth: '800px', height: '10px',
                    background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden',
                    opacity: gameState.phase === 'question' ? 1 : 0, transition: 'opacity 0.3s'
                }}>
                    <div style={{ height: '100%', background: timeLeft > 30 ? '#10b981' : '#ef4444', width: `${gameState.phase === 'question' ? timeLeft : 0}%`, transition: 'width 0.05s linear' }}></div>
                </div>

                {gameState.phase === 'round_scoreboard' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 40, backdropFilter: 'blur(10px)' }}
                    >
                        <h2 style={{ fontSize: '3rem', color: '#facc15', marginBottom: '2rem', textShadow: '0 0 15px rgba(250, 204, 21, 0.5)' }}>
                            Skóre po {gameState.round_index + 1}. kole
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '500px' }}>
                            {[...players].sort((a, b) => (b.score || 0) - (a.score || 0)).map((p, idx) => (
                                <div key={`board-${p.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: p.id === myRecord?.id ? '2px solid #38bdf8' : '2px solid transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: idx === 0 ? '#facc15' : '#94a3b8', width: '30px' }}>#{idx + 1}</div>
                                        <img src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{p.player_name}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff' }}>{p.score || 0} b</div>
                                        <div style={{ fontSize: '1rem', color: (p.round_points_awarded || 0) > 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                            +{p.round_points_awarded || 0}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {gameState.phase === 'finished' && (
                    <motion.div
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.6, type: 'spring' }}
                        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(circle at center, #064e3b 0%, #020617 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(10px)', padding: '1rem' }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
                            {gameState.win_reason === 'opponent_abandoned' ? (
                                <>
                                    <div className="winner-banner" style={{ animation: 'bounceIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)', marginBottom: '1.5rem', background: 'linear-gradient(135deg, #10b981, #059669)', border: '2px solid #34d399', boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)' }}>
                                        Vyhrávate!
                                    </div>
                                    <div style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '0.8rem 1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        Súper opustil hru, vyhrávate kontumačne.
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h1 className="logo-brutal animate-fade-in" style={{ fontSize: '3rem', marginBottom: '2rem', textAlign: 'center' }}>KONIEC HRY</h1>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', marginBottom: '2.5rem' }}>
                                        {[...players].sort((a, b) => (b.score || 0) - (a.score || 0)).map((p, i) => (
                                            <div key={p.id} className="animate-fade-up" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.2rem', background: i === 0 ? `linear-gradient(90deg, ${p.color}30, rgba(0,0,0,0.5))` : 'rgba(0,0,0,0.5)', border: i === 0 ? `2px solid ${p.color}` : `1px solid ${p.color}40`, borderLeft: `6px solid ${p.color}`, borderRadius: '16px', alignItems: 'center', animationDelay: `${i * 0.1}s` }}>
                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: p.color }}>#{i + 1}</span>
                                                    <img src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                                    <span style={{ fontWeight: 'bold' }}>{p.player_name}</span>
                                                </div>
                                                <span style={{ color: p.color, fontWeight: 'bold', fontSize: '1.5rem' }}>{p.score || 0} b</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <button
                                className="primary"
                                onClick={() => { setIsLeaving(true); onLeave(); }}
                                style={{
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    padding: '1.2rem 3rem',
                                    fontSize: '1.3rem',
                                    borderRadius: '16px',
                                    boxShadow: '0 10px 25px -5px rgba(16,185,129,0.3)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    alignSelf: 'center'
                                }}
                            >
                                Späť do menu
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.2); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @keyframes shake {
                    0% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    50% { transform: translateX(10px); }
                    75% { transform: translateX(-10px); }
                    100% { transform: translateX(0); }
                }

                @media (max-width: 768px) {
                    .hl-board {
                        flex-direction: column !important;
                        justify-content: center !important;
                        height: auto !important;
                        width: 95% !important;
                        gap: 1.5rem !important;
                        margin-bottom: 2rem !important;
                    }
                    .hl-card {
                        width: 100% !important;
                        height: 250px !important;
                        position: relative !important;
                        left: auto !important;
                        right: auto !important;
                        padding: 1.5rem 1rem !important;
                    }
                    .hl-vs {
                        position: absolute !important;
                        top: 50% !important;
                        left: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        z-index: 10 !important;
                        width: 45px !important;
                        height: 45px !important;
                        font-size: 1.2rem !important;
                    }
                    .hl-image { font-size: 4rem !important; margin-bottom: 0.5rem !important; }
                    .hl-title { font-size: 1.2rem !important; }
                    .hl-value-container { height: auto !important; margin-top: 1rem !important; justify-content: center !important; }
                    .hl-value-text { font-size: 2.2rem !important; }
                    
                    /* adjust header / top level layout */
                    .hl-topbar { padding: 0.8rem 1rem !important; flex-wrap: wrap !important; gap: 0.8rem !important; justify-content: center !important;}
                    .hl-main-title { font-size: 1.8rem !important; }
                    
                    /* Buttons in second card */
                    .hl-btn { font-size: 1.2rem !important; padding: 0.8rem !important; min-height: 40px !important;}
                    
                    .hl-topic-container { padding: 1rem 0 0.5rem !important;}
                }
                
                @media (min-width: 769px) {
                    .hl-board {
                        width: 100%;
                        max-width: 900px;
                        height: 500px;
                        display: flex;
                        position: relative;
                        align-items: center;
                        justify-content: center;
                    }
                    .hl-card {
                        position: absolute;
                        width: 400px;
                        height: 500px;
                        padding: 3rem 2rem;
                    }
                    .hl-card-first { left: 0; }
                    .hl-card-second { right: 0; }
                    .hl-vs {
                        position: absolute;
                        left: 50%;
                        top: 50%;
                        transform: translate(-50%, -50%);
                        width: 60px;
                        height: 60px;
                        font-size: 1.5rem;
                        z-index: 10;
                    }
                    .hl-image { font-size: 6rem; margin-bottom: 1.5rem; }
                    .hl-title { font-size: 1.8rem; }
                    .hl-value-container { height: 160px; }
                    .hl-value-text { font-size: 3.5rem; }
                    .hl-btn { font-size: 1.5rem; padding: 1.2rem; min-height: 60px; }
                    .hl-topic-container { padding: 2rem 0 1rem; }
                    .hl-main-title { font-size: 2.5rem; }
                    .hl-topbar { padding: 1rem 2rem; justify-content: space-between; flex-wrap: nowrap; }
                }

                .hl-board {
                    display: flex;
                    position: relative;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                }
                .hl-card {
                    flex-shrink: 0;
                    border-radius: 24px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    text-align: center;
                }
                .hl-vs {
                    border-radius: 50%;
                    background: #facc15;
                    color: #0f172a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                }
                .hl-value-container { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%; }
                .hl-topbar { display: flex; align-items: center; background: rgba(0,0,0,0.3); }
            `}</style>
        </div>
    );
};
