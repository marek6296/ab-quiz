import React, { useState, useEffect } from 'react';
import { isAnswerCorrect } from '../utils/stringUtils';

export const QuestionModal = ({ question, hexId, currentPlayer, gameMode, onClose, onResolve }) => {
    const [phase, setPhase] = useState('currentPlayer');
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const opponent = currentPlayer === 1 ? 2 : 1;
    const isCpuTurn = gameMode === '1vcpu' && currentPlayer === 2 && phase === 'currentPlayer';
    const isCpuOpponentTurn = gameMode === '1vcpu' && opponent === 2 && phase === 'opponent';

    useEffect(() => {
        let timeout;
        if (isCpuTurn) {
            // CPU tries to answer the question originally
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.3; // 70% chance to know the answer
                if (isCorrect) {
                    onResolve('player2');
                } else {
                    setPhase('opponent'); // CPU didn't know, pass to Player 1
                    setInputValue('');
                    setErrorMsg('');
                }
            }, 2500);
        } else if (isCpuOpponentTurn) {
            // CPU gets a chance because Player 1 didn't know
            timeout = setTimeout(() => {
                const isCorrect = Math.random() > 0.5; // 50% chance to steal the answer
                if (isCorrect) {
                    onResolve('player2');
                } else {
                    onResolve('black'); // CPU didn't know either
                }
            }, 2500);
        }
        return () => clearTimeout(timeout);
    }, [isCpuTurn, isCpuOpponentTurn, onResolve]);

    if (!question) return null;

    const currentPlayerName = currentPlayer === 1 ? 'Hráč 1' : (gameMode === '1vcpu' ? 'CPU' : 'Hráč 2');
    const opponentName = opponent === 1 ? 'Hráč 1' : (gameMode === '1vcpu' ? 'CPU' : 'Hráč 2');

    const currentPlayerColor = currentPlayer === 1 ? 'Modrý' : 'Oranžový';
    const opponentColor = opponent === 1 ? 'Modrý' : 'Oranžový';

    const handleSubmitPrimary = () => {
        if (!inputValue.trim()) return;

        if (isAnswerCorrect(inputValue, question.answer)) {
            onResolve(`player${currentPlayer}`);
        } else {
            setErrorMsg('Nesprávna odpoveď!');
            setTimeout(() => {
                setPhase('opponent');
                setInputValue('');
                setErrorMsg('');
            }, 1500);
        }
    };

    const handleSubmitSecondary = () => {
        if (!inputValue.trim()) return;

        if (isAnswerCorrect(inputValue, question.answer)) {
            onResolve(`player${opponent}`);
        } else {
            setErrorMsg('Nesprávna odpoveď!');
            setTimeout(() => {
                onResolve('black');
            }, 1500);
        }
    };

    const handleKeyDown = (e, callback) => {
        if (e.key === 'Enter') {
            callback();
        }
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

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Udelenie poľa číslo {hexId}</h2>
                <div className="question-text">{question.text}</div>

                {phase === 'currentPlayer' ? (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Na ťahu je: {currentPlayerName} ({currentPlayerColor})
                        </h3>

                        {isCpuTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU premýšľa nad odpoveďou...</p>
                        ) : (
                            <>
                                {renderInput(handleSubmitPrimary)}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button className="primary" onClick={handleSubmitPrimary}>
                                        Odoslať odpoveď
                                    </button>
                                    <button className="neutral" onClick={() => onClose()}>Zrušiť</button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: {opponentName} ({opponentColor})
                        </h3>

                        {isCpuOpponentTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU sa snaží využiť šancu a premýšľa...</p>
                        ) : (
                            <>
                                {errorMsg ? (
                                    <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '1rem' }}>{errorMsg}</div>
                                ) : (
                                    renderInput(handleSubmitSecondary)
                                )}
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {!errorMsg && (
                                        <button className="secondary" onClick={handleSubmitSecondary}>
                                            Odoslať odpoveď
                                        </button>
                                    )}
                                    <button className="danger" onClick={() => onResolve('black')}>
                                        Nechcem odpovedať
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
