import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';

export const BilionarApp = ({ onBackToPortal }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, is_admin').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    if (showAdmin) {
        return <BilionarAdmin onBack={() => setShowAdmin(false)} />;
    }

    return (
        <div className="game-container start-screen" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: 'white', padding: '1rem' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem', color: '#facc15', textShadow: '0 0 20px rgba(250, 204, 21, 0.4)' }}>
                💰 Bilionár Battle
            </h1>
            <p style={{ fontSize: '1.2rem', color: '#cbd5e1', marginBottom: '3rem', textAlign: 'center', maxWidth: '600px' }}>
                Základná konštrukcia pripravená. Hra bude pre maximálne 8 hráčov na čas.
                Kto odpovie prvý, získa najviac bodov!
            </p>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="primary" style={{ padding: '1rem 3rem', fontSize: '1.2rem' }}>
                    Nová hra v príprave...
                </button>
                {profile?.is_admin && (
                    <button className="secondary" onClick={() => setShowAdmin(true)} style={{ padding: '1rem 3rem', fontSize: '1.2rem', border: '1px solid #facc15', color: '#facc15', background: 'rgba(250, 204, 21, 0.1)' }}>
                        Administrácia
                    </button>
                )}
                <button className="neutral" onClick={onBackToPortal} style={{ padding: '1rem 3rem', fontSize: '1.2rem' }}>
                    Späť do menu
                </button>
            </div>
        </div>
    );
};
