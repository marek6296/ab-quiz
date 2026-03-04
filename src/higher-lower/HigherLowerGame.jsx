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
            const controls = animate(count, value, { duration: 1, ease: 'easeOut' });
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
    const [localAnswers, setLocalAnswers] = useState({});
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

        const loop = async () => {
            const currentGame = activeGameRef.current;
            const state = gameStateRef.current;
            const currentPlayers = playersRef.current;

            if (!currentGame || currentGame.status === 'completed') return;

            const now = Date.now();
            const phase = state.phase;

            async function broadcastState(updates) {
                const newState = { ...state, ...updates };
                // Broadcast for instant UI sync
                await gameChannel?.send({
                    type: 'broadcast',
                    event: 'phase_change',
                    payload: { state: newState }
                });
                // Persist
                await supabase.from('higher_lower_games').update({ state: newState }).eq('id', currentGame.id);
            }

            async function evaluatePlayer(player, guess, firstItem, secondItem) {
                const isHigher = secondItem.value >= firstItem.value;
                const isCorrect = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);

                const newScore = isCorrect ? player.score + 1 : player.score;
                const eliminated = player.eliminated ? true : !isCorrect;

                await supabase.from('higher_lower_players').update({
                    score: newScore, eliminated
                }).eq('id', player.id);
            }

            if (phase === 'init') {
                if (!state.phase_start_time) {
                    const seqData = getRandomGameSequence(50);
                    await broadcastState({
                        phase: 'question',
                        round_index: 0,
                        sequence: seqData.sequence,
                        topic: seqData.topic,
                        metric: seqData.metric,
                        phase_start_time: now,
                        answers: {}
                    });
                }
            }
            else if (phase === 'question') {
                const activePlayers = currentPlayers.filter(p => !p.eliminated);
                // 8 seconds question time
                const elapsed = now - state.phase_start_time;

                // Bot logic
                const currentAnswers = { ...(state.answers || {}) };
                let answersChanged = false;

                currentPlayers.forEach(p => {
                    if (p.is_bot && !p.eliminated && !currentAnswers[p.id]) {
                        // Delay 1-3 seconds
                        if (elapsed > 1000 + Math.random() * 2000) {
                            // Easy: 50%, Med: 65%, Hard: 80%
                            const botD = currentGame.settings?.bot_difficulty || 2;
                            const accuracy = botD === 1 ? 0.5 : botD === 2 ? 0.65 : 0.8;

                            const firstItem = state.sequence[state.round_index];
                            const secondItem = state.sequence[state.round_index + 1];
                            const isHigher = secondItem.value >= firstItem.value;

                            const isCorrectGuess = Math.random() < accuracy;
                            const botGuess = isCorrectGuess ? (isHigher ? 'higher' : 'lower') : (isHigher ? 'lower' : 'higher');

                            currentAnswers[p.id] = botGuess;
                            answersChanged = true;
                        }
                    }
                });

                if (answersChanged) {
                    await broadcastState({ answers: currentAnswers });
                }

                // Check if everyone answered or timeout
                const allAnswered = activePlayers.every(p => currentAnswers[p.id]);
                if (elapsed > 8000 || allAnswered) {
                    // Evaluate
                    const firstItem = state.sequence[state.round_index];
                    const secondItem = state.sequence[state.round_index + 1];
                    for (const p of activePlayers) {
                        const guess = currentAnswers[p.id];
                        if (!guess) {
                            // Timeout = wrong
                            await evaluatePlayer(p, 'timeout', firstItem, secondItem);
                        } else {
                            await evaluatePlayer(p, guess, firstItem, secondItem);
                        }
                    }
                    await broadcastState({ phase: 'reveal', phase_start_time: now });
                }
            }
            else if (phase === 'reveal') {
                // Wait 4 seconds for reveal & animations
                if (now - state.phase_start_time > 4000) {
                    // Locally evaluate surviving players to avoid DB sync latency
                    const firstItem = state.sequence[state.round_index];
                    const secondItem = state.sequence[state.round_index + 1];
                    const isHigher = secondItem.value >= firstItem.value;

                    const survivingPlayers = currentPlayers.filter(p => {
                        if (p.eliminated) return false;
                        const guess = state.answers?.[p.id];
                        const isCorrect = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);
                        return isCorrect;
                    });

                    if (survivingPlayers.length === 0 || state.round_index >= state.sequence.length - 2) {
                        await broadcastState({ phase: 'finished', phase_start_time: now });
                        await supabase.from('higher_lower_games').update({ status: 'completed' }).eq('id', currentGame.id);
                    } else {
                        await broadcastState({ phase: 'shifting', phase_start_time: now });
                    }
                }
            }
            else if (phase === 'shifting') {
                // Wait 1.5 seconds for card shift animation
                if (now - state.phase_start_time > 1500) {
                    await broadcastState({
                        phase: 'question',
                        round_index: state.round_index + 1,
                        phase_start_time: now,
                        answers: {}
                    });
                }
            }
        };

        if (tickerRef.current) clearInterval(tickerRef.current);
        tickerRef.current = setInterval(loop, 200);

        return () => {
            if (tickerRef.current) clearInterval(tickerRef.current);
        };
    }, [isHost, gameChannel]);

    // Timer logic and guess cleanup
    useEffect(() => {
        if (gameState.phase === 'question') {
            setMyGuess(null);

            const start = gameState.phase_start_time;
            const updateTimer = () => {
                const elapsed = Date.now() - start;
                const left = Math.max(0, 8000 - elapsed);
                setTimeLeft((left / 8000) * 100);
            };
            const t = setInterval(updateTimer, 50);
            return () => clearInterval(t);
        } else {
            setTimeLeft(0);
        }
    }, [gameState.phase, gameState.round_index, gameState.phase_start_time]);

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
        if (myGuess || gameState.phase !== 'question') return;
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
    if (gameState.phase === 'reveal' && myGuess && firstItem && secondItem) {
        const isHigher = secondItem.value >= firstItem.value;
        isCorrect = (myGuess === 'higher' && isHigher) || (myGuess === 'lower' && !isHigher);
    }

    // Audio effects
    useEffect(() => {
        if (gameState.phase === 'reveal') {
            if (isCorrect === true) {
                playSound('correct');
            } else {
                playSound('wrong');
            }
        }
    }, [gameState.phase, isCorrect, playSound]);

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
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            opacity: p.eliminated ? 0.4 : 1, filter: p.eliminated ? 'grayscale(100%)' : 'none',
                        }}>
                            <img src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{p.player_name}</div>
                                <div style={{ color: '#facc15', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    Skóre: {p.score} {p.score >= 5 && <span style={{ animation: 'pulse 1s infinite' }}>🔥</span>}
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

                {(gameState.phase === 'question' || gameState.phase === 'reveal' || gameState.phase === 'shifting') && firstItem && secondItem && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', width: '100%', maxWidth: '900px', flexWrap: 'wrap' }}>

                        {/* FIRST ITEM */}
                        <AnimatePresence mode="popLayout">
                            <motion.div
                                key={firstItem.name}
                                variants={cardVariants}
                                initial="hiddenLeft"
                                animate="visible"
                                exit="exitLeft"
                                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                style={{ flex: '1 1 300px', height: '400px', background: 'rgba(255,255,255,0.05)', borderRadius: '24px', border: '2px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}
                            >
                                <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>{firstItem.image}</div>
                                <h3 style={{ fontSize: '2rem', marginBottom: '2rem' }}>"{firstItem.name}"</h3>
                                <div style={{ fontSize: '3.5rem', fontWeight: '900', color: '#38bdf8' }}>
                                    {firstItem.value.toLocaleString()}
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>{gameState.metric}</div>
                            </motion.div>
                        </AnimatePresence>

                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#facc15', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', zIndex: 10 }}>VS</div>

                        {/* SECOND ITEM */}
                        {gameState.phase !== 'shifting' && (
                            <AnimatePresence mode="popLayout">
                                <motion.div
                                    key={secondItem.name}
                                    variants={cardVariants}
                                    initial="hiddenRight"
                                    animate="visible"
                                    exit="exitLeft"
                                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                    style={{
                                        flex: '1 1 300px', height: '400px', borderRadius: '24px',
                                        border: gameState.phase === 'reveal' ? (isCorrect === true ? '4px solid #10b981' : '4px solid #ef4444') : '2px solid rgba(255,255,255,0.1)',
                                        background: gameState.phase === 'reveal' ? (isCorrect === true ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255,255,255,0.05)',
                                        boxShadow: gameState.phase === 'reveal' && isCorrect === true ? '0 0 40px rgba(16,185,129,0.3)' : gameState.phase === 'reveal' && (isCorrect === false || isCorrect === null) ? '0 0 40px rgba(239,68,68,0.3)' : 'none',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
                                        animation: gameState.phase === 'reveal' && (isCorrect === false || isCorrect === null) ? 'shake 0.5s' : 'none'
                                    }}
                                >
                                    <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>{secondItem.image}</div>
                                    <h3 style={{ fontSize: '2rem', marginBottom: '2rem' }}>"{secondItem.name}"</h3>

                                    {gameState.phase === 'reveal' ? (
                                        <>
                                            <div style={{ fontSize: '3.5rem', fontWeight: '900', color: isCorrect === true ? '#10b981' : '#ef4444' }}>
                                                {myGuess ? <CountUp value={secondItem.value} isRevealing={true} /> : "ČAS VYPRŠAL!"}
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>{gameState.metric}</div>
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '200px' }}>
                                            <button
                                                className="primary"
                                                onClick={() => handleGuess('higher')}
                                                disabled={!!myGuess || myRecord?.eliminated}
                                                style={{ padding: '1.5rem', fontSize: '1.5rem', background: myGuess === 'higher' ? '#10b981' : '#3b82f6', border: myGuess === 'higher' ? '4px solid white' : 'none' }}>
                                                Vyššie ⬆
                                            </button>
                                            <button
                                                className="danger"
                                                onClick={() => handleGuess('lower')}
                                                disabled={!!myGuess || myRecord?.eliminated}
                                                style={{ padding: '1.5rem', fontSize: '1.5rem', background: myGuess === 'lower' ? '#ef4444' : '#f97316', border: myGuess === 'lower' ? '4px solid white' : 'none' }}>
                                                Nižšie ⬇
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>
                )}

                {gameState.phase === 'question' && (
                    <div style={{ marginTop: '3rem', width: '100%', maxWidth: '800px', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: timeLeft > 30 ? '#10b981' : '#ef4444', width: `${timeLeft}%`, transition: 'width 0.05s linear' }}></div>
                    </div>
                )}

                {gameState.phase === 'finished' && (
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
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
