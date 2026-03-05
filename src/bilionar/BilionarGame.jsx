import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const BilionarGame = ({ activeGame, players, onLeave, gameChannel, onSetGame }) => {
    const { user } = useAuth();

    // Directly use props as the SINGLE Source of Truth. No local shadow states!
    const gameState = activeGame?.state || { phase: 'init' };
    const isHost = activeGame?.host_id === user?.id;

    // Local UI State
    const [visualTime, setVisualTime] = useState(15);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [scoreGained, setScoreGained] = useState(null);
    const awardedIndex = useRef(-1);
    const [showExitConfirm, setShowExitConfirm] = useState(false);

    // Auto-leave if opponent abandoned
    // useEffect(() => {
    //     if (gameState.phase === 'finished' && gameState.win_reason === 'opponent_abandoned') {
    //         const t = setTimeout(() => {
    //             onLeave();
    //         }, 5000);
    //         return () => clearTimeout(t);
    //     }
    // }, [gameState.phase, gameState.win_reason, onLeave]);

    const gameStateRef = useRef(gameState);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    // 1.5 Host Migration & Auto-Victory Fallback Drop-in
    useEffect(() => {
        if (!players.length || !user || !activeGame) return;
        const hostStillHere = players.some(p => p.user_id === activeGame.host_id);
        const realPlayers = players.filter(p => !p.is_bot);
        const realPlayersCount = realPlayers.length;

        // Auto Victory Check (Any Real Client can trigger this if they notice they are the only one left after a true multiplayer start)
        // We look at activeGame.state.max_real_players which the host updates as long as they are alive.
        // CRITICAL: Only the REMAINING player should trigger and see this. The leaving player's client should NOT trigger its own victory.
        const amIStillAlive = players.some(p => p.user_id === user.id);
        if (amIStillAlive && activeGame.state?.max_real_players >= 2 && realPlayersCount <= 1 && gameState.phase !== 'finished') {
            const finishState = { ...gameState, phase: 'finished', phase_end: Date.now() + 9999999, win_reason: 'opponent_abandoned' };
            supabase.from('bilionar_games').update({ status: 'completed', state: finishState }).eq('id', activeGame.id).then();
        }

        // Host Migration (if Host disappeared, lowest string user_id takes over)
        if (!hostStillHere && realPlayersCount > 0 && gameState.phase !== 'finished' && activeGame.status === 'playing') {
            const nextHostId = [...realPlayers].sort((a, b) => a.user_id.localeCompare(b.user_id))[0].user_id;
            if (nextHostId === user.id) {
                console.log("Host migration: I am the new host!");
                supabase.from('bilionar_games').update({ host_id: user.id }).eq('id', activeGame.id).then();
            }
        }
    }, [players, activeGame.host_id, user, activeGame.state?.max_real_players, gameState.phase, activeGame.status]);

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

                const { data: questions, error } = await supabase.rpc('get_random_bilionar_questions', {
                    limit_num: limitCount,
                    categories_filter: cats,
                    difficulty_filter: diffs
                });

                if (!active) return;

                let finalQuestions = questions;
                if (error || !questions || questions.length === 0) {
                    const { data: fallbackQ } = await supabase.from('bilionar_questions').select('*').limit(limitCount);
                    finalQuestions = fallbackQ;
                }

                if (!finalQuestions || finalQuestions.length === 0) {
                    const errorState = { phase: 'no_questions' };
                    onSetGame(prev => ({ ...prev, state: errorState }));
                    supabase.from('bilionar_games').update({ state: errorState }).eq('id', activeGame.id).then();
                    return;
                }

                const startState = {
                    questions: finalQuestions,
                    current_index: 0,
                    phase: 'big_intro',
                    phase_end: Date.now() + 3000
                };

                onSetGame(prev => ({ ...prev, state: startState }));
                await supabase.from('bilionar_games').update({ state: startState }).eq('id', activeGame.id);

                if (gameChannel) {
                    gameChannel.send({
                        type: 'broadcast',
                        event: 'phase_change',
                        payload: { state: startState }
                    });
                }
            };
            initGame();
            // DO NOT RETURN HERE - otherwise the ticker is never created for the rest of the game!
        }

        const ticker = setInterval(() => {
            const current = gameStateRef.current;
            const now = Date.now();

            if (current.phase_end && now >= current.phase_end) {
                let newState = { ...current };

                switch (current.phase) {
                    case 'big_intro':
                        newState.phase = 'welcome';
                        newState.phase_end = now + 6000;
                        break;
                    case 'welcome':
                        newState.phase = 'prepare_first';
                        newState.phase_end = now + 6000;
                        break;
                    case 'prepare_first':
                    case 'prepare_next':
                    case 'post_question_pause':
                        newState.phase = 'showing_question_only';
                        newState.phase_end = now + 4000;
                        supabase.from('bilionar_players').update({
                            has_answered: false,
                            selected_answer: null,
                            last_answer_time: null,
                            last_score_gained: null
                        }).eq('game_id', activeGame.id).then();
                        break;
                    case 'showing_question_only':
                        newState.phase = 'answering';
                        newState.phase_end = now + 10000;
                        break;
                    case 'answering':
                        newState.phase = 'time_up';
                        newState.phase_end = now + 2000;
                        break;
                    case 'time_up':
                        newState.phase = 'reveal_pause';
                        newState.phase_end = now + 1000;
                        break;
                    case 'reveal_pause':
                        newState.phase = 'reveal_results';
                        newState.phase_end = now + 5000;
                        break;
                    case 'reveal_results':
                        newState.phase = 'recap_answers';
                        newState.phase_end = now + 3000;
                        break;
                    case 'recap_answers':
                        newState.phase = 'recap_scores';
                        newState.phase_end = now + 4000;
                        break;
                    case 'recap_scores':
                        if (current.current_index < (current.questions?.length - 1)) {
                            newState.phase = 'post_question_pause';
                            newState.phase_end = now + 2000;
                            newState.current_index += 1;
                        } else {
                            newState.phase = 'finished';
                            newState.phase_end = now + 9999999;
                        }
                        break;
                }

                if (current.phase === 'post_question_pause' && current.current_index > 0) {
                    newState.phase = 'prepare_next';
                    newState.phase_end = now + 6000;
                }

                // Auto-victory condition: If game started with > 1 real player and now <= 1 remains
                // Only trigger this if we are not already finished
                if (newState.phase !== 'finished' && newState.phase !== 'init' && newState.phase !== 'no_questions') {
                    const realPlayersCount = playersRef.current.filter(p => !p.is_bot).length;

                    // Keep track of the maximum number of real players we have ever seen in this session
                    if (realPlayersCount > (current.max_real_players || 0)) {
                        newState.max_real_players = realPlayersCount;
                    }

                    // If we ever had 2+ people, and now we only have 1 (or 0), end the game
                    if (newState.max_real_players >= 2 && realPlayersCount <= 1) {
                        newState.phase = 'finished';
                        newState.phase_end = now + 9999999;
                        newState.win_reason = 'opponent_abandoned';
                        console.log("Game over: Not enough players remaining.");
                    }
                }

                if (newState.phase !== current.phase) {
                    console.log("Host advancing phase to:", newState.phase);
                    onSetGame(prev => ({ ...prev, state: newState }));

                    // Mark game as fully completed in DB if it ended (avoids zombie games)
                    if (newState.phase === 'finished') {
                        supabase.from('bilionar_games').update({ status: 'completed', state: newState }).eq('id', activeGame.id).then();
                    } else {
                        supabase.from('bilionar_games').update({ state: newState }).eq('id', activeGame.id).then();
                    }

                    if (gameChannel) {
                        gameChannel.send({
                            type: 'broadcast',
                            event: 'phase_change',
                            payload: { state: newState }
                        });
                    }
                }
            }
        }, 1000);

        return () => {
            active = false;
            clearInterval(ticker);
        };
    }, [isHost, activeGame.id, gameChannel]); // Stable dependencies for the ticker

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

    // --- RENDER LOGIC ---

    // 1. Critical Error/Status States (Full Screen)
    if (gameState.phase === 'init') {
        return <div className="bilionar-board fullscreen-flex"><div className="message-modal"><h2>Pripravujem otázky...</h2></div></div>;
    }
    if (gameState.phase === 'no_questions') {
        return (
            <div className="bilionar-board fullscreen-flex">
                <div className="message-modal dramatic-pop">
                    <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Žiadne otázky v databáze!</h2>
                    <p style={{ color: 'white', marginBottom: '2rem' }}>Prosím prejdite do Administrácie a vygenerujte AI otázky.</p>
                    <button className="neutral" onClick={onLeave} style={{ padding: '1rem 3rem' }}>Späť do Menu</button>
                </div>
            </div>
        );
    }
    if (gameState.phase === 'finished') {
        if (gameState.win_reason === 'opponent_abandoned') {
            return (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(10px)',
                    zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    <div className="winner-banner" style={{ animation: 'bounceIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)', marginBottom: '1.5rem' }}>
                        Vyhrávate!
                    </div>

                    <div style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '0.8rem 1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        Súper opustil hru, vyhrávate kontumačne.
                    </div>

                    <button
                        className="primary"
                        onClick={onLeave}
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            padding: '1.2rem 3rem',
                            fontSize: '1.3rem',
                            borderRadius: '16px',
                            boxShadow: '0 10px 25px -5px rgba(16,185,129,0.3)',
                            border: '1px solid rgba(255,255,255,0.2)'
                        }}
                    >
                        Opustiť Hru
                    </button>
                </div>
            );
        }

        return (
            <div className="bilionar-board fullscreen-flex" style={{ background: 'radial-gradient(circle at center, #1e1b4b 0%, #020617 100%)' }}>
                <h1 className="logo-brutal animate-fade-in" style={{ fontSize: '4rem', marginBottom: '2rem' }}>KONIEC HRY</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
                    {players.map((p, i) => (
                        <div key={p.id} className="animate-fade-up" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.2rem', background: i === 0 ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.05)', border: i === 0 ? '2px solid #facc15' : '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', alignItems: 'center', animationDelay: `${i * 0.1}s` }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '1.5rem', fontWeight: '900', color: i === 0 ? '#facc15' : '#94a3b8' }}>#{i + 1}</span>
                                <span style={{ fontWeight: 'bold' }}>{p.player_name}</span>
                            </div>
                            <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.4rem' }}>{p.score} b</span>
                        </div>
                    ))}
                </div>
                <button className="primary" onClick={onLeave} style={{ marginTop: '3rem', padding: '1.2rem 4rem', fontSize: '1.2rem' }}>Späť do Menu</button>
            </div>
        );
    }

    // 2. Main Game Body
    const totalQ = gameState.questions?.length || 10;
    const currentQ = gameState.questions?.[gameState.current_index];
    const isQuestionOnly = gameState.phase === 'showing_question_only';
    const isReveal = gameState.phase === 'reveal_results';

    const isBoardVisible = ['showing_question_only', 'answering', 'time_up', 'reveal_pause', 'reveal_results'].includes(gameState.phase);

    return (
        <div className="bilionar-board relative-board">

            {/* Exit Confirm Modal */}
            {showExitConfirm && (
                <div className="modal-overlay" style={{ zIndex: 10001, background: 'rgba(5, 10, 20, 0.9)', backdropFilter: 'blur(8px)', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content glass-panel" style={{ textAlign: 'center', padding: '2.5rem', maxWidth: '450px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px' }}>
                        <h2 style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '2rem' }}>Opustiť hru?</h2>
                        <p style={{ fontSize: '1.2rem', margin: '0 0 2.5rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                            Ste si istý, že chcete ukončiť aktuálny súboj? <br />
                            <strong>Váš postup bude stratený.</strong>
                        </p>
                        <div className="modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={onLeave} style={{ minWidth: '140px', background: '#ef4444', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                Áno, skončiť
                            </button>
                            <button onClick={() => setShowExitConfirm(false)} style={{ minWidth: '140px', background: '#38bdf8', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                Zostať v hre
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Abandon Game Button */}
            <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 200 }}>
                <button
                    onClick={() => setShowExitConfirm(true)}
                    style={{
                        background: 'rgba(239, 68, 68, 0.8)',
                        color: 'white',
                        border: '1px solid #ef4444',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                    onMouseOver={(e) => e.target.style.background = '#ef4444'}
                    onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.8)'}
                >
                    ❌ Opustiť
                </button>
            </div>

            {/* Persistant Top Bar */}
            <div className="bilionar-top-bar absolute-top">
                {players.map(renderPlayerAvatar)}
            </div>

            <div className="bilionar-main-content">

                {/* PHASE: Big Intro, Welcome, Preparations (Full Overlays over game board) */}
                {gameState.phase === 'big_intro' && (
                    <div className="fullscreen-flex" style={{ zIndex: 100 }}>
                        <h1 className="logo-brutal massive-entrance">Bilionár Battle</h1>
                    </div>
                )}

                {gameState.phase === 'welcome' && (
                    <div className="fullscreen-flex" style={{ zIndex: 100 }}>
                        <div className="message-modal slide-in-scale">
                            <h2>Vitajte</h2>
                        </div>
                    </div>
                )}

                {(gameState.phase === 'prepare_first' || gameState.phase === 'prepare_next') && (
                    <div className="fullscreen-flex" style={{ zIndex: 100 }}>
                        <div className="message-modal slide-in-scale">
                            <h2>{gameState.phase === 'prepare_first' ? 'Pripravte sa na prvú otázku' : 'Ideme na ďalšiu otázku'}</h2>
                        </div>
                    </div>
                )}

                {/* PHASE: Recap Answers */}
                {gameState.phase === 'recap_answers' && (
                    <div className="fullscreen-flex" style={{ zIndex: 105, background: 'rgba(2, 6, 23, 0.9)' }}>
                        <div className="message-modal slide-in-scale" style={{ width: '90%', maxWidth: '800px' }}>
                            <h2 style={{ marginBottom: '2rem', fontSize: '2.5rem', color: '#facc15' }}>Rýchlosť odpovedí</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                                {[...players].filter(p => p.has_answered).sort((a, b) => (a.last_answer_time || 99) - (b.last_answer_time || 99)).map((p, i) => (
                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem 1.5rem', borderRadius: '12px', borderLeft: i === 0 ? '6px solid #facc15' : '6px solid transparent' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <span style={{ fontWeight: '900', fontSize: '1.5rem', color: i === 0 ? '#facc15' : '#94a3b8' }}>{i + 1}.</span>
                                            <span style={{ fontWeight: 'bold' }}>{p.player_name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                            <span style={{ fontWeight: 'bold', color: '#facc15' }}>{p.selected_answer}</span>
                                            <span style={{ fontWeight: '900' }}>{(p.last_answer_time || 0).toFixed(2)}s</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* PHASE: Recap Scores */}
                {gameState.phase === 'recap_scores' && (
                    <div className="fullscreen-flex" style={{ zIndex: 105, background: 'rgba(2, 6, 23, 0.9)' }}>
                        <div className="message-modal slide-in-scale" style={{ width: '90%', maxWidth: '800px' }}>
                            <h2 style={{ marginBottom: '2rem', fontSize: '2.5rem', color: '#facc15' }}>Priebežné skóre</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem 1.5rem', borderRadius: '12px', borderLeft: i === 0 ? '6px solid #facc15' : '6px solid transparent' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <span style={{ fontWeight: '900', fontSize: '1.5rem', color: i === 0 ? '#facc15' : '#94a3b8' }}>{i + 1}.</span>
                                            <span style={{ fontWeight: 'bold' }}>{p.player_name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                            {p.last_score_gained > 0 && <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+{p.last_score_gained}</span>}
                                            <span style={{ fontSize: '2rem', fontWeight: '900' }}>{p.score}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ACTIVE GAME BOARD (Hidden cleanly during intro/recap phases) */}
                <div style={{ display: isBoardVisible ? 'contents' : 'none' }}>
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

                    <div className="bilionar-question-container">
                        <div className="bilionar-question-box animate-slide-down">
                            <span className="question-number">Otázka {gameState.current_index + 1}/{totalQ}</span>
                            <h2>{currentQ?.question_text || 'Načítavam otázku...'}</h2>
                        </div>
                    </div>

                    <div
                        className={`bilionar-options-grid ${isQuestionOnly ? 'opacity-0' : 'animate-fade-up'}`}
                        style={{ visibility: isQuestionOnly ? 'hidden' : 'visible', opacity: isQuestionOnly ? 0 : 1 }}
                    >
                        {['A', 'B', 'C', 'D'].map((key) => {
                            const optionText = currentQ?.[`option_${key.toLowerCase()}`];
                            let statusClass = '';

                            let fontScale = 1;
                            if (optionText) {
                                if (optionText.length > 55) fontScale = 0.65;
                                else if (optionText.length > 35) fontScale = 0.75;
                                else if (optionText.length > 20) fontScale = 0.85;
                            }

                            if (gameState.phase === 'answering' && selectedAnswer === key) statusClass = 'locked';
                            else if (isReveal) {
                                if (key === currentQ?.correct_answer) statusClass = 'correct blink-green';
                                else if (selectedAnswer === key) statusClass = 'wrong';
                            }

                            const pickedBy = isReveal ? players.filter(p => p.selected_answer === key && p.user_id !== user.id) : [];

                            return (
                                <div key={key} style={{ position: 'relative', display: 'flex', height: '100%' }}>
                                    <button
                                        className={`bilionar-option-btn ${statusClass} ${key === 'A' || key === 'C' ? 'opt-left' : 'opt-right'}`}
                                        style={{ flex: 1, '--font-scale': fontScale }}
                                        onClick={() => handleSelectOption(key)}
                                        disabled={selectedAnswer !== null || gameState.phase !== 'answering'}
                                    >
                                        <div className="option-letter">{key}:</div>
                                        <div className="option-text" style={{ textAlign: 'left' }}>{optionText}</div>

                                        {isReveal && pickedBy.length > 0 && (
                                            <div style={{ display: 'flex', gap: '4px', marginLeft: '10px', flexWrap: 'wrap', maxWidth: '120px', justifyContent: 'flex-end' }}>
                                                {pickedBy.map(p => (
                                                    <div key={p.id} className="choice-dot shadow-pop" style={{ backgroundColor: p.color || '#ffffff' }} title={p.player_name} />
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};
