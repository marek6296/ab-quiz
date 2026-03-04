import React from 'react';
import { useAuth } from '../context/AuthContext';

export const GamePortal = ({ onSelectGame }) => {
    const { user, signOut } = useAuth();

    return (
        <div className="game-container game-portal" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
            <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem' }}>
                <h1 className="logo-brutal" style={{ fontSize: '2.5rem', margin: 0 }}>Quizovník</h1>
                <button className="neutral" onClick={signOut} style={{ padding: '0.8rem 1.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Odhlásiť sa
                </button>
            </div>

            <h2 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#f8fafc', textAlign: 'center' }}>Vyberte si hru</h2>
            <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '4rem', textAlign: 'center' }}>Vitajte na našom hernom portáli. Ďalšie hry pribudnú čoskoro!</p>

            <div className="portal-grid" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '1000px', width: '100%' }}>
                <div
                    className="mode-card primary"
                    onClick={() => onSelectGame('ab_quiz')}
                    style={{ minWidth: '300px', flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem 2rem' }}
                >
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🧠</div>
                    <h3 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>Kvíz duel</h3>
                    <p style={{ fontSize: '1.1rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6' }}>Vedomostná strategická hra na štýl legendárneho AZ-Kvízu. Spojte 3 strany hexagonálneho herného poľa!</p>
                    <span style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1.2rem', marginTop: 'auto', background: '#38bdf8', padding: '0.8rem 2rem', borderRadius: '30px' }}>Hrať teraz →</span>
                </div>

                <div
                    className="mode-card"
                    style={{ minWidth: '300px', flex: 1, opacity: 0.6, cursor: 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem 2rem' }}
                >
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🚧</div>
                    <h3 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>Pripravujeme</h3>
                    <p style={{ fontSize: '1.1rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6' }}>Usilovne pracujeme na vývoji ďalších skvelých hier do tejto kolekcie.</p>
                    <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '1.2rem', marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '0.8rem 2rem', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)' }}>Už čoskoro</span>
                </div>
            </div>
        </div>
    );
};
