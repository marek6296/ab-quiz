import React, { useState, useEffect } from 'react';

export const QuestionModal = ({ question, hexId, currentPlayer, gameMode, onClose, onResolve }) => {
    const [phase, setPhase] = useState('currentPlayer');

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

    const currentPlayerClass = currentPlayer === 1 ? 'primary' : 'secondary';
    const opponentClass = opponent === 1 ? 'primary' : 'secondary';

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Udelenie poľa číslo {hexId}</h2>
                <div className="question-text">{question.text}</div>
                <div className="answer-text">Správna odpoveď: {question.answer}</div>

                {phase === 'currentPlayer' ? (
                    <div className="modal-actions">
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Na ťahu je: {currentPlayerName} ({currentPlayerColor})
                        </h3>

                        {isCpuTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU premýšľa nad odpoveďou...</p>
                        ) : (
                            <>
                                <button className={currentPlayerClass} onClick={() => onResolve(`player${currentPlayer}`)}>
                                    Uhádol (Získať pole)
                                </button>
                                <button className="danger" onClick={() => setPhase('opponent')}>
                                    Neuhádol
                                </button>
                                <button className="neutral" onClick={() => onClose()}>Zrušiť</button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="modal-actions">
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: {opponentName} ({opponentColor})
                        </h3>

                        {isCpuOpponentTurn ? (
                            <p style={{ width: '100%', color: '#94a3b8' }}>CPU sa snaží využiť šancu a premýšľa...</p>
                        ) : (
                            <>
                                <button className={opponentClass} onClick={() => onResolve(`player${opponent}`)}>
                                    Súper uhádol (Získať pole)
                                </button>
                                <button className="danger" onClick={() => onResolve('black')}>
                                    Neuhádol / Nechce (Čierne pole)
                                </button>
                                <button className="neutral" onClick={() => onClose()}>Zrušiť</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
