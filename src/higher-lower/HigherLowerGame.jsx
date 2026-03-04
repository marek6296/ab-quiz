import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getRandomRoundData } from './hlDataset';

export const HigherLowerGame = ({ activeGame, players, gameChannel, onLeave }) => {
    const { user } = useAuth();
    const isHost = activeGame?.host_id === user?.id;
    const [localAnswers, setLocalAnswers] = useState({}); // Stores guesses during a round: { [playerId]: 'higher' | 'lower' }
    const [myGuess, setMyGuess] = useState(null);

    const tickerRef = useRef(null);
    const gameState = activeGame?.state || {};

    // ----------------------------------------------------------------------------------
    // HOST GAME LOOP 
    // ----------------------------------------------------------------------------------
    useEffect(() => {
        if (!isHost || activeGame.status === 'completed') return;

        // Assuming gameId is available in activeGame or context
        const gameId = activeGame?.id;
        if (!gameId || !user?.id) return; // Added check from instruction

        async function broadcastState(newState) {
            // Broadcast for instant UI sync
            await gameChannel?.send({
                type: 'broadcast',
                event: 'phase_change',
                payload: { state: newState }
            });
            // Persist to DB
            await supabase.from('higher_lower_games').update({ state: newState }).eq('id', activeGame?.id);
        }

        async function evaluateBot(bot, guess, qData) {
            if (!qData) return;
            const isHigher = qData.second.value >= qData.first.value;
            const isCorrect = (guess === 'higher' && isHigher) || (guess === 'lower' && !isHigher);

            const newScore = isCorrect ? bot.score + 1 : bot.score;
            const newLives = isCorrect ? bot.lives : bot.lives - 1;
            const eliminated = newLives <= 0;

            await supabase.from('higher_lower_players').update({
                score: newScore, lives: newLives, eliminated
            }).eq('id', bot.id);
        }

        const loop = async () => {
            const now = Date.now();
            const phase = gameState.phase;

            if (phase === 'init') {
                if (!gameState.phase_start_time) {
                    await broadcastState({ phase: 'round_start', current_round: 1, phase_start_time: now });
                }
            }
            else if (phase === 'round_start') {
                // Wait 3 seconds, generate question, then transition to 'question'
                if (now - gameState.phase_start_time > 3000) {
                    const qData = getRandomRoundData();
                    await broadcastState({
                        phase: 'question',
                        current_round: gameState.current_round,
                        question_data: qData,
                        phase_start_time: now,
                        answers: {} // clear answers
                    });
                }
            }
            else if (phase === 'question') {
                // Wait 5 seconds for answers, then transition to 'reveal'
                if (now - gameState.phase_start_time > 5000) {

                    // Host plays for bots
                    const currentAnswers = gameState.answers || {};
                    players.forEach(p => {
                        if (p.is_bot && !p.eliminated && !currentAnswers[p.id]) {
                            // Bot guess logic (50/50 for now)
                            currentAnswers[p.id] = Math.random() > 0.5 ? 'higher' : 'lower';
                            // Update bot score/lives immediately since Host controls bots
                            evaluateBot(p, currentAnswers[p.id], gameState.question_data);
                        }
                    });

                    await broadcastState({
                        phase: 'reveal',
                        current_round: gameState.current_round,
                        question_data: gameState.question_data,
                        answers: currentAnswers,
                        phase_start_time: now
                    });
                }
            }
            else if (phase === 'reveal') {
                // Wait 5 seconds to show results, then go to next round or finish
                if (now - gameState.phase_start_time > 5000) {
                    const activePlayers = players.filter(p => !p.eliminated);
                    if (gameState.current_round >= 10 || activePlayers.length <= 1) {
                        await broadcastState({ phase: 'finished', phase_start_time: now });
                        await supabase.from('higher_lower_games').update({ status: 'completed' }).eq('id', activeGame.id);
                    } else {
                        await broadcastState({
                            phase: 'round_start',
                            current_round: gameState.current_round + 1,
                            phase_start_time: now
                        });
                    }
                }
            }
        };

        if (tickerRef.current) clearInterval(tickerRef.current);
        tickerRef.current = setInterval(loop, 1000);

        return () => {
            if (tickerRef.current) clearInterval(tickerRef.current);
        };
    }, [isHost, activeGame, gameState, players]);

    // ----------------------------------------------------------------------------------
    // PLAYER LOGIC (Real players sending guesses and evaluating themselves)
    // ----------------------------------------------------------------------------------

    // Clear local states on new question
    useEffect(() => {
        if (gameState.phase === 'question') {
            setMyGuess(null);
        }
    }, [gameState.phase, gameState.current_round]);

    // Handle incoming guesses from broadcast
    useEffect(() => {
        if (!gameChannel) return;
        const sub = gameChannel.on('broadcast', { event: 'player_guess' }, (msg) => {
            if (isHost) {
                // Host aggregates answers into state
                const { playerId, guess } = msg.payload;
                const newAnswers = { ...(activeGame.state.answers || {}), [playerId]: guess };
                // We update DB immediately so late joiners see answers
                supabase.from('higher_lower_games').update({
                    state: { ...activeGame.state, answers: newAnswers }
                }).eq('id', activeGame.id);
            }
        });
        return () => { sub.unsubscribe(); };
    }, [gameChannel, isHost, activeGame]);

    const handleGuess = async (guess) => {
        if (myGuess || gameState.phase !== 'question') return;
        setMyGuess(guess);

        const myPlayerRecord = players.find(p => p.user_id === user.id);
        if (myPlayerRecord?.eliminated) return;

        gameChannel?.send({
            type: 'broadcast',
            event: 'player_guess',
            payload: { playerId: myPlayerRecord.id, guess }
        });
    };

    // Client-side auto evaluate when reveal hits
    useEffect(() => {
        if (gameState.phase === 'reveal' && myGuess && gameState.question_data) {
            const myPlayerRecord = players.find(p => p.user_id === user.id);
            if (!myPlayerRecord || myPlayerRecord.eliminated) return;

            const qData = gameState.question_data;
            const isHigher = qData.second.value >= qData.first.value;
            const isCorrect = (myGuess === 'higher' && isHigher) || (myGuess === 'lower' && !isHigher);

            const updateMySelf = async () => {
                const newScore = isCorrect ? myPlayerRecord.score + 1 : myPlayerRecord.score;
                const newLives = isCorrect ? myPlayerRecord.lives : myPlayerRecord.lives - 1;
                const eliminated = newLives <= 0;
                await supabase.from('higher_lower_players').update({
                    score: newScore, lives: newLives, eliminated
                }).eq('id', myPlayerRecord.id);
            };
            updateMySelf();
        }
    }, [gameState.phase]); // Only run once when phase becomes reveal

    // ----------------------------------------------------------------------------------
    // RENDER HELPERS
    // ----------------------------------------------------------------------------------

    const myRecord = players.find(p => p.user_id === user?.id);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)', color: 'white', padding: '1rem', overflow: 'hidden' }}>

            {/* Header / Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Kolo {gameState.current_round || 1}/10</span>
                <button className="danger" onClick={onLeave} style={{ padding: '0.5rem 1rem' }}>Opustiť</button>
            </div>

            {/* Main Stage */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                {gameState.phase === 'init' && <h2>Pripravujem hru...</h2>}

                {gameState.phase === 'round_start' && (
                    <div style={{ animation: 'popIn 0.5s ease-out' }}>
                        <h2 style={{ fontSize: '3rem', color: '#10b981' }}>Kolo {gameState.current_round}</h2>
                        <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>Pripravte sa...</p>
                    </div>
                )}

                {(gameState.phase === 'question' || gameState.phase === 'reveal') && gameState.question_data && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', width: '100%', maxWidth: '800px' }}>

                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#facc15', textAlign: 'center', marginBottom: '1rem' }}>
                            Kategória: {gameState.question_data.topic}
                        </div>

                        <div style={{ display: 'flex', gap: '2rem', width: '100%' }}>

                            {/* FIRST ITEM */}
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', padding: '3rem 2rem', borderRadius: '24px', textAlign: 'center' }}>
                                <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>{gameState.question_data.first.name}</h3>
                                <div style={{ fontSize: '3rem', fontWeight: '900', color: '#38bdf8' }}>
                                    {gameState.question_data.first.value.toLocaleString()}
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', fontSize: '2rem', fontWeight: 'black', color: '#cbd5e1' }}>VS</div>

                            {/* SECOND ITEM */}
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', padding: '3rem 2rem', borderRadius: '24px', textAlign: 'center', position: 'relative' }}>
                                <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>{gameState.question_data.second.name}</h3>

                                {gameState.phase === 'reveal' ? (
                                    <div style={{ fontSize: '3rem', fontWeight: '900', color: gameState.question_data.second.value >= gameState.question_data.first.value ? '#10b981' : '#ef4444', animation: 'popIn 0.5s' }}>
                                        {gameState.question_data.second.value.toLocaleString()}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                                        <button
                                            className="primary"
                                            onClick={() => handleGuess('higher')}
                                            disabled={!!myGuess || myRecord?.eliminated}
                                            style={{ background: myGuess === 'higher' ? '#10b981' : '#3b82f6', border: myGuess === 'higher' ? '4px solid white' : 'none' }}>
                                            Vyššie ⬆
                                        </button>
                                        <button
                                            className="danger"
                                            onClick={() => handleGuess('lower')}
                                            disabled={!!myGuess || myRecord?.eliminated}
                                            style={{ background: myGuess === 'lower' ? '#ef4444' : '#f97316', border: myGuess === 'lower' ? '4px solid white' : 'none' }}>
                                            Nižšie ⬇
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                )}

                {gameState.phase === 'finished' && (
                    <div style={{ animation: 'popIn 1s ease', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '4rem', color: '#facc15' }}>Hra Skončila!</h1>
                        <p style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Víťazí hráč s najvyšším skóre a zachovanými životmi.</p>
                        <button className="primary" onClick={onLeave} style={{ padding: '1rem 3rem', fontSize: '1.5rem' }}>Späť do Lobby</button>
                    </div>
                )}
            </div>

            {/* Bottom Panel: Players and Lives */}
            <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '16px', display: 'flex', gap: '1rem', overflowX: 'auto' }}>
                {players.map(p => (
                    <div key={p.id} style={{
                        opacity: p.eliminated ? 0.3 : 1, filter: p.eliminated ? 'grayscale(100%)' : 'none',
                        minWidth: '120px', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: `2px solid ${p.color}50`, textAlign: 'center'
                    }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'black', margin: '0 auto 0.5rem', overflow: 'hidden' }}>
                            <img src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`} alt="" style={{ width: '100%', height: '100%' }} />
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.player_name}</div>
                        <div style={{ color: '#facc15', fontSize: '1.2rem', marginTop: '0.5rem' }}>{p.score} pt</div>
                        <div style={{ marginTop: '0.2rem', display: 'flex', justifyContent: 'center', gap: '2px' }}>
                            {[...Array(3)].map((_, i) => (
                                <span key={i} style={{ color: i < p.lives ? '#ef4444' : '#475569', fontSize: '1.2rem' }}>❤</span>
                            ))}
                        </div>
                        {gameState.phase === 'reveal' && gameState.answers && gameState.answers[p.id] && (
                            <div style={{ marginTop: '0.5rem', fontSize: '1.5rem' }}>{gameState.answers[p.id] === 'higher' ? '⬆' : '⬇'}</div>
                        )}
                    </div>
                ))}
            </div>
            <style>{`@keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
        </div>
    );
};
