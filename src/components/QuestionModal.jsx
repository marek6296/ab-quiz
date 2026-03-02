import React from 'react';

export const QuestionModal = ({ question, hexId, onClose, onResolve }) => {
    if (!question) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Udelenie poľa číslo {hexId}</h2>
                <div className="question-text">{question.text}</div>
                <div className="answer-text">Správna odpoveď: {question.answer}</div>

                <div className="modal-actions">
                    <button className="primary" onClick={() => onResolve('player1')}>Hráč 1. (Modrý) Uhádol</button>
                    <button className="secondary" onClick={() => onResolve('player2')}>Hráč 2. (Oranžový) Uhádol</button>
                    <button className="danger" onClick={() => onResolve('black')}>Nikto / Čierne pole</button>
                    <button className="neutral" onClick={() => onClose()}>Zrušiť / Odložiť</button>
                </div>
            </div>
        </div>
    );
};
