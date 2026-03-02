import React from 'react';

export const GameInviteModal = ({ invite, onAccept, onDecline }) => {
  if (!invite) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: '400px'}}>
        <h2>Nová výzva na hru!</h2>
        <p className="question-text" style={{fontSize: '1.2rem'}}>
          Hráč <strong>{invite.challengerName}</strong> ťa vyzýva na súboj v AB Kvíze.
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={() => onAccept(invite.gameId)}>Prijať výzvu</button>
          <button className="danger" onClick={() => onDecline(invite.gameId)}>Odmietnuť</button>
        </div>
      </div>
    </div>
  );
};
