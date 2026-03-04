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
                const sett = activeGame.settings || {};
                const limitCount = sett.questions_count || 10;
                const cats = sett.categories && sett.categories.length > 0 ? sett.categories : null;
                const diffs = sett.difficulty_levels && sett.difficulty_levels.length > 0 ? sett.difficulty_levels : null;

                // Fetch random questions with filters
                const { data: questions, error } = await supabase.rpc('get_random_bilionar_questions', {
                    limit_num: limitCount,
                    categories_filter: cats,
                    difficulty_filter: diffs
                });

                if (!active) return;

                if (error || !questions || questions.length === 0) {
                    console.log("No questions found with filters, falling back to all:", error);
                    const { data: fallbackQ } = await supabase.from('bilionar_questions').select('*').limit(limitCount);

                    if (!fallbackQ || fallbackQ.length === 0) {
                        const newState = { phase: 'no_questions' };
                        setGameState(newState);
                        await supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id);
                        return;
                    }

                    const newState = {
                        questions: fallbackQ,
                        current_index: 0,
                        phase: 'big_intro', // Changed from intermission
                        phase_end: Date.now() + 3000 // 3s for big logo
                    };
                    setGameState(newState);
                    await supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id);
                    return;
                }

                // ASSIGN COLORS TO PLAYERS
                const colorPalette = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
                // Only host assigns colors. We'll update the bilionar_players table
                for (let i = 0; i < players.length; i++) {
                    const assignedColor = colorPalette[i % colorPalette.length];
                    await supabase.from('bilionar_players').update({ color: assignedColor }).eq('id', players[i].id);
                }

                const newState = {
                    questions,
                    current_index: 0,
                    phase: 'big_intro', // 1. Giant Logo
                    phase_end: Date.now() + 3000
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

                switch (gameState.phase) {
                    case 'big_intro':
                        newState.phase = 'welcome';
                        newState.phase_end = now + 6000; // 4s visible + 2s pause
                        break;
                    case 'welcome':
                        newState.phase = 'prepare_first';
                        newState.phase_end = now + 6000; // 4s visible + 2s pause
                        break;
                    case 'prepare_first':
                    case 'prepare_next':
                    case 'post_question_pause':
                        // Go to question reading
                        newState.phase = 'showing_question_only';
                        newState.phase_end = now + 2000; // 2s to read question
                        // Host resets answers
                        supabase.from('bilionar_players').update({ has_answered: false }).eq('game_id', activeGame.id).then();
                        break;
                    case 'showing_question_only':
                        newState.phase = 'answering';
                        newState.phase_end = now + 10000; // 10s to answer
                        break;
                    case 'answering':
                        newState.phase = 'time_up';
                        newState.phase_end = now + 2000; // 2s "Time's Up" message
                        break;
                    case 'time_up':
                        newState.phase = 'reveal_pause';
                        newState.phase_end = now + 2000; // 2s dramatic pause
                        break;
                    case 'reveal_pause':
                        newState.phase = 'reveal_results';
                        newState.phase_end = now + 4000; // 4s showing correct answer & colors
                        break;
                    case 'reveal_results':
                        if (gameState.current_index < (gameState.questions?.length - 1)) {
                            // Clear screen pause before next message
                            newState.phase = 'post_question_pause';
                            newState.phase_end = now + 2000; // 2s empty screen
                            newState.current_index += 1;
                        } else {
                            newState.phase = 'finished';
                            newState.phase_end = now + 9999999;
                        }
                        break;
                    default:
                        break;
                }

                // If jumping from post_question_pause to prepare_next setup (handled above)
                if (gameState.phase === 'post_question_pause' && gameState.current_index > 0) {
                    newState.phase = 'prepare_next';
                    newState.phase_end = now + 6000;
                }

                if (newState.phase !== gameState.phase) {
                    setGameState(newState);
                    supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id);
                }
            }
        }, 200); // Check faster for tighter animation sync

        return () => {
            active = false;
            clearInterval(ticker);
        };
    }, [gameState, isHost, activeGame.id, players]);

    // 3. Client Local State Handlers (Timer and Score)
    useEffect(() => {
        // Reset selections on new question cycle setup
        if (['prepare_first', 'prepare_next', 'post_question_pause'].includes(gameState.phase)) {
            setSelectedAnswer(null);
            setScoreGained(null);
            setVisualTime(10); // Default to our 10s answering time
        }

        // Award score logic upon reveal (handled in reveal_results)
        if (gameState.phase === 'reveal_results') {
            if (awardedIndex.current !== gameState.current_index) {
                awardedIndex.current = gameState.current_index;
                const currentQ = gameState.questions?.[gameState.current_index];

                // 1. AWARD HUMAN SCORE
                if (selectedAnswer === currentQ?.correct_answer) {
                    const myPlayer = players.find(p => p.user_id === user.id);
                    if (myPlayer) {
                        // Max 1000 pts base + up to 1000 pts based on speed (10s max)
                        const pts = Math.max(100, Math.floor(visualTime * 100));
                        setScoreGained(pts);
                        supabase.from('bilionar_players').update({ score: myPlayer.score + pts }).eq('id', myPlayer.id).then();
                    }
                }

                // 2. AWARD BOT SCORE (Host only)
                if (isHost && players.some(p => p.is_bot)) {
                    players.filter(p => p.is_bot).forEach(bot => {
                        const botLvl = activeGame.settings?.bot_difficulty || 2;
                        const prob = botLvl === 1 ? 35 : (botLvl === 2 ? 65 : 92);
                        if (Math.random() * 100 < prob) {
                            // Bot answers correctly. Calculate how fast based on diff. Phase was 10s
                            const botTimeTaken = botLvl === 1 ? (Math.random() * 6 + 4) : (botLvl === 2 ? (Math.random() * 4 + 1.5) : (Math.random() * 2 + 0.5));
                            const botTimeLeft = Math.max(0, 10 - botTimeTaken);
                            const botPts = Math.max(100, Math.floor(botTimeLeft * 100));
                            supabase.from('bilionar_players').update({ score: bot.score + botPts }).eq('id', bot.id).then();
                        }
                    });
                }
            }
        }
    }, [gameState.phase, gameState.current_index, selectedAnswer, players, user.id, visualTime, gameState.questions]);

    // Simulated Bot Interactive Answering (Host only)
    const botTimersRef = useRef(new Set());
    useEffect(() => {
        if (gameState.phase !== 'answering') {
            botTimersRef.current.clear();
            return;
        }
        if (!isHost) return;

        const unansweredBots = players.filter(p => p.is_bot && !p.has_answered && !botTimersRef.current.has(p.id));

        unansweredBots.forEach(bot => {
            botTimersRef.current.add(bot.id);
            const botLvl = activeGame.settings?.bot_difficulty || 2;
            const delay = botLvl === 1 ? (Math.random() * 6000 + 4000) : (botLvl === 2 ? (Math.random() * 4000 + 1500) : (Math.random() * 2000 + 500));

            setTimeout(() => {
                if (activeGame?.id) {
                    supabase.from('bilionar_players').update({ has_answered: true, selected_answer: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)] }).eq('id', bot.id).then();
                }
            }, delay);
        });
    }, [gameState.phase, gameState.current_index, isHost, players, activeGame.id]);

    // Fast visual timer update loop (only active during answering phase)
    useEffect(() => {
        if (gameState.phase !== 'answering') return;

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

        // Update DB so others see you have answered
        const myPlayer = players.find(p => p.user_id === user.id);
        if (myPlayer) {
            supabase.from('bilionar_players').update({ has_answered: true }).eq('id', myPlayer.id).then();
        }
    };

    // UI Renders
    const renderPlayerAvatar = (p) => {
        const isMe = p.user_id === user.id;
        const showAnswered = p.has_answered && gameState.phase === 'question';

        return (
            <div key={p.id} className={`bilionar-player-avatar ${isMe ? 'is-me' : ''}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                width: '60px', position: 'relative'
            }}>
                {showAnswered && (
                    <div style={{
                        position: 'absolute', top: '-5px', right: '5px', background: '#22c55e',
                        color: 'white', borderRadius: '50%', width: '18px', height: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
                        zIndex: 10, border: '2px solid #0f172a', fontWeight: 'bold'
                    }}>
                        ✓
                    </div>
                )}
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

    // Render helpers for specific phases
    if (gameState.phase === 'init') {
        return <div className="game-container"><h2 style={{ color: '#facc15' }}>Pripravujem otázky...</h2></div>;
    }

    if (gameState.phase === 'no_questions') {
        return (
            <div className="game-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Žiadne otázky v databáze!</h2>
                <p style={{ color: 'white', marginBottom: '2rem' }}>Prosím prejdite do Administrácie a vygenerujte AI otázky, aby ste mohli hrať.</p>
                <button className="neutral" onClick={onLeave} style={{ padding: '1rem 3rem' }}>Späť do Lobby</button>
            </div>
        );
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

    // --- PRESENTATION PHASES ---

    if (gameState.phase === 'big_intro') {
        return (
            <div key="phase_big_intro" className="bilionar-board fullscreen-flex">
                <h1 className="logo-brutal massive-entrance">Bilionár Battle</h1>
            </div>
        );
    }

    if (gameState.phase === 'welcome') {
        return (
            <div key="phase_welcome" className="bilionar-board fullscreen-flex">
                <div className="message-modal slide-in-scale">
                    <h2>Vitajte v Bilionár Battle</h2>
                </div>
            </div>
        );
    }

    if (gameState.phase === 'prepare_first') {
        return (
            <div key="phase_prepare_first" className="bilionar-board fullscreen-flex">
                <div className="message-modal slide-in-scale">
                    <h2>Pripravte sa na prvú otázku</h2>
                </div>
            </div>
        );
    }

    if (gameState.phase === 'prepare_next') {
        return (
            <div key="phase_prepare_next" className="bilionar-board fullscreen-flex">
                <div className="message-modal slide-in-scale">
                    <h2>Ideme na ďalšiu otázku</h2>
                </div>
            </div>
        );
    }

    if (gameState.phase === 'post_question_pause' || gameState.phase === 'reveal_pause') {
        return (
            <div key={`pause_${gameState.phase}`} className="bilionar-board">
                {/* Empty board for dramatic effect, keeping top bar */}
                <div className="bilionar-top-bar">
                    {players.map(renderPlayerAvatar)}
                </div>
            </div>
        );
    }

    if (gameState.phase === 'time_up') {
        return (
            <div key="phase_time_up" className="bilionar-board fullscreen-flex relative-board">
                <div className="bilionar-top-bar absolute-top">
                    {players.map(renderPlayerAvatar)}
                </div>
                <div className="message-modal dramatic-pop">
                    <h2>Koniec časového limitu</h2>
                </div>
            </div>
        );
    }

    // --- QUESTION PHASES (showing_question_only, answering, reveal_results) ---

    const currentQ = gameState.questions?.[gameState.current_index];
    const totalQ = gameState.questions?.length;
    const isQuestionOnly = gameState.phase === 'showing_question_only';
    const isReveal = gameState.phase === 'reveal_results';

    return (
        <div className="bilionar-board relative-board">

            {/* TOP BAR: Players and Scores */}
            <div className="bilionar-top-bar absolute-top">
                {players.map(renderPlayerAvatar)}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="bilionar-main-content">

                {/* Timer Area - Only visible when answering */}
                {gameState.phase === 'answering' && (
                    <div className="bilionar-timer-wrapper animate-fade-in">
                        <div className="bilionar-timer-circle" style={{
                            background: `conic-gradient(#ef4444 ${(visualTime / 10) * 360}deg, transparent 0deg)`
                        }}>
                            <div className="bilionar-timer-inner">
                                {visualTime}
                            </div>
                        </div>
                    </div>
                )}

                {/* Question Area */}
                <div className="bilionar-question-container">
                    <div className="bilionar-question-box animate-slide-down">
                        <span className="question-number">Otázka {gameState.current_index + 1}/{totalQ}</span>
                        <h2>{currentQ?.question_text}</h2>
                    </div>
                </div>

                {/* Options Area - Hidden when showing question initially */}
                {!isQuestionOnly && (
                    <div className="bilionar-options-grid animate-fade-up">
                        {['A', 'B', 'C', 'D'].map((key) => {
                            const optionText = currentQ?.[`option_${key.toLowerCase()}`];
                            let statusClass = '';

                            // Determine class based on state
                            if (gameState.phase === 'answering' && selectedAnswer === key) {
                                statusClass = 'locked'; // Waiting for reveal
                            }
                            else if (isReveal) {
                                if (key === currentQ?.correct_answer) {
                                    statusClass = 'correct blink-green'; // Reveal correct
                                } else if (selectedAnswer === key) {
                                    statusClass = 'wrong'; // Reveal wrong for me
                                }
                            }

                            // Find players who picked this answer (only show on reveal)
                            const pickedBy = isReveal ? players.filter(p => p.selected_answer === key) : [];

                            return (
                                <div key={key} style={{ position: 'relative' }}>
                                    <button
                                        className={`bilionar-option-btn ${statusClass}`}
                                        onClick={() => handleSelectOption(key)}
                                        disabled={selectedAnswer !== null || gameState.phase !== 'answering'}
                                    >
                                        <div className="option-letter">{key}:</div>
                                        <div className="option-text">{optionText}</div>
                                    </button>

                                    {/* Player Color Indicators */}
                                    {isReveal && pickedBy.length > 0 && (
                                        <div className="player-choice-indicators">
                                            {pickedBy.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="choice-dot shadow-pop"
                                                    style={{ backgroundColor: p.color || '#ffffff' }}
                                                    title={p.player_name}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
                <button className="danger" onClick={onLeave} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Opustiť (Dev)</button>
            </div>
        </div>
    );
};
