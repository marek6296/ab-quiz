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
                        newState.phase_end = now + 4000; // 4s to read question
                        // Host resets answers
                        supabase.from('bilionar_players').update({
                            has_answered: false,
                            selected_answer: null,
                            last_answer_time: null,
                            last_score_gained: null
                        }).eq('game_id', activeGame.id).then();
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
                        newState.phase_end = now + 1000; // 1s dramatic pause (keep it short)
                        break;
                    case 'reveal_pause':
                        newState.phase = 'reveal_results';
                        newState.phase_end = now + 5000; // 5s showing correct answer & colors
                        break;
                    case 'reveal_results':
                        newState.phase = 'recap_answers';
                        newState.phase_end = now + 3000; // 3s showing who answered what and how fast
                        break;
                    case 'recap_answers':
                        newState.phase = 'recap_scores';
                        newState.phase_end = now + 4000; // 4s animating points and leaderboard
                        break;
                    case 'recap_scores':
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
                const myPlayer = players.find(p => p.user_id === user.id);
                if (myPlayer) {
                    if (selectedAnswer === currentQ?.correct_answer) {
                        const timeTaken = myPlayer.last_answer_time || (10 - visualTime);
                        const timeLeft = Math.max(0, 10 - timeTaken);
                        // Max 1000 pts base + up to 1000 pts based on speed (10s max)
                        const pts = Math.max(100, Math.floor(timeLeft * 100));
                        setScoreGained(pts);
                        supabase.from('bilionar_players').update({ score: myPlayer.score + pts, last_score_gained: pts }).eq('id', myPlayer.id).then();
                    } else {
                        supabase.from('bilionar_players').update({ last_score_gained: 0 }).eq('id', myPlayer.id).then();
                    }
                }

                // 2. AWARD BOT SCORE (Host only)
                if (isHost && players.some(p => p.is_bot)) {
                    players.filter(p => p.is_bot).forEach(bot => {
                        let botPts = 0;
                        if (bot.selected_answer === currentQ?.correct_answer) {
                            const timeTaken = bot.last_answer_time || 5;
                            const botTimeLeft = Math.max(0, 10 - timeTaken);
                            botPts = Math.max(100, Math.floor(botTimeLeft * 100));
                        }
                        supabase.from('bilionar_players').update({ score: bot.score + botPts, last_score_gained: botPts }).eq('id', bot.id).then();
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
            const delayMs = botLvl === 1 ? (Math.random() * 6000 + 4000) : (botLvl === 2 ? (Math.random() * 4000 + 1500) : (Math.random() * 2000 + 500));
            const timeTakenSecs = parseFloat((delayMs / 1000).toFixed(2));

            const prob = botLvl === 1 ? 35 : (botLvl === 2 ? 65 : 92);
            const willBeCorrect = (Math.random() * 100) < prob;
            const correctAns = gameState.questions[gameState.current_index]?.correct_answer || 'A';
            let pickedAns = correctAns;

            if (!willBeCorrect) {
                const wrongOptions = ['A', 'B', 'C', 'D'].filter(opt => opt !== correctAns);
                pickedAns = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
            }

            setTimeout(() => {
                if (activeGame?.id) {
                    supabase.from('bilionar_players').update({
                        has_answered: true,
                        selected_answer: pickedAns,
                        last_answer_time: timeTakenSecs
                    }).eq('id', bot.id).then();
                }
            }, delayMs);
        });
    }, [gameState.phase, gameState.current_index, isHost, players, activeGame.id, gameState.questions]);

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
        if (gameState.phase !== 'answering') return;
        if (selectedAnswer !== null) return;
        setSelectedAnswer(key);

        // Update DB so others see you have answered
        const myPlayer = players.find(p => p.user_id === user.id);
        if (myPlayer) {
            const timeTakenSecs = parseFloat((10 - visualTime).toFixed(2));
            supabase.from('bilionar_players').update({
                has_answered: true,
                selected_answer: key,
                last_answer_time: timeTakenSecs
            }).eq('id', myPlayer.id).then();
        }
    };

    // UI Renders
    const renderPlayerAvatar = (p) => {
        const isMe = p.user_id === user.id;
        const showAnswered = p.has_answered && gameState.phase === 'answering';

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
                    <h2>Vitajte</h2>
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

    if (gameState.phase === 'post_question_pause') {
        return (
            <div key="phase_post_question_pause" className="bilionar-board relative-board">
                <div className="bilionar-top-bar absolute-top">
                    {players.map(renderPlayerAvatar)}
                </div>
                {/* Screen is empty, previous question hides before the "Next question" modal */}
            </div>
        );
    }

    const currentQ = gameState.questions?.[gameState.current_index];

    if (gameState.phase === 'recap_answers') {
        const answeredPlayers = [...players].filter(p => p.has_answered).sort((a, b) => (a.last_answer_time || 99) - (b.last_answer_time || 99));
        return (
            <div key="phase_recap_answers" className="bilionar-board fullscreen-flex">
                <div className="message-modal slide-in-scale" style={{ width: '90%', maxWidth: '800px', background: 'rgba(2, 6, 23, 0.95)', border: '2px solid #3b82f6' }}>
                    <h2 style={{ marginBottom: '2rem', fontSize: '2.5rem', color: '#facc15' }}>Rýchlosť odpovedí</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {answeredPlayers.map((p, i) => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1.5rem 2rem', borderRadius: '8px', borderLeft: i === 0 ? '6px solid #facc15' : '6px solid transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    <span style={{ fontWeight: '900', fontSize: '2rem', color: i === 0 ? '#facc15' : '#94a3b8' }}>{i + 1}.</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.8rem', color: '#fff' }}>{p.player_name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>{p.selected_answer || '-'}</span>
                                    <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff' }}>{(p.last_answer_time || 0).toFixed(2)}s</span>
                                    {(p.last_score_gained !== null && p.last_score_gained !== undefined) && (
                                        <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: p.last_score_gained > 0 ? '#4ade80' : '#ef4444', marginLeft: '1rem' }}>
                                            {p.last_score_gained > 0 ? '+' : ''}{p.last_score_gained}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (gameState.phase === 'recap_scores') {
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        return (
            <div key="phase_recap_scores" className="bilionar-board fullscreen-flex">
                <div className="message-modal slide-in-scale" style={{ width: '90%', maxWidth: '800px', background: 'rgba(2, 6, 23, 0.95)', border: '2px solid #3b82f6' }}>
                    <h2 style={{ marginBottom: '2rem', fontSize: '2.5rem', color: '#facc15' }}>Priebežné skóre</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {sortedPlayers.map((p, i) => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1.5rem 2rem', borderRadius: '8px', borderLeft: i === 0 ? '6px solid #facc15' : '6px solid transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    <span style={{ fontWeight: '900', fontSize: '2rem', color: i === 0 ? '#facc15' : '#94a3b8' }}>{i + 1}.</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.8rem', color: '#fff' }}>{p.player_name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                    {(p.last_score_gained > 0) && (
                                        <span className="animate-fade-up" style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.5rem', textShadow: '0 0 10px #4ade80' }}>+{p.last_score_gained}</span>
                                    )}
                                    <span style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff' }}>{p.score}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // --- QUESTION PHASES (showing_question_only, answering, time_up, reveal_pause, reveal_results) ---

    // Don't render full screen replaces for these phases anymore
    // (reveal_pause, time_up) fall through so the question stays on screen

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

                {/* Timer Area - Always render to keep size, hide visually if question only */}
                <div
                    className={`bilionar-timer-wrapper ${isQuestionOnly ? 'opacity-0' : 'animate-fade-in'}`}
                    style={{ visibility: isQuestionOnly ? 'hidden' : 'visible', opacity: isQuestionOnly ? 0 : 1 }}
                >
                    <div className="bilionar-timer-circle" style={{
                        background: `conic-gradient(#ef4444 ${((gameState.phase === 'answering' ? visualTime : 0) / 10) * 360}deg, transparent 0deg)`
                    }}>
                        <div className="bilionar-timer-inner">
                            {gameState.phase === 'answering' ? visualTime : 0}
                        </div>
                    </div>
                </div>

                {/* Question Area */}
                <div className="bilionar-question-container">
                    <div className="bilionar-question-box animate-slide-down">
                        <span className="question-number">Otázka {gameState.current_index + 1}/{totalQ}</span>
                        <h2>{currentQ?.question_text}</h2>
                    </div>
                </div>

                {/* Options Area - Always render to keep size bounds */}
                <div
                    className={`bilionar-options-grid ${isQuestionOnly ? 'opacity-0' : 'animate-fade-up'}`}
                    style={{ visibility: isQuestionOnly ? 'hidden' : 'visible', opacity: isQuestionOnly ? 0 : 1 }}
                >
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

                        // Find players who picked this answer (only show on reveal) excluding myself
                        const pickedBy = isReveal ? players.filter(p => p.selected_answer === key && p.user_id !== user.id) : [];

                        return (
                            <div key={key} style={{ position: 'relative' }}>
                                <button
                                    className={`bilionar-option-btn ${statusClass}`}
                                    onClick={() => handleSelectOption(key)}
                                    disabled={selectedAnswer !== null || gameState.phase !== 'answering'}
                                >
                                    <div className="option-letter">{key}:</div>
                                    <div className="option-text" style={{ textAlign: 'left' }}>{optionText}</div>

                                    {isReveal && pickedBy.length > 0 && (
                                        <div style={{ display: 'flex', gap: '4px', marginLeft: '10px', marginRight: '20px', flexWrap: 'wrap', maxWidth: '120px', justifyContent: 'flex-end' }}>
                                            {pickedBy.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="choice-dot shadow-pop"
                                                    style={{ backgroundColor: p.color || '#ffffff', flexShrink: 0 }}
                                                    title={p.player_name}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

            </div>

            <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
                <button className="danger" onClick={onLeave} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Opustiť (Dev)</button>
            </div>

            {/* OVERLAYS FOR QUESTION PHASES */}
            {gameState.phase === 'time_up' && (
                <div className="fullscreen-flex" style={{ background: 'transparent', pointerEvents: 'none' }}>
                    <div className="message-modal dramatic-pop">
                        <h2>Koniec časového limitu</h2>
                    </div>
                </div>
            )}
        </div>
    );
};
