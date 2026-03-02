import React, { useState } from 'react';

export const QuestionModal = ({ question, hexId, currentPlayer, onClose, onResolve }) => {
    const [phase, setPhase] = useState('currentPlayer');

    if (!question) return null;

    const opponent = currentPlayer === 1 ? 2 : 1;
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
                            Na ťahu je: Hráč {currentPlayer} ({currentPlayerColor})
                        </h3>
                        <button className={currentPlayerClass} onClick={() => onResolve(`player${currentPlayer}`)}>
                            Uhádol (Získať pole)
                        </button>
                        <button className="danger" onClick={() => setPhase('opponent')}>
                            Neuhádol
                        </button>
                        <button className="neutral" onClick={() => onClose()}>Zrušiť</button>
                    </div>
                ) : (
                    <div className="modal-actions">
                        <h3 style={{ width: '100%', marginBottom: '1rem', color: '#fff' }}>
                            Šanca pre súpera: Hráč {opponent} ({opponentColor})
                        </h3>
                        <button className={opponentClass} onClick={() => onResolve(`player${opponent}`)}>
                            Súper uhádol (Získať pole)
                        </button>
                        <button className="danger" onClick={() => onResolve('black')}>
                            Neuhádol / Nechce (Čierne pole)
                        </button>
                        <button className="neutral" onClick={() => onClose()}>Zrušiť</button>
                    </div>
                )}
            </div>
        </div>
    );
};
