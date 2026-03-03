import React, { useState, useEffect } from 'react';
import { useGameStore } from '../game-engine/store';

export const DebuggerPanel = ({ gameData, currentPlayer, p1Score, p2Score, p1Combo, p2Combo }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { appState, gameMode, gameRules, activeGameId, debugLogs } = useGameStore();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '10px',
                    right: '10px',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: '1px solid #333',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    zIndex: 9999
                }}
            >
                🐞 Debug
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#38bdf8',
            border: '1px solid #475569',
            padding: '15px',
            borderRadius: '8px',
            fontSize: '11px',
            zIndex: 9999,
            maxWidth: '300px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                <strong style={{ color: '#f8fafc' }}>🔧 Debug Console</strong>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>Zavrieť</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Zustand State:</strong> {appState}</div>
                <div><strong>Mode:</strong> {gameMode} | <strong>Rules:</strong> {gameRules}</div>
                <div><strong>Game ID:</strong> {activeGameId?.substring(0, 8)}...</div>
                {gameData?.room_code && <div><strong>Room Code:</strong> {gameData.room_code}</div>}

                <hr style={{ borderColor: '#334155', margin: '5px 0' }} />

                <div><strong>Hráč na ťahu:</strong> Hráč {currentPlayer}</div>
                <div><strong>P1 Skóre:</strong> {p1Score} | <strong>Combo:</strong> {p1Combo}</div>
                <div><strong>P2 Skóre:</strong> {p2Score} | <strong>Combo:</strong> {p2Combo}</div>
                <div><strong>DB pripojenie:</strong> {gameData ? 'Online' : 'Lokálne'}</div>

                <hr style={{ borderColor: '#334155', margin: '5px 0' }} />

                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px' }}>
                    <strong style={{ color: '#94a3b8', marginBottom: '4px' }}>Logy Udalostí ({debugLogs?.length || 0}):</strong>
                    {debugLogs?.map((log, i) => (
                        <div key={i} style={{ wordBreak: 'break-all' }}>{log}</div>
                    ))}
                    {(!debugLogs || debugLogs.length === 0) && <div style={{ color: '#64748b' }}>Žiadne udalosti...</div>}
                </div>
            </div>
        </div>
    );
};
