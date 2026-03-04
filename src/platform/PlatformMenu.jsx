import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const PlatformMenu = ({ onLobbyJoined, onSignOut }) => {
    const { user } = useAuth();
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    if (!user) return null;

    const generateJoinCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const handleCreateLobby = async () => {
        if (!profile) return;
        setLoading(true);
        setErrorMsg('');

        const code = generateJoinCode();

        // Vytvorenie platform_lobbies riadku
        const { data: lobby, error: lobbyError } = await supabase.from('platform_lobbies').insert([{
            host_id: user.id,
            join_code: code,
            status: 'waiting',
            selected_game: 'bilionar_battle', // default game
            settings: {}
        }]).select().single();

        if (lobbyError) {
            setErrorMsg('Chyba pri vytváraní Lobby: ' + lobbyError.message);
            setLoading(false);
            return;
        }

        // Add Host as Player
        const { error: playerError } = await supabase.from('platform_players').insert([{
            lobby_id: lobby.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false,
            color: '#eab308'
        }]);

        if (playerError) {
            setErrorMsg('Chyba pri pripájaní: ' + playerError.message);
            setLoading(false);
            return;
        }

        setLoading(false);
        onLobbyJoined(lobby.id);
    };

    const handleJoinLobby = async (e) => {
        e.preventDefault();
        if (!profile || !joinCode.trim()) return;
        setLoading(true);
        setErrorMsg('');

        const code = joinCode.trim().toUpperCase();

        const { data: lobby, error: lobbyError } = await supabase.from('platform_lobbies')
            .select('*').eq('join_code', code).single();

        if (lobbyError || !lobby) {
            setErrorMsg('Lobby s týmto kódom neexistuje.');
            setLoading(false);
            return;
        }

        if (lobby.status !== 'waiting') {
            setErrorMsg('Hra už začala alebo skončila.');
            setLoading(false);
            return;
        }

        const { count } = await supabase.from('platform_players').select('*', { count: 'exact', head: true }).eq('lobby_id', lobby.id);

        if (count >= 8) {
            setErrorMsg('Miestnosť je plná (max 8 hráčov).');
            setLoading(false);
            return;
        }

        // Add User as Player
        const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
        const assignedColor = COLOR_PALETTE[count % COLOR_PALETTE.length];

        const { error: playerError } = await supabase.from('platform_players').upsert([{
            lobby_id: lobby.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false,
            color: assignedColor
        }], { onConflict: 'lobby_id,user_id' });

        if (playerError) {
            setErrorMsg('Nepodarilo sa pripojiť: ' + playerError.message);
            setLoading(false);
            return;
        }

        setLoading(false);
        onLobbyJoined(lobby.id);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            width: '100%',
            minHeight: '80vh'
        }}>
            <div className="entrance-fade" style={{ animationDelay: '0.1s', textAlign: 'center', maxWidth: '600px', width: '100%' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#f8fafc', textShadow: '0 0 20px rgba(52, 211, 153, 0.4)' }}>Multiplayer Lobby</h1>
                <p style={{ color: '#94a3b8', fontSize: '1.2rem', marginBottom: '3rem' }}>Založte si novú Lobby izbu alebo sa pripojte k priateľom.</p>

                {errorMsg && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '1rem', borderRadius: '12px', marginBottom: '2rem' }}>
                        {errorMsg}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center' }}>

                    {/* Skupina 1: Vytvoriť Lobby */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', width: '100%' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#f8fafc' }}>🏠 Vytvoriť novú Lobby</h3>
                        <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Stanete sa hostiteľom a budete môcť pre hostí zvoliť ľubovoľnú hru z dostupných titulov.</p>
                        <button
                            className="primary"
                            onClick={handleCreateLobby}
                            disabled={loading}
                            style={{ padding: '1.2rem 3rem', fontSize: '1.2rem', width: '100%', background: '#3b82f6', color: 'white', fontWeight: 'bold' }}>
                            {loading ? 'Pripravujem...' : 'Vytvoriť Lobby'}
                        </button>
                    </div>

                    <div style={{ color: '#64748b', fontWeight: 'bold' }}>ALEBO</div>

                    {/* Skupina 2: Pripojiť sa cez kód */}
                    <form onSubmit={handleJoinLobby} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', width: '100%' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#f8fafc' }}>🔑 Pripojiť sa do existujúcej Lobby</h3>
                        <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Zadajte vstupný šesťmiestny kód, ktorý vám poslal kamarát.</p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <input
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                                placeholder="Napr. X8YQ2K"
                                style={{
                                    flex: 1, padding: '1.2rem', fontSize: '1.2rem', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(0,0,0,0.5)', color: 'white', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px', fontWeight: 'bold'
                                }}
                            />
                            <button
                                type="submit"
                                className="neutral"
                                disabled={loading || joinCode.length < 3}
                                style={{ padding: '1.2rem 2rem', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>
                                Vstúpiť
                            </button>
                        </div>
                    </form>

                </div>
            </div>
        </div>
    );
};
