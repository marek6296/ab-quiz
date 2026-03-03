import React, { useState, useEffect, useRef } from 'react';
import { isAnswerCorrect } from '../utils/stringUtils';
import { useAudio } from '../hooks/useAudio';

export const QuestionModal = ({ question, hexId, currentPlayer, gameMode, gameRules = 'hex', p1Combo = 0, p2Combo = 0, onClose, onResolve, localPlayerNum, playerNames }) => {
    const [phase, setPhase] = useState('reveal');
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(10);
    const [lastAnswer, setLastAnswer] = useState('');

    const { playSound, stopSound } = useAudio();

    const opponent = currentPlayer === 1 ? 2 : 1;
    const isLocalPrimary = gameMode !== '1v1_online' || currentPlayer === localPlayerNum;
    const isLocalSecondary = gameMode !== '1v1_online' || opponent === localPlayerNum;

    const isBotPrimaryTurn = gameMode === '1vbot' && currentPlayer === 2 && phase === 'currentPlayer';
    const isBotSecondaryTurn = gameMode === '1vbot' && opponent === 2 && phase === 'opponent';

    const currentPlayerName = currentPlayer === 1 ? playerNames.player1 : playerNames.player2;
    const opponentName = opponent === 1 ? playerNames.player1 : playerNames.player2;

    const currentPlayerColor = currentPlayer === 1 ? 'Modrý' : 'Oranžový';
    const opponentColor = opponent === 1 ? 'Modrý' : 'Oranžový';

    // Calculate Points
    const calculatePoints = (playerNum, timeRemaining) => {
        if (gameRules !== 'points') return 0;

        let base = 10;
        const timeTaken = 10 - timeRemaining;

        // Speed bonus
        if (timeTaken <= 3) base += 5;
        else if (timeTaken <= 5) base += 3;

        // Combo Multiplier
        const combo = playerNum === 1 ? p1Combo : p2Combo;
        if (combo >= 5) base = Math.floor(base * 2);
        else if (combo >= 3) base = Math.floor(base * 1.5);

        return base;
    };

    const [earnedPoints, setEarnedPoints] = useState(0);

    const renderInput = (onSubmit) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, onSubmit)}
                placeholder="Zadajte odpoveď..."
                autoFocus
                style={{ textAlign: 'center', fontSize: '1.2rem' }}
            />
            {errorMsg && <div style={{ color: '#ef4444', fontWeight: 'bold' }}>{errorMsg}</div>}
        </div>
    );

    const renderFeedback = (title, message, isSuccess, showAnswer = false) => (
        <div className={`feedback-overlay ${isSuccess ? 'success-pulse' : 'error-pulse'}`} style={{ animation: 'feedbackPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <h2 style={{ color: isSuccess ? '#4ade80' : '#ef4444', fontSize: '2.5rem', marginBottom: '1rem' }}>{title}</h2>
            <p style={{ fontSize: '1.5rem', color: '#fff' }}>{message}</p>

            {isSuccess && gameRules === 'points' && earnedPoints > 0 && (
                <div style={{ marginTop: '1rem', fontSize: '2rem', color: '#fbbf24', fontWeight: 'bold', textShadow: '0 2px 10px rgba(251, 191, 36, 0.5)' }}>
                    +{earnedPoints} bodov!
                </div>
            )}

            {(showAnswer || lastAnswer) && (
                <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.08)', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {lastAnswer && (
                        <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: showAnswer ? '1rem' : 0 }}>
                            Zadaná odpoveď: <strong style={{ color: '#fff' }}>{lastAnswer}</strong>
                        </p>
                    )}
                    {showAnswer && (
                        <div style={{ borderTop: lastAnswer ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingTop: lastAnswer ? '1rem' : 0 }}>
                            <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>
                                Správna odpoveď bola:
                            </p>
                            <p style={{ fontSize: '1.4rem', color: '#4ade80', fontWeight: 800, marginTop: '0.25rem' }}>
                                {question.answer}
                            </p>
                        </div>
                    )}
                </div>
            )}
            {showAnswer && <p style={{ marginTop: '2rem', color: '#64748b', fontSize: '0.9rem' }}>Okno sa zavrie o chvíľu...</p>}
        </div>
    );

    // Reset state on new question
    useEffect(() => {
        setPhase('reveal');
        setInputValue('');
        setErrorMsg('');
        setTimeLeft(10);
        setLastAnswer('');

        // Auto transition after reveal animation
        const timer = setTimeout(() => {
            setPhase('currentPlayer');
            // Explicitly ensure 10 seconds starts NOW
            setTimeLeft(10);
        }, 1800);
        return () => clearTimeout(timer);
    }, [question]);

    // Ensure ticking plays during answering, and stops when phase changes
    useEffect(() => {
        if (phase === 'currentPlayer' || phase === 'opponent') {
            playSound('tick');
        } else {
            stopSound('tick');
        }
    }, [phase, playSound, stopSound]);

    // BOT Logic
    useEffect(() => {
        let timeout;
        // In Points mode, the BOT tries to answer slightly faster to get bonuses (2 to 5s)
        // In Hex mode, it takes its time (4 to 7s)
        const thinkTimeBase = gameRules === 'points' ? 2000 : 4000;
        const thinkTimeVar = gameRules === 'points' ? 3000 : 3000;
        const thinkTime = Math.floor(Math.random() * thinkTimeVar) + thinkTimeBase;

        if (isBotPrimaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.3; // 70% chance to know
                if (isCorrect) {
                    playSound('correct');
                    const pts = calculatePoints(2, timeLeft);
                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackPrimaryCorrect');
                    setTimeout(() => onResolve('player2', pts, false), 5000);
                } else {
                    playSound('wrong');
                    setLastAnswer('BOT nevedel odpovedať');
                    setPhase('feedbackPrimaryIncorrect');
                    setTimeout(() => {
                        setPhase('opponent'); // BOT didn't know, pass
                        setInputValue('');
                        setErrorMsg('');
                        setTimeLeft(10);
                        setLastAnswer(''); // Clear for next phase
                    }, 2500);
                }
            }, thinkTime);
        } else if (isBotSecondaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.5; // 50% chance to steal
                if (isCorrect) {
                    playSound('correct');
                    const pts = calculatePoints(2, timeLeft);
                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackSecondaryCorrect');
                    setTimeout(() => onResolve('player2', pts, false), 5000);
                } else {
                    playSound('wrong');
                    setLastAnswer('BOT nevedel odpovedať');
                    setPhase('feedbackSecondaryBlack');
                    setTimeout(() => onResolve('unowned', 0, true), 5000);
                }
            }, thinkTime);
        }
        return () => clearTimeout(timeout);
    }, [isBotPrimaryTurn, isBotSecondaryTurn, onResolve, question.answer]);

    // Timer Logic - Unified for both phases (High Precision 100ms)
    useEffect(() => {
        if (phase === 'currentPlayer' || phase === 'opponent') {
            const step = 0.1;
            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    const next = Math.max(0, prev - step);

                    // We no longer trigger ticking at 3 seconds here. It is handled by the useEffect above.

                    // Use a slightly lower threshold to avoid float precision issues during decrement
                    if (next < 0.01) {
                        clearInterval(timer);

                        // Small delay so the bar hits actually 0 before overlay pops
                        setTimeout(() => {
                            if (phase === 'currentPlayer') {
                                playSound('wrong');
                                setLastAnswer('Čas vypršal');
                                setPhase('feedbackPrimaryTime');
                                setTimeout(() => {
                                    setPhase('opponent');
                                    setInputValue('');
                                    setErrorMsg('');
                                    setTimeLeft(10);
                                    setLastAnswer('');
                                }, 2500);
                            } else {
                                playSound('wrong');
                                setLastAnswer('Čas vypršal');
                                setPhase('feedbackSecondaryBlackTime');
                                setTimeout(() => onResolve('unowned', 0, true), 5000);
                            }
                        }, 100);

                        return 0;
                    }
                    return next;
                });
            }, 100);
            return () => clearInterval(timer);
        }
    }, [phase, onResolve]);

    if (!question) return null;

    const handleSubmitPrimary = () => {
        if (!inputValue.trim()) return;
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question.answer)) {
            playSound('correct');
            const pts = calculatePoints(currentPlayer, timeLeft);
            setEarnedPoints(pts);
            setPhase('feedbackPrimaryCorrect');
            setTimeout(() => onResolve(`player${currentPlayer}`, pts, false), 5000);
        } else {
            playSound('wrong');
            setPhase('feedbackPrimaryIncorrect');
            setTimeout(() => {
                setPhase('opponent');
                setInputValue('');
                setErrorMsg('');
                setTimeLeft(10);
                setLastAnswer(''); // Ready for opponent guess
            }, 2500);
        }
    };

    const handleSubmitSecondary = () => {
        if (!inputValue.trim()) return;
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question.answer)) {
            playSound('correct');
            const pts = calculatePoints(opponent, timeLeft);
            setEarnedPoints(pts);
            setPhase('feedbackSecondaryCorrect');
            setTimeout(() => onResolve(`player${opponent}`, pts, false), 5000);
        } else {
            playSound('wrong');
            setPhase('feedbackSecondaryBlackIncorrect');
            setTimeout(() => onResolve('unowned', 0, true), 5000);
        }
    };

    const handleDeclineSecondary = () => {
        setLastAnswer('Hráč nevyužil šancu');
        setPhase('feedbackSecondaryBlack');
        setTimeout(() => onResolve('unowned', 0, true), 5000);
    };

    const handleKeyDown = (e, callback) => {
        if (e.key === 'Enter') {
            callback();
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                {/* Reveal Phase Animation */}
                {phase === 'reveal' && (
                    <div className="reveal-animation">
                        <div className="reveal-hex">{hexId}</div>
                        <h2 className="reveal-text">Pripravte sa na otázku...</h2>
                    </div>
                )}

                {/* Primary Guess Phase */}
                {phase === 'currentPlayer' && (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <div className="question-text">{question.question_text || question.text}</div>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Na ťahu je: {currentPlayerName} ({currentPlayerColor})
                        </h3>
                        {/* Timer Bar for primary player */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 10) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
                        </div>
                        <p style={{ marginBottom: '1rem' }}>{timeLeft.toFixed(1)} sekúnd zostáva!</p>

                        {isBotPrimaryTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>BOT premýšľa nad odpoveďou...</p>
                        ) : isLocalPrimary ? (
                            <>
                                {renderInput(handleSubmitPrimary)}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button className="primary" onClick={handleSubmitPrimary}>
                                        Odoslať odpoveď
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p style={{ width: '100%', color: '#94a3b8' }}>Čaká sa kým {currentPlayerName} odpovie...</p>
                        )}
                    </div>
                )}

                {/* Feedback Phases for Primary Player */}
                {phase === 'feedbackPrimaryCorrect' && renderFeedback('Správne!', `${currentPlayerName} získava pole!`, true, true)}
                {phase === 'feedbackPrimaryIncorrect' && renderFeedback('Nesprávne!', `${currentPlayerName} neodpovedal správne. Šancu dostane súper!`, false, false)}
                {phase === 'feedbackPrimaryTime' && renderFeedback('Čas Vypršal!', `${currentPlayerName} nestihol odpovedať včas. Šancu získa súper!`, false, false)}

                {/* Secondary Guess Phase (Opponent Chance) */}
                {phase === 'opponent' && (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <div className="question-text">{question.question_text || question.text}</div>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: {opponentName} ({opponentColor})
                        </h3>

                        {/* Timer Bar */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 10) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
                        </div>
                        <p style={{ marginBottom: '1rem' }}>{timeLeft.toFixed(1)} sekúnd do konca!</p>

                        {isBotSecondaryTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>BOT sa snaží využiť šancu a premýšľa...</p>
                        ) : isLocalSecondary ? (
                            <>
                                {renderInput(handleSubmitSecondary)}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button className="secondary" onClick={handleSubmitSecondary}>
                                        Odoslať odpoveď
                                    </button>
                                    <button className="danger" onClick={handleDeclineSecondary}>
                                        Nechcem odpovedať
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p style={{ width: '100%', color: '#94a3b8' }}>Čaká sa kým {opponentName} využije šancu...</p>
                        )}
                    </div>
                )}

                {/* Feedback Secondary - Final States show correct answer for 5s */}
                {phase === 'feedbackSecondaryCorrect' && renderFeedback('Správne!', `${opponentName} využil šancu a získava pole!`, true, true)}
                {phase === 'feedbackSecondaryBlack' && renderFeedback('Šanca Nevyužitá!', 'Pole zostáva voľné pre ďalšie ťahy.', false, true)}
                {phase === 'feedbackSecondaryBlackIncorrect' && renderFeedback('Nesprávne!', `${opponentName} nevyužil šancu. Pole zostáva voľné.`, false, true)}
                {phase === 'feedbackSecondaryBlackTime' && renderFeedback('Čas Vypršal!', `${opponentName} nestihol odpovedať. Pole zostáva voľné.`, false, true)}

            </div>
        </div>
    );
};
