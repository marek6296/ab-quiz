import React, { useState, useEffect, useRef } from 'react';
import { isAnswerCorrect } from '../utils/stringUtils';
import { useAudio } from '../hooks/useAudio';
import { supabase } from '../lib/supabase';

export const QuestionModal = ({ modalData, onSyncModal, question, hexId, currentPlayer, gameMode, gameRules = 'hex', botDifficulty = 1, p1Combo = 0, p2Combo = 0, onClose, onResolve, localPlayerNum, playerNames, presenceCount, markQuestionAsSeen }) => {
    const [phase, setPhase] = useState('reveal');
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(15);
    const [lastAnswer, setLastAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showReportMenu, setShowReportMenu] = useState(false);
    const [hasReported, setHasReported] = useState(false);

    // Record this question as seen for the user profile
    useEffect(() => {
        if (question && question.id && markQuestionAsSeen) {
            markQuestionAsSeen(question.id);
        }
    }, [question, markQuestionAsSeen]);

    // Check local storage if this client already reported this question today/ever
    useEffect(() => {
        if (question && question.id) {
            const reported = localStorage.getItem(`reported_${question.id}`);
            if (reported) setHasReported(true);
        }
    }, [question]);

    const phaseStartRef = useRef(Date.now());
    const resolvedRef = useRef(false);

    // Udržanie najaktuálnejšej hodnoty `onResolve`, aby sme nemuseli neustále reštartovať timery.
    const onResolveRef = useRef(onResolve);
    useEffect(() => {
        onResolveRef.current = onResolve;
    }, [onResolve]);

    const { playSound, stopSound } = useAudio();

    const handleReport = async (reason) => {
        if (hasReported || !question || !question.id) return;
        setHasReported(true);
        setShowReportMenu(false);
        localStorage.setItem(`reported_${question.id}`, 'true');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || null;

            // Nikdy nenechávame player_name prázdne, ak vieme získať meno z playerNames
            const pName = localPlayerNum === 1 ? playerNames.player1 : playerNames.player2;

            await supabase.from('question_reports').insert({
                question_id: question.id,
                user_id: userId,
                player_name: pName,
                reason: reason
            });
        } catch (e) {
            console.error("Report zlyhal", e);
        }
    };

    const opponent = currentPlayer === 1 ? 2 : 1;
    // V 1vbot móde je lokálny hráč VŽDY hráč 1.
    const isLocalPrimary = gameMode === '1v1_online' ? currentPlayer === localPlayerNum : currentPlayer === 1;
    const isLocalSecondary = gameMode === '1v1_online' ? opponent === localPlayerNum : opponent === 1;

    const isBotPrimaryTurn = gameMode === '1vbot' && currentPlayer === 2 && phase === 'currentPlayer';
    const isBotSecondaryTurn = gameMode === '1vbot' && opponent === 2 && phase === 'opponent';

    // Auto-skip 'opponentChoice' phase for the Bot
    useEffect(() => {
        if (phase === 'opponentChoice' && gameMode === '1vbot' && opponent === 2) {
            setPhase('opponent'); // Proceed to answer
            setTimeLeft(15);
        }
    }, [phase, gameMode, opponent]);

    const currentPlayerName = currentPlayer === 1 ? playerNames.player1 : playerNames.player2;
    const opponentName = opponent === 1 ? playerNames.player1 : playerNames.player2;

    const currentPlayerColor = currentPlayer === 1 ? 'Modrý' : 'Oranžový';
    const opponentColor = opponent === 1 ? 'Modrý' : 'Oranžový';

    // Anti-cheat a Disconnect penáleze
    useEffect(() => {
        const isReload = (phase === 'currentPlayer' || phase === 'opponent' || phase === 'opponentChoice');

        // Anti-cheat chytí reštart, ak sme offline (vždy) alebo sme online A SME NA ŤAHU
        const isMyLocalTurn = gameMode !== '1v1_online' ||
            (phase === 'currentPlayer' && isLocalPrimary) ||
            ((phase === 'opponentChoice' || phase === 'opponent') && isLocalSecondary);

        if (isReload && isMyLocalTurn && !window.hasMountedQuestionModalThisSession) {
            if (phase === 'currentPlayer') {
                setInputValue('');
                setTimeout(() => {
                    setPhase('feedbackPrimaryIncorrect');
                    setLastAnswer('Podvádzanie (Refresh)');
                    if (gameMode === '1v1_online' && onSyncModal) onSyncModal({ phase: 'feedbackPrimaryIncorrect', lastAnswer: 'Podvádzanie (Refresh)' });

                    setTimeout(() => {
                        setPhase('opponentChoice');
                        setInputValue('');
                        setErrorMsg('');
                        setTimeLeft(5);
                        setLastAnswer('');
                        if (gameMode === '1v1_online' && onSyncModal) onSyncModal({ phase: 'opponentChoice', timeLeft: 5, lastAnswer: '' });
                    }, 2500);
                }, 100);
            } else if (phase === 'opponent' || phase === 'opponentChoice') {
                setInputValue('');
                setTimeout(() => {
                    setPhase('feedbackSecondaryBlack');
                    setLastAnswer('Podvádzanie (Refresh)');
                    if (gameMode === '1v1_online' && onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlack', lastAnswer: 'Podvádzanie (Refresh)' });

                    if (!resolvedRef.current) {
                        resolvedRef.current = true;
                        setTimeout(() => onResolveRef.current('black', 0, true), 3000);
                    }
                }, 100);
            }
        }
        window.hasMountedQuestionModalThisSession = true;
    }, [gameMode, phase, isLocalPrimary, isLocalSecondary, onSyncModal]);

    useEffect(() => {
        // Enforce zlyhania, ak sa náš súper v Online režime odpojil presne počas svojho ťahu (zbabelý útek / strata pripojenia)
        if (gameMode === '1v1_online' && presenceCount < 2) {
            if (!isLocalPrimary && phase === 'currentPlayer') {
                setPhase('feedbackPrimaryIncorrect');
                setLastAnswer('Odpojil sa');
                if (onSyncModal) onSyncModal({ phase: 'feedbackPrimaryIncorrect', lastAnswer: 'Odpojil sa' });
                setTimeout(() => {
                    setPhase('opponentChoice');
                    setInputValue('');
                    setErrorMsg('');
                    setTimeLeft(5);
                    setLastAnswer('');
                    if (onSyncModal) onSyncModal({ phase: 'opponentChoice', timeLeft: 5 });
                }, 2500);
            } else if (!isLocalSecondary && (phase === 'opponentChoice' || phase === 'opponent')) {
                setPhase('feedbackSecondaryBlack');
                setLastAnswer('Odpojil sa');
                if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlack', lastAnswer: 'Odpojil sa' });
                if (!resolvedRef.current) {
                    resolvedRef.current = true;
                    setTimeout(() => onResolveRef.current('black', 0, true), 5000);
                }
            }
        }
    }, [presenceCount, phase, gameMode, isLocalPrimary, isLocalSecondary, onSyncModal]);

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

    const handleSubmitPrimary = () => {
        if (!inputValue.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question?.answer || '')) {
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
                setPhase('opponentChoice');
                setInputValue('');
                setErrorMsg('');
                setTimeLeft(5); // 5 seconds timer for choice
                setLastAnswer(''); // Ready for opponent guess
                setIsSubmitting(false); // Allow secondary guess input
                if (onSyncModal) onSyncModal({ phase: 'opponentChoice', lastAnswer: '' });
            }, 2500);
        }
    };

    const handleSubmitSecondary = () => {
        if (!inputValue.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setLastAnswer(inputValue);

        if (isAnswerCorrect(inputValue, question?.answer || '')) {
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

    // Vždy držať klávesnicu zapnutú – blur zakázaný!
    useEffect(() => {
        const globalInput = document.getElementById('global-mobile-input');
        if (!globalInput) return;

        // Ensure the physical input reflects whatever state we have (important for clearing)
        if (globalInput.value !== inputValue) {
            globalInput.value = inputValue;
        }

        const isSelfTurnActive = (phase === 'reveal' && isLocalPrimary) ||
            (phase === 'currentPlayer' && isLocalPrimary) ||
            (phase === 'opponent' && isLocalSecondary);

        // Keep local value in sync
        const handleInput = (e) => {
            if (isSelfTurnActive) {
                setInputValue(e.target.value);
            } else {
                // Prevent typing strictly in the background during opponent's turn
                globalInput.value = '';
            }
        };

        // Handle enter key globally
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                if (isSelfTurnActive) {
                    if (phase === 'currentPlayer') handleSubmitPrimary();
                    else if (phase === 'opponent') handleSubmitSecondary();
                } else {
                    e.preventDefault();
                }
            }
        };

        if (isSelfTurnActive) {
            // Agresívna snaha udržať fokus pri lokálnom type = klávesnica sa drží
            if (document.activeElement !== globalInput) {
                globalInput.focus();
            }

            const focusInterval = setInterval(() => {
                if (document.activeElement !== globalInput) {
                    globalInput.focus();
                }
            }, 300);

            globalInput.addEventListener('input', handleInput);
            globalInput.addEventListener('keydown', handleKeyDown);

            return () => {
                clearInterval(focusInterval);
                globalInput.removeEventListener('input', handleInput);
                globalInput.removeEventListener('keydown', handleKeyDown);
            };
        } else {
            // Zavrie klávesnicu, keď prebiehajú animácie, čakanie a voľba
            globalInput.blur();
        }

    }, [phase, isLocalPrimary, isLocalSecondary, handleSubmitPrimary, handleSubmitSecondary]);

    // Očistenie a zhodenie klávesnice, AŽ KEĎ SA UKONČÍ OTÁZKA (keď sa vrátime na board)
    useEffect(() => {
        return () => {
            const globalInput = document.getElementById('global-mobile-input');
            if (globalInput) {
                globalInput.blur();
                globalInput.value = '';
            }
        };
    }, []);

    const renderPlaceholder = (answer) => {
        if (!answer) return null;

        const isSelfTurnActive = (phase === 'reveal' && isLocalPrimary) ||
            (phase === 'currentPlayer' && isLocalPrimary) ||
            (phase === 'opponent' && isLocalSecondary);

        const isSelfTurn = (phase === 'currentPlayer' && isLocalPrimary) ||
            (phase === 'opponent' && isLocalSecondary);

        // Remove spaces to match the typed characters index against the actual letter positions
        const cleanTyped = inputValue.replace(/\s+/g, '');
        let typedIndex = 0;

        return (
            <div
                className="placeholder-container"
                onClick={() => {
                    if (isSelfTurnActive) {
                        const globalInput = document.getElementById('global-mobile-input');
                        if (globalInput) globalInput.focus();
                    }
                }}
                style={{ cursor: isSelfTurn ? 'text' : 'default', position: 'relative' }}
            >

                {answer.split(' ').map((word, wIdx) => (
                    <span key={wIdx} className="placeholder-word">
                        {word.split('').map((char, cIdx) => {
                            const isSpecial = /[-.']/.test(char);
                            let displayChar = '_';
                            let isFilled = false;

                            if (isSpecial) {
                                displayChar = char;
                            } else if (typedIndex < cleanTyped.length) {
                                displayChar = cleanTyped[typedIndex].toUpperCase();
                                isFilled = true;
                                typedIndex++;
                            }

                            return (
                                <span key={cIdx} className={`placeholder-char ${isFilled ? 'filled' : ''}`}>
                                    {displayChar}
                                </span>
                            );
                        })}
                    </span>
                ))}
            </div>
        );
    };

    const renderFeedback = (title, message, isSuccess, showAnswer = false) => (
        <div className={`feedback-overlay ${isSuccess ? 'success-pulse' : 'error-pulse'}`} style={{ animation: 'feedbackPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 className="feedback-title" style={{ color: isSuccess ? '#4ade80' : '#ef4444' }}>{title}</h2>
            <p className="feedback-message">{message}</p>

            {isSuccess && gameRules === 'points' && earnedPoints > 0 && (
                <div className="feedback-points">
                    +{earnedPoints} bodov!
                </div>
            )}

            {(showAnswer || lastAnswer) && (
                <div className="feedback-answer-box">
                    {lastAnswer && (
                        <p className="feedback-last-answer" style={{ marginBottom: showAnswer ? '0.5rem' : 0 }}>
                            Zadaná: <strong style={{ color: '#fff' }}>{lastAnswer}</strong>
                        </p>
                    )}
                    {showAnswer && (
                        <div style={{ borderTop: lastAnswer ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingTop: lastAnswer ? '0.5rem' : 0 }}>
                            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>
                                Správne:
                            </p>
                            <p className="feedback-correct-answer">
                                {question.answer}
                            </p>
                        </div>
                    )}
                </div>
            )}
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

        // Nastavenia podľa náročnosti bota (1=Ľahký, 2=Stredný, 3=Ťažký)
        let primaryWinChance = 0.65;
        let secondaryWinChance = 0.4;
        let baseTime = 1500;
        let varTime = 4500;

        if (botDifficulty === 1) { // ĽAHKÝ (Pomalý, často sa mýli)
            primaryWinChance = 0.4;
            secondaryWinChance = 0.2;
            baseTime = 2500;
            varTime = 6000;
        } else if (botDifficulty === 2) { // STREDNÝ (Vyvážený)
            primaryWinChance = 0.65;
            secondaryWinChance = 0.4;
            baseTime = 1500;
            varTime = 4000;
        } else if (botDifficulty === 3) { // ŤAŽKÝ (Rýchly terminátor)
            primaryWinChance = 0.90;
            secondaryWinChance = 0.75;
            baseTime = 500;
            varTime = 2000;
        }

        const thinkTime = Math.floor(Math.random() * varTime) + baseTime;

        // Pomocná funkcia na vygenerovanie náhodnej zlej odpovede ("hlúposti")
        const generateNonsense = (length) => {
            const consonants = 'bcdfghjklmnprstvz';
            const vowels = 'aeiouy';
            let res = '';
            // Aspoň 4 písmená
            const targetLength = Math.max(4, length + Math.floor(Math.random() * 3) - 1);
            for (let i = 0; i < targetLength; i++) {
                if (i % 2 === 0) res += consonants[Math.floor(Math.random() * consonants.length)];
                else res += vowels[Math.floor(Math.random() * vowels.length)];
            }
            return res.toUpperCase();
        };

        if (isBotPrimaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() < primaryWinChance;
                if (isCorrect) {
                    const elapsedSeconds = (Date.now() - phaseStartRef.current) / 1000;
                    const computedTimeLeft = Math.max(0, 15 - elapsedSeconds);
                    const pts = calculatePoints(2, computedTimeLeft);

                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackPrimaryCorrect');
                    setTimeout(() => onResolveRef.current('player2', pts, false), 5000);
                } else {
                    setLastAnswer(generateNonsense(question.answer?.length || 5));
                    setPhase('feedbackPrimaryIncorrect');
                    setTimeout(() => {
                        setPhase('opponentChoice'); // BOT didn't know, pass
                        setInputValue('');
                        setErrorMsg('');
                        setTimeLeft(5);
                        setLastAnswer(''); // Clear for next phase
                    }, 2500);
                }
            }, thinkTime);
        } else if (isBotSecondaryTurn) {
            timeout = setTimeout(() => {
                const isCorrect = Math.random() < secondaryWinChance;
                if (isCorrect) {
                    const elapsedSeconds = (Date.now() - phaseStartRef.current) / 1000;
                    const computedTimeLeft = Math.max(0, 15 - elapsedSeconds);
                    const pts = calculatePoints(2, computedTimeLeft);

                    setEarnedPoints(pts);
                    setLastAnswer(question.answer);
                    setPhase('feedbackSecondaryCorrect');
                    if (!resolvedRef.current) {
                        resolvedRef.current = true;
                        setTimeout(() => onResolveRef.current('player2', pts, false), 5000);
                    }
                } else {
                    setLastAnswer(generateNonsense(question.answer?.length || 5));
                    setPhase('feedbackSecondaryBlackIncorrect');
                    if (!resolvedRef.current) {
                        resolvedRef.current = true;
                        setTimeout(() => onResolveRef.current('black', 0, true), 5000);
                    }
                }
            }, thinkTime);
        }
        return () => clearTimeout(timeout);
    }, [isBotPrimaryTurn, isBotSecondaryTurn, question.answer, gameRules, botDifficulty]); // Zmenili sme dependencies

    // Timer Logic - Strictly based on absolute time elapsed to prevent browser background throttling issues
    useEffect(() => {
        if (phase === 'currentPlayer' || phase === 'opponent' || phase === 'opponentChoice') {
            phaseStartRef.current = Date.now(); // Record exact start time of this phase locally
            let timeoutTriggered = false; // Prevent multiple triggers in local instance

            const maxTime = phase === 'opponentChoice' ? 5 : 15;

            const timer = setInterval(() => {
                const elapsedSeconds = (Date.now() - phaseStartRef.current) / 1000;
                let next = maxTime - elapsedSeconds;
                if (next < 0) next = 0;
                setTimeLeft(next);

                if (next === 0 && !timeoutTriggered) {
                    const authority = phase === 'currentPlayer' ? isLocalPrimary : isLocalSecondary;
                    // Failsafe: if the authority's tab is minimized and completely asleep, 
                    // allow the other player to force the timeout after a 2.5 second grace period.
                    const forceTimeoutIfAsleep = elapsedSeconds >= (maxTime + 2.5);

                    if (gameMode !== '1v1_online' || authority || forceTimeoutIfAsleep) {
                        timeoutTriggered = true; // Lock it locally

                        if (phase === 'currentPlayer') {
                            setPhase('feedbackPrimaryTime');
                            setLastAnswer('Čas vypršal');
                            if (onSyncModal) onSyncModal({ phase: 'feedbackPrimaryTime', lastAnswer: 'Čas vypršal' });

                            setTimeout(() => {
                                setPhase('opponentChoice');
                                setInputValue('');
                                setErrorMsg('');
                                setTimeLeft(5);
                                setLastAnswer('');
                                if (onSyncModal) onSyncModal({ phase: 'opponentChoice', lastAnswer: '' });
                            }, 2500);
                        } else if (phase === 'opponentChoice') {
                            setPhase('feedbackSecondaryBlackTime');
                            setLastAnswer('Čas vypršal');
                            if (onSyncModal) onSyncModal({ phase: 'feedbackSecondaryBlackTime', lastAnswer: 'Čas vypršal' });

                            if (!resolvedRef.current) {
                                resolvedRef.current = true;
                                setTimeout(() => onResolveRef.current('black', 0, true), 5000);
                            }
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

    return (
        <div className="modal-overlay">
            <div className="modal-content question-modal-fixed" style={{ position: 'relative' }}>



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
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '12px', marginBottom: '0.5rem', alignSelf: 'center' }}>
                            {question.category || 'Všeobecné'}
                        </div>
                        <div className="question-text">{question.question_text || question.text}</div>
                        {renderPlaceholder(question.answer)}
                        {errorMsg && <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '1rem' }}>{errorMsg}</div>}

                        <h3 style={{ width: '100%', margin: '1rem 0', color: '#fff' }}>
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
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button className="primary" onClick={handleSubmitPrimary}>
                                    Odoslať odpoveď
                                </button>
                            </div>
                        ) : (
                            <p style={{ width: '100%', color: '#94a3b8' }}>Čaká sa kým {currentPlayerName} odpovie...</p>
                        )}
                    </div>
                )}

                {/* Feedback Phases for Primary Player */}
                {phase === 'feedbackPrimaryCorrect' && renderFeedback('Správne!', `${currentPlayerName} získava pole!`, true, true)}
                {phase === 'feedbackPrimaryIncorrect' && renderFeedback('Nesprávne!', `${currentPlayerName} neodpovedal správne. Šancu dostane súper!`, false, false)}
                {phase === 'feedbackPrimaryTime' && renderFeedback('Čas Vypršal!', `${currentPlayerName} nestihol odpovedať včas. Šancu získa súper!`, false, false)}

                {/* Secondary Guess Choice Phase */}
                {phase === 'opponentChoice' && (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '12px', marginBottom: '0.5rem', alignSelf: 'center' }}>
                            {question.category || 'Všeobecné'}
                        </div>
                        <div className="question-text">{question.question_text || question.text}</div>

                        <h3 style={{ width: '100%', margin: '1rem 0', color: '#fbbf24' }}>
                            Súper zaváhal! Máš šancu, {opponentName} ({opponentColor})
                        </h3>
                        {/* Timer Bar for opponent */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 5) * 100}%`, backgroundColor: timeLeft <= 2 ? '#ef4444' : '#fbbf24' }}></div>
                        </div>
                        <p style={{ marginBottom: '1.5rem' }}>{timeLeft.toFixed(1)} sekúnd na rozhodnutie!</p>

                        {isLocalSecondary ? (
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button className="primary" onClick={() => {
                                    setPhase('opponent');
                                    setTimeLeft(15);
                                    // Fyzický klik vyvolá focus
                                    setTimeout(() => {
                                        const globalInput = document.getElementById('global-mobile-input');
                                        if (globalInput) globalInput.focus();
                                    }, 50);
                                    if (onSyncModal) onSyncModal({ phase: 'opponent' });
                                }}>
                                    Zobrať otázku
                                </button>
                                <button className="neutral" onClick={handleDeclineSecondary}>
                                    Zahodiť
                                </button>
                            </div>
                        ) : (
                            <p style={{ width: '100%', color: '#94a3b8' }}>Čaká sa kým sa {opponentName} rozhodne...</p>
                        )}
                    </div>
                )}

                {/* Secondary Guess Phase (Opponent Chance) */}
                {phase === 'opponent' && (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '12px', marginBottom: '0.5rem', alignSelf: 'center' }}>
                            {question.category || 'Všeobecné'}
                        </div>
                        <div className="question-text">{question.question_text || question.text}</div>
                        {renderPlaceholder(question.answer)}
                        {errorMsg && <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '1rem' }}>{errorMsg}</div>}

                        <h3 style={{ width: '100%', margin: '1rem 0', color: '#fbbf24' }}>
                            SÚPER MÁ ŠANCU: {opponentName} ({opponentColor})
                        </h3>
                        {/* Timer Bar for opponent */}
                        <div className="timer-bar-container">
                            <div className="timer-bar" style={{ width: `${(timeLeft / 15) * 100}%`, backgroundColor: timeLeft <= 3 ? '#ef4444' : '#fbbf24' }}></div>
                        </div>
                        <p style={{ marginBottom: '1.5rem' }}>{timeLeft.toFixed(1)} sekúnd zostáva!</p>

                        {isBotSecondaryTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>BOT premýšľa nad odpoveďou...</p>
                        ) : isLocalSecondary ? (
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button className="primary" onClick={handleSubmitSecondary}>
                                    Odpovedať
                                </button>
                                <button className="neutral" onClick={handleDeclineSecondary}>
                                    Neviem (Čierny Hex)
                                </button>
                            </div>
                        ) : (
                            <p style={{ width: '100%', color: '#94a3b8' }}>Čaká sa kým {opponentName} zareaguje...</p>
                        )}
                    </div>
                )}

                {/* Feedback Secondary - Final States show correct answer for 5s */}
                {phase === 'feedbackSecondaryCorrect' && renderFeedback('Správne!', `${opponentName} využil šancu a získava pole!`, true, true)}
                {phase === 'feedbackSecondaryBlack' && renderFeedback('Šanca Nevyužitá!', 'Pole zostáva voľné pre ďalšie ťahy.', false, true)}
                {phase === 'feedbackSecondaryBlackIncorrect' && renderFeedback('Nesprávne!', `${opponentName} nevyužil šancu. Pole zostáva voľné.`, false, true)}
                {phase === 'feedbackSecondaryBlackTime' && renderFeedback('Čas Vypršal!', `${opponentName} nestihol odpovedať. Pole zostáva voľné.`, false, true)}

                {/* REPORT FLAG - Moved to bottom for Z-index overlay safety */}
                {!hasReported && (
                    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 999 }}>
                        <button
                            onClick={() => setShowReportMenu(!showReportMenu)}
                            style={{
                                background: 'rgba(15, 23, 42, 0.8)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: '#e2e8f0',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '12px',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontWeight: 'bold',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                            }}
                        >
                            <span style={{ fontSize: '0.9rem' }}>🚩</span> Nahlásiť
                        </button>
                        {showReportMenu && (
                            <div style={{ position: 'absolute', top: '110%', right: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '0.6rem', width: '160px', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: '0 15px 35px rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease-out' }}>
                                <button onClick={() => handleReport('ťažká otázka')} style={{ background: '#fbbf24', color: '#000', border: 'none', borderRadius: '8px', padding: '0.6rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>⚠️ Príliš ťažká</button>
                                <button onClick={() => handleReport('nezmysel')} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.6rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>❌ Zlá / Nezmyselná</button>
                                <button onClick={() => setShowReportMenu(false)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: '0.7rem', cursor: 'pointer', marginTop: '0.2rem' }}>Zrušiť</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
