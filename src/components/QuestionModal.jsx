import React, { useState, useEffect } from 'react';
import { isAnswerCorrect } from '../utils/stringUtils';

export const QuestionModal = ({ question, hexId, currentPlayer, gameMode, onClose, onResolve, localPlayerNum, playerNames }) => {
    const [phase, setPhase] = useState('reveal');
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(10);

    const opponent = currentPlayer === 1 ? 2 : 1;
    const isLocalPrimary = gameMode !== '1v1_online' || currentPlayer === localPlayerNum;
    const isLocalSecondary = gameMode !== '1v1_online' || opponent === localPlayerNum;

    const isCpuPrimaryTurn = gameMode === '1vcpu' && currentPlayer === 2 && phase === 'currentPlayer';
    const isCpuSecondaryTurn = gameMode === '1vcpu' && opponent === 2 && phase === 'opponent';

    const currentPlayerName = currentPlayer === 1 ? playerNames.player1 : playerNames.player2;
    const opponentName = opponent === 1 ? playerNames.player1 : playerNames.player2;

    const currentPlayerColor = currentPlayer === 1 ? 'Modrý' : 'Oranžový';
    const opponentColor = opponent === 1 ? 'Modrý' : 'Oranžový';

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

    const renderFeedback = (title, message, isSuccess) => (
        <div className={`feedback-overlay ${isSuccess ? 'success-pulse' : 'error-pulse'}`} style={{ animation: 'feedbackPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <h2 style={{ color: isSuccess ? '#4ade80' : '#ef4444', fontSize: '2.5rem', marginBottom: '1rem' }}>{title}</h2>
            <p style={{ fontSize: '1.5rem', color: '#fff' }}>{message}</p>
            {!isSuccess && <p style={{ fontSize: '1.2rem', color: '#94a3b8', marginTop: '1rem' }}>Správna odpoveď: <strong>{question.answer}</strong></p>}
        </div>
    );

    // Reset state on new question
    useEffect(() => {
        setPhase('reveal');
        setInputValue('');
        setErrorMsg('');
        setTimeLeft(10);

        // Auto transition after reveal animation
        const timer = setTimeout(() => {
            setPhase('currentPlayer');
            // Explicitly ensure 10 seconds starts NOW
            setTimeLeft(10);
        }, 1800);
        return () => clearTimeout(timer);
    }, [question]);

    // CPU Logic
    useEffect(() => {
        let timeout;
        const thinkTime = Math.floor(Math.random() * 3000) + 4000; // 4 to 7 seconds

        if (isCpuPrimaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.3; // 70% chance to know
                if (isCorrect) {
                    setPhase('feedbackPrimaryCorrect');
                    setTimeout(() => onResolve('player2'), 2500);
                } else {
                    setPhase('feedbackPrimaryIncorrect');
                    setTimeout(() => {
                        setPhase('opponent'); // CPU didn't know, pass
                        setInputValue('');
                        setErrorMsg('');
                        setTimeLeft(10);
                    }, 2500);
                }
            }, thinkTime);
        } else if (isCpuSecondaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.5; // 50% chance to steal
                if (isCorrect) {
                    setPhase('feedbackSecondaryCorrect');
                    setTimeout(() => onResolve('player2'), 2500);
                } else {
                    setPhase('feedbackSecondaryBlack');
                    setTimeout(() => onResolve('black'), 2500);
                }
            }, thinkTime);
        }
        return () => clearTimeout(timeout);
    }, [isCpuPrimaryTurn, isCpuSecondaryTurn, onResolve]);

    // Timer Logic - Unified for both phases (High Precision 100ms)
    useEffect(() => {
        const isCpuAuto = phase === 'currentPlayer' ? isCpuPrimaryTurn : isCpuSecondaryTurn;

        if ((phase === 'currentPlayer' || phase === 'opponent') && !isCpuAuto) {
            const step = 0.1;
            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    const next = Math.max(0, prev - step);

                    // Use a slightly lower threshold to avoid float precision issues during decrement
                    if (next < 0.01) {
                        clearInterval(timer);

                        // Small delay so the bar hits actually 0 before overlay pops
                        setTimeout(() => {
                            if (phase === 'currentPlayer') {
                                setPhase('feedbackPrimaryTime');
                                setTimeout(() => {
                                    setPhase('opponent');
                                    setInputValue('');
                                    setErrorMsg('');
                                    setTimeLeft(10);
                                }, 2500);
                            } else {
                                setPhase('feedbackSecondaryBlackTime');
                                setTimeout(() => onResolve('black'), 2500);
                            }
                        }, 100);

                        return 0;
                    }
                    return next;
                });
            }, 100);
            return () => clearInterval(timer);
        }
    }, [phase, isCpuPrimaryTurn, isCpuSecondaryTurn, isLocalPrimary, isLocalSecondary, onResolve]);

    if (!question) return null;

    const handleSubmitPrimary = () => {
        if (!inputValue.trim()) return;

        if (isAnswerCorrect(inputValue, question.answer)) {
            setPhase('feedbackPrimaryCorrect');
            setTimeout(() => onResolve(`player${currentPlayer}`), 2500);
        } else {
            setPhase('feedbackPrimaryIncorrect');
            setTimeout(() => {
                setPhase('opponent');
                setInputValue('');
                setErrorMsg('');
                setTimeLeft(10);
            }, 2500);
        }
    };

    const handleSubmitSecondary = () => {
        if (!inputValue.trim()) return;

        if (isAnswerCorrect(inputValue, question.answer)) {
            setPhase('feedbackSecondaryCorrect');
            setTimeout(() => onResolve(`player${opponent}`), 2500);
        } else {
            setPhase('feedbackSecondaryBlackIncorrect');
            setTimeout(() => onResolve('black'), 2500);
        }
    };

    const handleDeclineSecondary = () => {
        setPhase('feedbackSecondaryBlack');
        setTimeout(() => onResolve('black'), 2500);
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
                        <div className="question-text">{question.text}</div>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Na ťahu je: {currentPlayerName} ({currentPlayerColor})
                        </h3>
                        {/* Timer Bar for primary player */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 10) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
                        </div>
                        <p style={{ marginBottom: '1rem' }}>{timeLeft.toFixed(1)} sekúnd zostáva!</p>

                        {isCpuPrimaryTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU premýšľa nad odpoveďou...</p>
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
                {phase === 'feedbackPrimaryCorrect' && renderFeedback('Správne!', `${currentPlayerName} získava pole!`, true)}
                {phase === 'feedbackPrimaryIncorrect' && renderFeedback('Nesprávne!', `${currentPlayerName} neodpovedal správne. Šancu dostane súper!`, false)}
                {phase === 'feedbackPrimaryTime' && renderFeedback('Čas Vypršal!', `${currentPlayerName} nestihol odpovedať včas. Šancu získa súper!`, false)}

                {/* Secondary Guess Phase (Opponent Chance) */}
                {phase === 'opponent' && (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <div className="question-text">{question.text}</div>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: {opponentName} ({opponentColor})
                        </h3>

                        {/* Timer Bar */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 10) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
                        </div>
                        <p style={{ marginBottom: '1rem' }}>{timeLeft.toFixed(1)} sekúnd do konca!</p>

                        {isCpuSecondaryTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU sa snaží využiť šancu a premýšľa...</p>
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

                {/* Feedback Secondary */}
                {phase === 'feedbackSecondaryCorrect' && renderFeedback('Správne!', `${opponentName} využil šancu a získava pole!`, true)}
                {phase === 'feedbackSecondaryBlack' && renderFeedback('Šanca Nevyužitá!', 'Pole sa zafarbí na čierno.', false)}
                {phase === 'feedbackSecondaryBlackIncorrect' && renderFeedback('Nesprávne!', `${opponentName} nevyužil šancu. Pole bude čierne.`, false)}
                {phase === 'feedbackSecondaryBlackTime' && renderFeedback('Čas Vypršal!', `${opponentName} nestihol odpovedať. Pole bude čierne.`, false)}

            </div>
        </div>
    );
};
