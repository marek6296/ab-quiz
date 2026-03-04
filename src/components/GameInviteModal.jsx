export const GameInviteModal = ({ invite, onAccept, onDecline }) => {
  if (!invite) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 10005 }}>
      <div className="modal-content glass-panel" style={{ maxWidth: '450px', padding: '2.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⚔️</div>
        <h2 style={{ fontSize: '2rem', color: '#f8fafc', marginBottom: '1rem' }}>Nová výzva!</h2>
        <p style={{ fontSize: '1.2rem', color: '#cbd5e1', marginBottom: '2.5rem', lineHeight: '1.6' }}>
          Hráč <strong style={{ color: '#38bdf8' }}>{invite.challengerName}</strong> ťa vyzýva na súboj. <br />
          <span style={{ fontSize: '1rem', opacity: 0.8, marginTop: '0.5rem', display: 'block' }}>
            Režim: {invite.gameRules === 'hex' ? 'Hexagonálna cesta (AZ-kvíz)' : 'Súboj o body (Rýchlosť)'}
          </span>
        </p>
        <div className="modal-actions" style={{ gap: '1rem' }}>
          <button className="primary" style={{ flex: 1, padding: '1rem' }} onClick={() => onAccept(invite.gameId, invite.gameRules)}>Prijať</button>
          <button className="danger" style={{ flex: 1, padding: '1rem' }} onClick={() => onDecline(invite.gameId)}>Odmietnuť</button>
        </div>
      </div>
    </div>
  );
};
