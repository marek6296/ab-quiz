import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';
import { BilionarLobby } from './BilionarLobby';
import { BilionarGame } from './BilionarGame';

export const BilionarApp = ({ onBackToPortal, onlineUserIds }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);
    const [view, setView] = useState('lobby'); // 'lobby', 'game'
    const [activeGame, setActiveGame] = useState(null);

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, is_admin').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    return (
        <div className="bilionar-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {showAdmin && (
                <BilionarAdmin onBack={() => setShowAdmin(false)} />
            )}

            {!showAdmin && view === 'game' && (
                <BilionarGame
                    activeGame={activeGame}
                    onLeave={() => {
                        setActiveGame(null);
                        setView('lobby');
                    }}
                />
            )}

            {!showAdmin && view === 'lobby' && (
                <BilionarLobby
                    onStartGame={(startedGame) => {
                        setActiveGame(startedGame);
                        setView('game');
                    }}
                    onBackToPortal={onBackToPortal}
                    onShowAdmin={() => setShowAdmin(true)}
                    onlineUserIds={onlineUserIds}
                />
            )}
        </div>
    );
};
