import React, { useState, useEffect, useRef } from 'react';
import { isAnswerCorrect } from '../utils/stringUtils';
import { useAudio } from '../hooks/useAudio';

export const QuestionModal = ({ modalData, onSyncModal, question, hexId, currentPlayer, gameMode, gameRules = 'hex', p1Combo = 0, p2Combo = 0, onClose, onResolve, localPlayerNum, playerNames }) => {
    const [phase, setPhase] = useState('reveal');
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(15);
    const [lastAnswer, setLastAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const phaseStartRef = useRef(Date.now());
    const resolvedRef = useRef(false);

    // Udržanie najaktuálnejšej hodnoty `onResolve`, aby sme nemuseli neustále reštartovať timery.
    const onResolveRef = useRef(onResolve);
    useEffect(() => {
        onResolveRef.current = onResolve;
    }, [onResolve]);

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
        const timeTaken = 15 - timeRemaining;

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

    const renderPlaceholder = (answer) => {
        if (!answer) return null;
        return (
            <div className="placeholder-container">
                {answer.split(' ').map((word, wIdx) => (
                    <span key={wIdx} className="placeholder-word">
                        {word.split('').map((char, cIdx) => (
                            <span key={cIdx} className="placeholder-char">
                                {/[-.']/.test(char) ? char : '_'}
                            </span>
                        ))}
                    </span>
                ))}
            </div>
        );
    };

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
        if (!modalData?.phase || modalData.phase === 'reveal') {
            setPhase('reveal');
            setInputValue('');
            setErrorMsg('');
            setTimeLeft(15);
            setLastAnswer('');

            // Auto transition after reveal animation
            const timer = setTimeout(() => {
                setPhase('currentPlayer');
                // Explicitly ensure 15 seconds starts NOW
                setTimeLeft(15);
                if (isLocalPrimary && onSyncModal) onSyncModal({ phase: 'currentPlayer' });
            }, 1800);
            return () => clearTimeout(timer);
        }
    }, [question, modalData?.phase, isLocalPrimary, onSyncModal]);

    // DB Sync Receiver
    useEffect(() => {
        if (modalData && modalData.phase && modalData.phase !== 'reveal' && modalData.phase !== phase) {
            setPhase(modalData.phase);
            if (modalData.lastAnswer !== undefined) {
                setLastAnswer(modalData.lastAnswer);
            }
            if (modalData.phase === 'opponent') {
                setTimeLeft(15);
                setInputValue('');
                setErrorMsg('');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modalData?.phase, modalData?.lastAnswer]);

    // Ensure ticking plays during answering, and stops when phase changes
    useEffect(() => {
        if (phase === 'currentPlayer' || phase === 'opponent') {
            playSound('tick');
        } else {
            stopSound('tick');
        }
    }, [phase, playSound, stopSound]);

    // Global sound trigger for both players when phase changes
    useEffect(() => {
        if (phase.includes('Correct')) {
            playSound('correct');
        } else if (phase.includes('Incorrect') || phase.includes('Time') || phase === 'feedbackSecondaryBlack') {
            playSound('wrong');
        }
    }, [phase, playSound]);

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
                    const pts = calculatePoints(2, timeLeft);
                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackPrimaryCorrect');
                    setTimeout(() => onResolveRef.current('player2', pts, false), 5000);
                } else {
                    setLastAnswer('BOT nevedel odpovedať');
                    setPhase('feedbackPrimaryIncorrect');
                    setTimeout(() => {
                        setPhase('opponent'); // BOT didn't know, pass
                        setInputValue('');
                        setErrorMsg('');
                        setTimeLeft(15);
                        setLastAnswer(''); // Clear for next phase
                    }, 2500);
                }
            }, thinkTime);
        } else if (isBotSecondaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.5; // 50% chance to steal
                if (isCorrect) {
                    const pts = calculatePoints(2, timeLeft);
                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackSecondaryCorrect');
                    if (!resolvedRef.current) {
                        resolvedRef.current = true;
                        setTimeout(() => onResolveRef.current('player2', pts, false), 5000);
                    }
                } else {
                    setLastAnswer('BOT nevedel odpovedať');
                    setPhase('feedbackSecondaryBlack');
                    if (!resolvedRef.current) {
                        resolvedRef.current = true;
                        setTimeout(() => onResolveRef.current('black', 0, true), 5000);
                    }
                }
            }, thinkTime);
        }
        return () => clearTimeout(timeout);
    }, [isBotPrimaryTurn, isBotSecondaryTurn, question.answer, gameRules, timeLeft]);

    // Timer Logic - Strictly based on absolute time elapsed to prevent browser background throttling issues
    useEffect(() => {
        if (phase === 'currentPlayer' || phase === 'opponent') {
            phaseStartRef.current = Date.now(); // Record exact start time of this phase locally
            let timeoutTriggered = false; // Prevent multiple triggers in local instance

            const timer = setInterval(() => {
                const elapsedSeconds = (Date.now() - phaseStartRef.current) / 1000;
                let next = 15 - elapsedSeconds;
                if (next < 0) next = 0;
                setTimeLeft(next);

                if (next === 0 && !timeoutTriggered) {
                    const authority = phase === 'currentPlayer' ? isLocalPrimary : isLocalSecondary;
                    // Failsafe: if the authority's tab is minimized and completely asleep, 
                    // allow the other player to force the timeout after a 2.5 second grace period.
                    const forceTimeoutIfAsleep = elapsedSeconds >= 17.5;

                    if (gameMode !== '1v1_online' || authority || forceTimeoutIfAsleep) {
                        timeoutTriggered = true; // Lock it locally

                        if (phase === 'currentPlayer') {
                            setPhase('feedbackPrimaryTime');
                            setLastAnswer('Čas vypršal');
                            if (onSyncModal) onSyncModal({ phase: 'feedbackPrimaryTime', lastAnswer: 'Čas vypršal' });

                            setTimeout(() => {
                                setPhase('opponent');
                                setInputValue('');
                                setErrorMsg('');
                                setTimeLeft(15);
                                setLastAnswer('');
                                if (onSyncModal) onSyncModal({ phase: 'opponent', lastAnswer: '' });
                            }, 2500);
                        } else {
                            setPhase('feedbackSecondaryBlackTime');
                            setLastAnswer('Čas vypršal');
                            if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlackTime', lastAnswer: 'Čas vypršal' });

                            if (!resolvedRef.current) {
                                resolvedRef.current = true;
                                setTimeout(() => onResolveRef.current('black', 0, true), 5000);
                            }
                        }
                    }
                }
            }, 100);
            return () => clearInterval(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, isLocalPrimary, isLocalSecondary, gameMode, onSyncModal]);

    if (!question) return null;

    const handleSubmitPrimary = () => {
        if (!inputValue.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question.answer)) {
            const pts = calculatePoints(currentPlayer, timeLeft);
            setEarnedPoints(pts);
            setPhase('feedbackPrimaryCorrect');
            if (onSyncModal) onSyncModal({ phase: 'feedbackPrimaryCorrect', lastAnswer: inputValue });
            if (!resolvedRef.current) {
                resolvedRef.current = true;
                setTimeout(() => onResolveRef.current(`player${currentPlayer}`, pts, false), 5000);
            }
        } else {
            setPhase('feedbackPrimaryIncorrect');
            if (onSyncModal) onSyncModal({ phase: 'feedbackPrimaryIncorrect', lastAnswer: inputValue });
            setTimeout(() => {
                setPhase('opponent');
                setInputValue('');
                setErrorMsg('');
                setTimeLeft(15);
                setLastAnswer(''); // Ready for opponent guess
                setIsSubmitting(false); // Allow secondary guess input
                if (onSyncModal) onSyncModal({ phase: 'opponent', lastAnswer: '' });
            }, 2500);
        }
    };

    const handleSubmitSecondary = () => {
        if (!inputValue.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question.answer)) {
            const pts = calculatePoints(opponent, timeLeft);
            setEarnedPoints(pts);
            setPhase('feedbackSecondaryCorrect');
            if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryCorrect', lastAnswer: inputValue });
            if (!resolvedRef.current) {
                resolvedRef.current = true;
                setTimeout(() => onResolveRef.current(`player${opponent}`, pts, false), 5000);
            }
        } else {
            setPhase('feedbackSecondaryBlackIncorrect');
            if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlackIncorrect', lastAnswer: inputValue });
            if (!resolvedRef.current) {
                resolvedRef.current = true;
                setTimeout(() => onResolveRef.current('black', 0, true), 5000);
            }
        }
    };

    const handleDeclineSecondary = () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        setLastAnswer('Hráč nevyužil šancu');
        setPhase('feedbackSecondaryBlack');
        if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlack', lastAnswer: 'Hráč nevyužil šancu' });
        if (!resolvedRef.current) {
            resolvedRef.current = true;
            setTimeout(() => onResolveRef.current('black', 0, true), 5000);
        }
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
                        {renderPlaceholder(question.answer)}
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Na ťahu je: {currentPlayerName} ({currentPlayerColor})
                        </h3>
                        {/* Timer Bar for primary player */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 15) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
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
                        {renderPlaceholder(question.answer)}
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: {opponentName} ({opponentColor})
                        </h3>

                        {/* Timer Bar */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 15) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#3b82f6' }}></div>
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
