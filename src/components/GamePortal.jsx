import React from 'react';
import { useAuth } from '../context/AuthContext';

export const GamePortal = ({ onSelectGame }) => {
    const { user, signOut } = useAuth();

    return (
        <div className="game-container game-portal" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
            <div className="portal-header">
                <button className="neutral logout-btn" onClick={signOut}>
                    Odhlásiť sa
                </button>
                <h1 className="hero-logo">Quizovník</h1>
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
                    onClick={() => onSelectGame('bilionar_battle')}
                    style={{ minWidth: '300px', flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem 2rem', background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.1) 0%, rgba(0,0,0,0.4) 100%)', border: '1px solid rgba(250, 204, 21, 0.2)' }}
                >
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem', textShadow: '0 0 20px rgba(250, 204, 21, 0.4)' }}>💰</div>
                    <h3 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#facc15' }}>Bilionár Battle</h3>
                    <p style={{ fontSize: '1.1rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6' }}>Súboj až pre 8 hráčov na čas. Odpovedz najrýchlejšie a prekonaj priateľov v tejto profesionálnej show!</p>
                    <span style={{ color: '#0f172a', fontWeight: 'bold', fontSize: '1.2rem', marginTop: 'auto', background: '#facc15', padding: '0.8rem 2rem', borderRadius: '30px', boxShadow: '0 0 15px rgba(250, 204, 21, 0.5)' }}>Hrať teraz →</span>
                </div>
            </div>
        </div>
    );
};
