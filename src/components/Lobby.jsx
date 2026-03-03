import React from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FriendsList } from './auth/FriendsList';

export const Lobby = ({ onStart1vBot }) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = React.useState(null);
    const [gameRules, setGameRules] = React.useState('hex'); // 'hex' or 'points'

    const audioRef = React.useRef(null);

    React.useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = 0.015; // Set volume to 1.5% (barely audible)
            audio.play().catch(e => console.log('Autoplay prevented:', e)); // Attempt to play immediately
        }
    }, []);

    React.useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    return (
        <div className="game-container start-screen lobby">
            {/* Background Music Loop */}
            <audio ref={audioRef} src="/chrono-echoes.mp3" autoPlay loop />

            <div className="lobby-header">
                <h1>AB Kvíz</h1>
                <div className="user-info">
                    <span>Prihlásený ako: <strong>{profile?.username || user?.email}</strong></span>
                    <button className="text-button" onClick={signOut}>Odhlásiť sa</button>
                </div>
            </div>

            <div className="lobby-content">
                <div className="lobby-panel">
                    <h2>Herné Módy</h2>

                    {/* Game Rules Selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '12px' }}>
                        <button
                            className={`secondary ${gameRules === 'hex' ? 'active' : ''}`}
                            style={{ flex: 1, margin: 0, opacity: gameRules === 'hex' ? 1 : 0.5, border: gameRules === 'hex' ? '1px solid var(--player1-color)' : 'none' }}
                            onClick={() => setGameRules('hex')}
                        >
                            Hex (Cesta)
                        </button>
                        <button
                            className={`secondary ${gameRules === 'points' ? 'active' : ''}`}
                            style={{ flex: 1, margin: 0, opacity: gameRules === 'points' ? 1 : 0.5, border: gameRules === 'points' ? '1px solid var(--player2-color)' : 'none' }}
                            onClick={() => setGameRules('points')}
                        >
                            Body (Rýchlosť)
                        </button>
                    </div>

                    <div className="modal-actions" style={{ flexDirection: 'column', gap: '1rem' }}>
                        <button className="primary" onClick={() => onStart1vBot(gameRules)}>
                            Hrať proti BOT-ovi
                        </button>
                        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Pre **Online Multiplayer** si vyhľadajte priateľa v paneli napravo a kliknite na "Vyzvať". Bude použitý zvolený mód vyššie.
                        </p>
                    </div>
                </div>

                <div className="lobby-panel friends-panel">
                    <h2>Priatelia a Hráči</h2>
                    <FriendsList selectedGameRules={gameRules} />
                </div>
            </div>
        </div>
    );
};

