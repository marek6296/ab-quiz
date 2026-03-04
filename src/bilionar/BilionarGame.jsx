import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const BilionarGame = ({ activeGame, onLeave }) => {
    const { user } = useAuth();
    const [players, setPlayers] = useState([]);

    // Distributed Game State
    // phases: init, intermission, question, reveal, finished
    const [gameState, setGameState] = useState(activeGame.state || { phase: 'init' });
    const isHost = activeGame.host_id === user.id;

    // Local UI State
    const [visualTime, setVisualTime] = useState(15);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [scoreGained, setScoreGained] = useState(null);
    const awardedIndex = useRef(-1);

    // 1. Initial Data Fetch & Subscriptions
    useEffect(() => {
        const fetchPlayers = async () => {
            const { data } = await supabase.from('bilionar_players').select('*').eq('game_id', activeGame.id).order('score', { ascending: false });
            if (data) setPlayers(data);
        };
        fetchPlayers();

        const channel = supabase.channel(`bilionar_game_board_${activeGame.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bilionar_games', filter: `id=eq.${activeGame.id}` }, (payload) => {
                setGameState(payload.new.state);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bilionar_players', filter: `game_id=eq.${activeGame.id}` }, () => {
                fetchPlayers();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeGame.id]);

    // 2. HOST Server Loop - Drives the Game State across all clients
    useEffect(() => {
        if (!isHost) return;

        let active = true;

        if (gameState.phase === 'init') {
            const initGame = async () => {
                // Fetch 10 random questions
                const { data, error } = await supabase.rpc('get_random_bilionar_questions', { limit_num: 10 });
                // Fallback to basic fetch if RPC doesn't exist
                let questions = data;
                if (error || !questions) {
                    const { data: rawQ } = await supabase.from('bilionar_questions').select('*').limit(10);
                    questions = rawQ;
                }

                if (!active) return;

                const newState = {
                    questions,
                    current_index: 0,
                    phase: 'intermission',
                    phase_end: Date.now() + 4000 // 4 seconds intro
                };

                // Optimistic local update
                setGameState(newState);
                await supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id);
            };
            initGame();
            return;
        }

        const ticker = setInterval(() => {
            const now = Date.now();
            if (gameState.phase_end && now >= gameState.phase_end) {
                let newState = { ...gameState };

                if (gameState.phase === 'intermission') {
                    // Go to question
                    newState.phase = 'question';
                    newState.phase_end = now + 15000; // 15s to answer
                }
                else if (gameState.phase === 'question') {
                    // Go to reveal
                    newState.phase = 'reveal';
                    newState.phase_end = now + 5000; // 5s reveal blinks
                }
                else if (gameState.phase === 'reveal') {
                    // Next question or finish
                    if (gameState.current_index < (gameState.questions?.length - 1)) {
                        newState.phase = 'intermission';
                        newState.phase_end = now + 4000;
                        newState.current_index += 1;
                    } else {
                        newState.phase = 'finished';
                        newState.phase_end = now + 9999999;
                    }
                }

                if (newState.phase !== gameState.phase) {
                    setGameState(newState);
                    supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id);
                }
            }
        }, 500); // Check every 500ms

        return () => {
            active = false;
            clearInterval(ticker);
        };
    }, [gameState, isHost, activeGame.id]);

    // 3. Client Local State Handlers (Timer and Score)
    useEffect(() => {
        // Reset selections on new intermission
        if (gameState.phase === 'intermission') {
            setSelectedAnswer(null);
            setScoreGained(null);
            setVisualTime(15);
        }

        // Award score logic upon reveal
        if (gameState.phase === 'reveal') {
            if (awardedIndex.current !== gameState.current_index) {
                awardedIndex.current = gameState.current_index;
                const currentQ = gameState.questions?.[gameState.current_index];

                // If they answered correctly
                if (selectedAnswer === currentQ?.correct_answer) {
                    const myPlayer = players.find(p => p.user_id === user.id);
                    if (myPlayer) {
                        // Calculate score: Max 1000 - basic 100 per sec remaining
                        const pts = Math.max(100, Math.floor(visualTime * 66));
                        setScoreGained(pts);

                        // Push to DB
                        supabase.from('bilionar_players').update({ score: myPlayer.score + pts }).eq('id', myPlayer.id).then();
                    }
                }
            }
        }
    }, [gameState.phase, gameState.current_index, selectedAnswer, players, user.id, visualTime, gameState.questions]);

    // Fast visual timer update loop
    useEffect(() => {
        if (gameState.phase !== 'question') return;

        const visualTicker = setInterval(() => {
            const left = Math.max(0, Math.ceil((gameState.phase_end - Date.now()) / 1000));
            setVisualTime(left);
        }, 100);

        return () => clearInterval(visualTicker);
    }, [gameState]);

    // Input handlers
    const handleSelectOption = (key) => {
        if (gameState.phase !== 'question') return;
        if (selectedAnswer !== null) return;
        setSelectedAnswer(key);
    };

    // UI Renders
    const renderPlayerAvatar = (p) => {
        const isMe = p.user_id === user.id;
        return (
            <div key={p.id} className={`bilionar-player-avatar ${isMe ? 'is-me' : ''}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                width: '60px'
            }}>
                <div style={{
                    position: 'relative', width: '45px', height: '45px', borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)', border: `2px solid ${isMe ? '#facc15' : 'rgba(250, 204, 21, 0.4)'}`,
                    overflow: 'hidden', boxShadow: isMe ? '0 0 10px rgba(250, 204, 21, 0.6)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {scoreGained !== null && isMe && (
                        <div className="score-popup">+{scoreGained}</div>
                    )}
                    {p.avatar_url ? (
                        <img src={p.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                    ) : null}
                    <div style={{ display: p.avatar_url ? 'none' : 'block', fontSize: '20px' }}>👤</div>

                    {/* Score Badge */}
                    <div style={{
                        position: 'absolute', bottom: '-4px', right: '-4px', background: '#0f172a',
                        border: '1px solid #facc15', color: '#facc15', fontSize: '10px',
                        fontWeight: 'bold', padding: '1px 4px', borderRadius: '8px'
                    }}>
                        {p.score}
                    </div>
                </div>
                <span style={{ fontSize: '10px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontWeight: isMe ? 'bold' : 'normal' }}>
                    {p.player_name?.split(' ')[0]}
                </span>
            </div>
        );
    };

    if (gameState.phase === 'init') {
        return <div className="game-container"><h2 style={{ color: '#facc15' }}>Pripravujem otázky...</h2></div>;
    }

    if (gameState.phase === 'finished') {
        return (
            <div className="game-container start-screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: 'white', padding: '1rem' }}>
                <h1 style={{ color: '#facc15', fontSize: '3rem', marginBottom: '2rem', textShadow: '0 0 20px #facc15' }}>KONIEC HRY</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
                    {players.map((p, i) => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: i === 0 ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.05)', border: i === 0 ? '2px solid #facc15' : '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: i === 0 ? '#facc15' : '#94a3b8' }}>#{i + 1}</span>
                                <span style={{ fontWeight: 'bold' }}>{p.player_name}</span>
                            </div>
                            <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.2rem' }}>{p.score} b</span>
                        </div>
                    ))}
                </div>
                <button className="primary" onClick={onLeave} style={{ marginTop: '3rem', padding: '1rem 3rem' }}>Späť do Lobby</button>
            </div>
        );
    }

    const currentQ = gameState.questions?.[gameState.current_index];
    const totalQ = gameState.questions?.length;

    return (
        <div className="bilionar-board">

            {/* INTERMISSION OVERLAY */}
            {gameState.phase === 'intermission' && (
                <div className="bilionar-intermission">
                    <div className="bilionar-intermission-text">
                        Otázka {gameState.current_index + 1}/{totalQ}
                    </div>
                </div>
            )}

            {/* TOP BAR: Players and Scores */}
            <div className="bilionar-top-bar">
                {players.map(renderPlayerAvatar)}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="bilionar-main-content">

                {/* Timer Area */}
                <div className="bilionar-timer-wrapper">
                    <div className="bilionar-timer-circle" style={{
                        background: `conic-gradient(#ef4444 ${(visualTime / 15) * 360}deg, transparent 0deg)`
                    }}>
                        <div className="bilionar-timer-inner">
                            {visualTime}
                        </div>
                    </div>
                </div>

                {/* Question Area */}
                <div className="bilionar-question-container">
                    <div className="bilionar-question-box">
                        <span className="question-number">Otázka {gameState.current_index + 1}/{totalQ}</span>
                        <h2>{currentQ?.question_text}</h2>
                    </div>
                </div>

                {/* Options Area */}
                <div className="bilionar-options-grid">
                    {['A', 'B', 'C', 'D'].map((key) => {
                        const optionText = currentQ?.[`option_${key.toLowerCase()}`];
                        let statusClass = '';

                        if (gameState.phase === 'question' && selectedAnswer === key) {
                            statusClass = 'locked'; // Waiting for reveal
                        }
                        else if (gameState.phase === 'reveal') {
                            if (key === currentQ.correct_answer) {
                                statusClass = 'correct'; // Always show right answer via blink
                            } else if (selectedAnswer === key) {
                                statusClass = 'wrong'; // Show wrong only to the person who clicked it
                            }
                        }

                        return (
                            <button
                                key={key}
                                className={`bilionar-option-btn ${statusClass}`}
                                onClick={() => handleSelectOption(key)}
                                disabled={selectedAnswer !== null || gameState.phase !== 'question'}
                            >
                                <div className="option-letter">{key}:</div>
                                <div className="option-text">{optionText}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
                <button className="danger" onClick={onLeave} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Opustiť (Dev)</button>
            </div>
        </div>
    );
};
