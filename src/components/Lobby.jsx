import React from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FriendsList } from './auth/FriendsList';

export const Lobby = ({ onStart1vCPU, onStartOnline }) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = React.useState(null);

    React.useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    return (
        <div className="game-container start-screen lobby">
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
                    <div className="modal-actions" style={{ flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <button className="primary" onClick={onStart1vCPU}>
                            Hrať proti Počítaču (CPU)
                        </button>
                        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Pre **Online Multiplayer** si vyhľadajte priateľa v paneli napravo a kliknite na "Vyzvať".
                        </p>
                    </div>
                </div>

                <div className="lobby-panel friends-panel">
                    <h2>Priatelia a Hráči</h2>
                    <FriendsList />
                </div>
            </div>
        </div>
    );
};

