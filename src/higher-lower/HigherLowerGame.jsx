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

export const HigherLowerGame = ({ activeGame, players, gameChannel, onLeave, onSetGame }) => {
    const { user } = useAuth();
    const { playSound } = useAudio();
    const isHost = activeGame?.host_id === user?.id;
    const [myGuess, setMyGuess] = useState(null);
    const [timeLeft, setTimeLeft] = useState(100);

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

            async function evaluatePlayer(player, guess, firstItem, secondItem) {
                const isHigher = secondItem.value >= firstItem.value;
                const isCorrect = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);
                const newScore = isCorrect ? (player.score || 0) + 1 : (player.score || 0);
                const eliminated = player.eliminated ? true : !isCorrect;

                await supabase.from('higher_lower_players').update({
                    score: newScore, eliminated
                }).eq('id', player.id);
            }

            try {
                if (phase === 'init') {
                    if (!state.phase_start_time) {
                        const seqData = getRandomGameSequence(50);
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
                        if (p.is_bot && !p.eliminated && !currentAnswers[p.id]) {
                            // Assign a unique thinking time for the bot for this round so it doesn't instantly snap
                            const botThinkDelay = 3000 + (parseInt(p.id.replace(/\D/g, '') || 0) % 2000); // stable pseudo-random
                            if (elapsed > botThinkDelay) {
                                const botD = currentGame.settings?.bot_difficulty || 2;
                                const accuracy = botD === 1 ? 0.5 : botD === 2 ? 0.65 : 0.8;
                                const firstItem = state.sequence[state.round_index];
                                const secondItem = state.sequence[state.round_index + 1];
                                const isHigher = secondItem.value >= firstItem.value;
                                const isCorrectGuess = Math.random() < accuracy;
                                currentAnswers[p.id] = isCorrectGuess ? (isHigher ? 'higher' : 'lower') : (isHigher ? 'lower' : 'higher');
                                answersChanged = true;
                            }
                        }
                    });

                    if (answersChanged) {
                        await broadcastState({ answers: currentAnswers });
                        return; // return to break out and avoid instantly triggering next logic in the same loop if player already answered 
                    }

                    const allAnswered = activePlayers.length > 0 && activePlayers.every(p => currentAnswers[p.id]);
                    if (elapsed >= 8000 || allAnswered) {
                        await broadcastState({ phase: 'reveal_value', phase_start_time: now, answers: currentAnswers });
                    }
                } else if (phase === 'reveal_value') {
                    if (now - (state.phase_start_time || now) >= 1000) {
                        const firstItem = state.sequence[state.round_index];
                        const secondItem = state.sequence[state.round_index + 1];
                        const activePlayers = currentPlayers.filter(p => !p.eliminated);
                        for (const p of activePlayers) {
                            const guess = state.answers?.[p.id];
                            await evaluatePlayer(p, guess || 'timeout', firstItem, secondItem);
                        }
                        await broadcastState({ phase: 'reveal_result', phase_start_time: now });
                    }
                } else if (phase === 'reveal_result') {
                    if (now - (state.phase_start_time || now) >= 800) {
                        const latestPlayers = playersRef.current;
                        const activePlayers = latestPlayers.filter(p => !p.eliminated);
                        const isGameOver = activePlayers.length <= 1 || state.round_index >= (state.sequence?.length || 0) - 2;

                        if (isGameOver) {
                            await broadcastState({ phase: 'finished', phase_start_time: now });
                            await supabase.from('higher_lower_games').update({ status: 'completed' }).eq('id', currentGame.id);
                        } else {
                            // First, "shift" the layoutId cards (which takes 600ms)
                            await broadcastState({ phase: 'shifting', phase_start_time: now, is_next_round: true, answers: {} });
                        }
                    }
                } else if (phase === 'shifting') {
                    if (now - (state.phase_start_time || now) >= 600) {
                        // After shift completes, bump the round index which brings in the new Right card. 
                        const nextIndex = state.is_next_round ? state.round_index + 1 : state.round_index;
                        await broadcastState({ phase: 'spawning_right', phase_start_time: now, round_index: nextIndex, is_next_round: false });
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

    // Receive guesses
    useEffect(() => {
        if (!gameChannel) return;
        const sub = gameChannel.on('broadcast', { event: 'player_guess' }, (msg) => {
            if (isHost) {
                const { playerId, guess } = msg.payload;
                const newAnswers = { ...(activeGame.state.answers || {}), [playerId]: guess };
                supabase.from('higher_lower_games').update({
                    state: { ...activeGame.state, answers: newAnswers }
                }).eq('id', activeGame.id);
            }
        });
        return () => { sub.unsubscribe(); };
    }, [gameChannel, isHost, activeGame]);

    const handleGuess = (guess) => {
        if (myGuess || !['question', 'reveal_buttons'].includes(gameState.phase)) return;
        setMyGuess(guess);

        if (myRecord?.eliminated) return;

        // Optimistic UI update instantly
        const updatedAnswers = { ...(gameState.answers || {}), [myRecord.id]: guess };
        if (onSetGame) {
            onSetGame(prev => ({
                ...prev,
                state: { ...prev.state, answers: updatedAnswers }
            }));
        }

        gameChannel?.send({
            type: 'broadcast',
            event: 'player_guess',
            payload: { playerId: myRecord.id, guess }
        });
    };

    const firstItem = gameState.sequence?.[gameState.round_index];
    const secondItem = gameState.sequence?.[gameState.round_index + 1];

    // Evaluate correctness for visuals
    let isCorrect = null;
    let visualGuess = myGuess;

    if (['reveal_value', 'reveal_result'].includes(gameState.phase) && firstItem && secondItem) {
        visualGuess = gameState.answers?.[myRecord?.id] || myGuess;

        if (visualGuess && visualGuess !== 'timeout') {
            const isHigher = secondItem.value >= firstItem.value;
            isCorrect = (visualGuess === 'higher' && isHigher) || (visualGuess === 'lower' && !isHigher);
        } else if (visualGuess === 'timeout') {
            isCorrect = false;
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

    const isFirstClear = gameState.phase === 'spawning_clear' && gameState.round_index === 0 && Object.keys(gameState.answers || {}).length === 0;
    const showLeftCard = gameState.phase !== 'init' && !isFirstClear;
    const showRightCard = !isFirstClear && ['spawning_right', 'stabilize', 'reveal_buttons', 'question', 'reveal_value', 'reveal_result', 'spawning_clear'].includes(gameState.phase);

    const cardVariants = {
        hiddenLeft: { x: -300, opacity: 0 },
        hiddenRight: { x: 300, opacity: 0 },
        visible: { x: 0, opacity: 1 },
        exitLeft: { x: -300, opacity: 0 }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: 'white', overflow: 'hidden' }}>

            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', gap: '2rem' }}>
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
                            {p.eliminated && <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem' }}>X</div>}
                        </div>
                    ))}
                </div>
                <button className="danger" onClick={onLeave} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px' }}>Opustiť</button>
            </div>

            {/* Header Topic */}
            {gameState.topic && (
                <div style={{ textAlign: 'center', padding: '2rem 0 1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', color: '#94a3b8', margin: 0 }}>Kategória</h2>
                    <h1 style={{ fontSize: '2.5rem', color: '#facc15', margin: 0, textShadow: '0 0 10px rgba(250, 204, 21, 0.4)' }}>{gameState.topic}</h1>
                </div>
            )}

            {/* Main Stage */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

                {gameState.phase === 'init' && <h2 style={{ fontSize: '2rem' }}>Generujem dáta...</h2>}

                {showLeftCard && firstItem && secondItem && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', width: '100%', maxWidth: '900px', flexWrap: 'wrap' }}>

                        {/* FIRST ITEM */}
                        <AnimatePresence>
                            <motion.div
                                key={`left-${firstItem.name}`}
                                layoutId={`card-${firstItem.name}`}
                                variants={cardVariants}
                                initial="hiddenLeft"
                                animate="visible"
                                exit="exitLeft"
                                transition={{ type: 'spring', damping: 20, stiffness: 100, duration: 0.6 }}
                                style={{
                                    width: '400px', height: '500px', flexShrink: 0, borderRadius: '24px',
                                    border: gameState.phase === 'reveal_result' ? (isCorrect === true ? '4px solid #10b981' : '4px solid #ef4444') : '2px solid rgba(255,255,255,0.1)',
                                    background: gameState.phase === 'reveal_result' ? (isCorrect === true ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255,255,255,0.05)',
                                    boxShadow: gameState.phase === 'reveal_result' && isCorrect === true ? '0 0 40px rgba(16,185,129,0.3)' : gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? '0 0 40px rgba(239,68,68,0.3)' : 'none',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
                                    animation: gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? 'shake 0.8s' : 'none'
                                }}
                            >
                                <div style={{ fontSize: '5rem', marginBottom: '0.5rem' }}>{firstItem.image}</div>
                                <h3 style={{ fontSize: '2rem', marginBottom: '1rem' }}>"{firstItem.name}"</h3>
                                <div style={{ fontSize: '3.5rem', fontWeight: '900', color: '#38bdf8' }}>
                                    {firstItem.value.toLocaleString()}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>{gameState.metric}</div>
                            </motion.div>
                        </AnimatePresence>

                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#facc15', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', zIndex: 10 }}>VS</div>

                        {/* SECOND ITEM */}
                        <AnimatePresence>
                            {showRightCard && (
                                <motion.div
                                    key={`right-${secondItem.name}`}
                                    layoutId={`card-${secondItem.name}`}
                                    variants={cardVariants}
                                    initial="hiddenRight"
                                    animate="visible"
                                    exit="exitLeft"
                                    transition={{ type: 'spring', damping: 20, stiffness: 100, duration: 0.6 }}
                                    style={{
                                        width: '400px', height: '500px', flexShrink: 0, borderRadius: '24px',
                                        border: gameState.phase === 'reveal_result' ? (isCorrect === true ? '4px solid #10b981' : '4px solid #ef4444') : '2px solid rgba(255,255,255,0.1)',
                                        background: gameState.phase === 'reveal_result' ? (isCorrect === true ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255,255,255,0.05)',
                                        boxShadow: gameState.phase === 'reveal_result' && isCorrect === true ? '0 0 40px rgba(16,185,129,0.3)' : gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? '0 0 40px rgba(239,68,68,0.3)' : 'none',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
                                        animation: gameState.phase === 'reveal_result' && (isCorrect === false || isCorrect === null) ? 'shake 0.8s' : 'none'
                                    }}
                                >
                                    <div style={{ fontSize: '5rem', marginBottom: '0.5rem' }}>{secondItem.image}</div>
                                    <h3 style={{ fontSize: '2rem', marginBottom: '1rem' }}>"{secondItem.name}"</h3>

                                    {['reveal_value', 'reveal_result'].includes(gameState.phase) ? (
                                        <>
                                            <div style={{ fontSize: '3.5rem', fontWeight: '900', color: gameState.phase === 'reveal_result' ? (isCorrect === true ? '#10b981' : '#ef4444') : '#facc15' }}>
                                                {visualGuess !== 'timeout' ? (
                                                    <CountUp value={secondItem.value} isRevealing={gameState.phase === 'reveal_value'} />
                                                ) : "ČAS VYPRŠAL!"}
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>{gameState.metric}</div>
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '240px', minHeight: '160px', justifyContent: 'center' }}>
                                            {['reveal_buttons', 'question'].includes(gameState.phase) && (
                                                !myGuess ? (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        <button
                                                            className="primary"
                                                            onClick={() => handleGuess('higher')}
                                                            disabled={myRecord?.eliminated}
                                                            style={{ padding: '1.5rem', fontSize: '1.5rem', background: '#3b82f6', border: 'none' }}>
                                                            Vyššie ⬆
                                                        </button>
                                                        <button
                                                            className="danger"
                                                            onClick={() => handleGuess('lower')}
                                                            disabled={myRecord?.eliminated}
                                                            style={{ padding: '1.5rem', fontSize: '1.5rem', background: '#f97316', border: 'none' }}>
                                                            Nižšie ⬇
                                                        </button>
                                                    </motion.div>
                                                ) : (
                                                    <div style={{ color: '#94a3b8', fontSize: '1.4rem', animation: 'pulse 1.5s infinite', fontWeight: 'bold' }}>
                                                        Čakám na súpera...
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {gameState.phase === 'question' && (
                    <div style={{ marginTop: '3rem', width: '100%', maxWidth: '800px', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: timeLeft > 30 ? '#10b981' : '#ef4444', width: `${timeLeft}%`, transition: 'width 0.05s linear' }}></div>
                    </div>
                )}

                {gameState.phase === 'finished' && (
                    <motion.div
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.6, type: 'spring' }}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
                    >
                        <h1 style={{ fontSize: '5rem', color: '#ef4444', fontWeight: '900', textShadow: '0 0 20px rgba(239, 68, 68, 0.5)', marginBottom: '1rem' }}>GAME OVER</h1>

                        <div style={{ fontSize: '2rem', marginBottom: '3rem', background: 'rgba(255,255,255,0.05)', padding: '2rem 4rem', borderRadius: '24px', border: '2px solid rgba(250, 204, 21, 0.3)' }}>
                            <div style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Tvoje konečné skóre</div>
                            <div style={{ fontSize: '4rem', color: '#facc15', fontWeight: 'bold' }}>{myRecord?.score}</div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="primary" onClick={onLeave} style={{ padding: '1.5rem 3rem', fontSize: '1.5rem', borderRadius: '16px' }}>Späť do menu</button>
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
            `}</style>
        </div>
    );
};
