import React from 'react';
import { useAuth } from '../context/AuthContext';

export const GamePortal = ({ onSelectGame, onOpenLobby }) => {
    const { user, signOut } = useAuth();

    if (!user) return null;

    return (
        <div className="game-container game-portal" style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Animated Background Accents */}
            <div className="portal-bg-glow" style={{ background: '#3b82f6', top: '-10%', left: '-10%' }}></div>
            <div className="portal-bg-glow" style={{ background: '#facc15', bottom: '-10%', right: '-10%', animationDelay: '-5s' }}></div>

            <button className="neutral logout-btn" onClick={signOut}>
                Odhlásiť sa
            </button>

            <div className="portal-header entrance-fade" style={{ animationDelay: '0.1s' }}>
                <h1 className="hero-logo">Quizovník</h1>
            </div>

            <div className="entrance-fade" style={{ animationDelay: '0.3s', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem', color: '#f8fafc' }}>Vyberte si hru</h2>
                <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '2rem' }}>Vitajte na našom hernom portáli. Pripravený na výzvu?</p>
            </div>

            <div className="portal-grid" style={{
                display: 'grid',
                gap: '1.5rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                width: '100%',
                maxWidth: '1200px',
                padding: '0 1rem',
                paddingBottom: '2rem'
            }}>
                {/* LOBBY CARD */}
                <div
                    className="portal-grid-item portal-card-glass entrance-fade"
                    onClick={onOpenLobby}
                    style={{
                        animationDelay: '0.4s',
                        minWidth: '280px',
                        flex: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '1.5rem 1rem',
                        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}
                >
                    <div className="portal-icon-floating" style={{ fontSize: '4rem', marginBottom: '1.5rem', textShadow: '0 0 30px rgba(16, 185, 129, 0.6)' }}>🎮</div>
                    <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#34d399', fontWeight: '800' }}>Multiplayer Lobby</h3>
                    <p style={{ fontSize: '0.95rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6', opacity: 0.8 }}>
                        Vytvorte si súkromnú miestnosť, pozvite priateľov a spoločne si vyberte z našich hier!
                    </p>
                    <span className="glow-btn" style={{
                        color: '#0f172a',
                        fontWeight: '900',
                        fontSize: '1.1rem',
                        marginTop: 'auto',
                        background: '#34d399',
                        padding: '0.8rem 2.5rem',
                        borderRadius: '16px',
                        boxShadow: '0 0 20px rgba(52, 211, 153, 0.4)'
                    }}>VSTÚPIŤ DO LOBBY</span>
                </div>
                {/* KVÍZ DUEL CARD */}
                <div
                    className="portal-grid-item portal-card-glass portal-card-blue entrance-fade"
                    onClick={() => onSelectGame('ab_quiz')}
                    style={{
                        animationDelay: '0.5s',
                        minWidth: '280px',
                        flex: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '1.5rem 1rem',
                        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, rgba(15, 23, 42, 0.4) 100%)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}
                >
                    <div className="portal-icon-floating" style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🧠</div>
                    <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#f8fafc', fontWeight: '800' }}>Kvíz duel</h3>
                    <p style={{ fontSize: '0.95rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6', opacity: 0.8 }}>
                        Vedomostná strategická hra na štýl legendárneho AZ-Kvízu. Spojte tri strany hexagonálneho poľa!
                    </p>
                    <span className="glow-btn" style={{
                        color: '#0f172a',
                        fontWeight: '900',
                        fontSize: '1.1rem',
                        marginTop: 'auto',
                        background: '#38bdf8',
                        padding: '0.8rem 2.5rem',
                        borderRadius: '16px'
                    }}>HRAŤ TERAZ →</span>
                </div>

                {/* BILIONÁR BATTLE CARD */}
                <div
                    className="portal-grid-item portal-card-glass portal-card-yellow entrance-fade"
                    onClick={() => onSelectGame('bilionar_battle')}
                    style={{
                        animationDelay: '0.7s',
                        minWidth: '280px',
                        flex: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '1.5rem 1rem',
                        background: 'linear-gradient(180deg, rgba(250, 204, 21, 0.08) 0%, rgba(15, 23, 42, 0.4) 100%)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}
                >
                    <div className="portal-icon-floating" style={{ fontSize: '4rem', marginBottom: '1.5rem', textShadow: '0 0 30px rgba(250, 204, 21, 0.4)', animationDelay: '-1s' }}>💰</div>
                    <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#facc15', fontWeight: '800' }}>Bilionár Battle</h3>
                    <p style={{ fontSize: '0.95rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6', opacity: 0.8 }}>
                        Súboj až pre 8 hráčov na čas. Odpovedz najrýchlejšie a prekonaj priateľov v tejto profesionálnej show!
                    </p>
                    <span className="glow-btn" style={{
                        color: '#0f172a',
                        fontWeight: '900',
                        fontSize: '1.1rem',
                        marginTop: 'auto',
                        background: '#facc15',
                        padding: '0.8rem 2.5rem',
                        borderRadius: '16px'
                    }}>HRAŤ TERAZ →</span>
                </div>

                {/* VYŠŠIE ALEBO NIŽŠIE CARD */}
                <div
                    className="portal-grid-item portal-card-glass entrance-fade"
                    onClick={() => onSelectGame('higher_lower')}
                    style={{
                        animationDelay: '0.9s',
                        minWidth: '280px',
                        flex: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '1.5rem 1rem',
                        background: 'linear-gradient(180deg, rgba(236, 72, 153, 0.1) 0%, rgba(15, 23, 42, 0.4) 100%)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}
                >
                    <div className="portal-icon-floating" style={{ fontSize: '4rem', marginBottom: '1.5rem', textShadow: '0 0 30px rgba(236, 72, 153, 0.4)', animationDelay: '-2s' }}>⚖️</div>
                    <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#f472b6', fontWeight: '800' }}>Higher or Lower</h3>
                    <p style={{ fontSize: '0.95rem', marginBottom: '2rem', color: '#cbd5e1', lineHeight: '1.6', opacity: 0.8 }}>
                        Rýchla postrehová hra s porovnávaním čísel v tónoch adrenalínu. Kto prežije dlhšie?
                    </p>
                    <span className="glow-btn" style={{
                        color: '#0f172a',
                        fontWeight: '900',
                        fontSize: '1.1rem',
                        marginTop: 'auto',
                        background: '#ec4899',
                        padding: '0.8rem 2.5rem',
                        borderRadius: '16px'
                    }}>HRAŤ TERAZ →</span>
                </div>
            </div>
        </div>
    );
};
