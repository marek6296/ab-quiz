import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Simple helper to generate a random 6-character alphanumeric code
const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const BilionarLobby = ({ onStartGame, onBack }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);

    // UI State
    const [view, setView] = useState('menu'); // 'menu', 'host', 'join', 'room'
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    // Room State
    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        if (user) {
            supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    // Supabase Realtime Subscription for the active game
    useEffect(() => {
        if (!activeGame) return;

        const channel = supabase.channel(`bilionar_room_${activeGame.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bilionar_players', filter: `game_id=eq.${activeGame.id}` }, (payload) => {
                fetchPlayers(activeGame.id);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bilionar_games', filter: `id=eq.${activeGame.id}` }, (payload) => {
                setActiveGame(payload.new);
                if (payload.new.status === 'playing') {
                    onStartGame(payload.new);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeGame]);

    const fetchPlayers = async (gameId) => {
        const { data } = await supabase.from('bilionar_players').select('*').eq('game_id', gameId).order('joined_at', { ascending: true });
        if (data) setPlayers(data);
    };

    const handleHostGame = async () => {
        if (!profile) return;
        setLoading(true);
        setErrorMsg('');

        const joinCode = generateJoinCode();

        // Create Game
        const { data: game, error: gameError } = await supabase.from('bilionar_games').insert([{
            host_id: user.id,
            join_code: joinCode,
            status: 'waiting',
            settings: { questions_count: 10, difficulty: 2 },
            state: { current_question_index: 0, start_time: null }
        }]).select().single();

        if (gameError) {
            setErrorMsg('Nepodarilo sa vytvoriť hru: ' + gameError.message);
            setLoading(false);
            return;
        }

        // Add Host as Player
        const { error: playerError } = await supabase.from('bilionar_players').insert([{
            game_id: game.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false
        }]);

        if (playerError) {
            setErrorMsg('Chyba pri priájaní: ' + playerError.message);
            setLoading(false);
            return;
        }

        setActiveGame(game);
        await fetchPlayers(game.id);
        setView('room');
        setLoading(false);
    };

    const handleJoinGame = async (e) => {
        e.preventDefault();
        if (!profile || !joinCodeInput.trim()) return;
        setLoading(true);
        setErrorMsg('');

        const code = joinCodeInput.trim().toUpperCase();

        // Check if game exists
        const { data: game, error: gameError } = await supabase.from('bilionar_games').select('*').eq('join_code', code).single();

        if (gameError || !game) {
            setErrorMsg('Hra s týmto kódom neexistuje.');
            setLoading(false);
            return;
        }

        if (game.status !== 'waiting') {
            setErrorMsg('Hra už začala alebo skončila.');
            setLoading(false);
            return;
        }

        // Check if room is full
        const { count } = await supabase.from('bilionar_players').select('*', { count: 'exact', head: true }).eq('game_id', game.id);

        if (count >= 8) {
            setErrorMsg('Miestnosť je plná (max 8 hráčov).');
            setLoading(false);
            return;
        }

        // Add User as Player
        const { error: playerError } = await supabase.from('bilionar_players').upsert([{
            game_id: game.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false
        }], { onConflict: 'game_id,user_id' }); // Upsert if they are rejoining

        if (playerError) {
            setErrorMsg('Nepodarilo sa pripojiť: ' + playerError.message);
            setLoading(false);
            return;
        }

        setActiveGame(game);
        await fetchPlayers(game.id);
        setView('room');
        setLoading(false);
    };

    const handleAddBot = async () => {
        if (!activeGame || players.length >= 8) return;
        setLoading(true);

        const botNum = players.filter(p => p.is_bot).length + 1;
        const botName = `Bot ${botNum}`;
        const botAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`; // Random robot avatar

        const { error } = await supabase.from('bilionar_players').insert([{
            game_id: activeGame.id,
            is_bot: true,
            player_name: botName,
            avatar_url: botAvatar
        }]);

        if (error) {
            console.error("Error adding bot:", error);
        } else {
            fetchPlayers(activeGame.id);
        }
        setLoading(false);
    };

    const handleRemovePlayer = async (playerId) => {
        if (!activeGame) return;
        await supabase.from('bilionar_players').delete().eq('id', playerId);
        fetchPlayers(activeGame.id);
    };

    const handleLeaveRoom = async () => {
        if (activeGame) {
            // Delete player entry. Wait, what if host leaves? For now, just delete player. If host, maybe the game gets stuck.
            // A more solid solution would cascade delete the game if the host leaves, but simple delete for now.
            if (activeGame.host_id === user.id) {
                await supabase.from('bilionar_games').delete().eq('id', activeGame.id);
            } else {
                await supabase.from('bilionar_players').delete().eq('game_id', activeGame.id).eq('user_id', user.id);
            }
        }
        setActiveGame(null);
        setPlayers([]);
        setView('menu');
        setJoinCodeInput('');
    };

    const handleStartMatch = async () => {
        if (!activeGame || activeGame.host_id !== user.id) return;
        setLoading(true);
        // Change game status to 'playing'
        // Subscribers will catch this and jump to the game state
        await supabase.from('bilionar_games').update({ status: 'playing' }).eq('id', activeGame.id);
        setLoading(false);
    };

    const renderAvatar = (url, size = '48px') => {
        return (
            <div style={{
                width: size, height: size, borderRadius: '50%', overflow: 'hidden',
                background: 'rgba(255, 255, 255, 0.1)', border: '2px solid rgba(250, 204, 21, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 0 10px rgba(250, 204, 21, 0.2)'
            }}>
                {url ? (
                    <img src={url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                ) : null}
                <div style={{ display: url ? 'none' : 'block', fontSize: `calc(${size} * 0.5)` }}>👤</div>
            </div>
        );
    };

    if (view === 'room') {
        const isHost = activeGame?.host_id === user.id;

        return (
            <div className="lobby-panel" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '2px solid #facc15' }}>
                <h2 style={{ color: '#facc15', fontSize: '2.5rem', marginBottom: '1rem', textShadow: '0 0 10px rgba(250, 204, 21, 0.5)' }}>Pripravovňa</h2>
                <div style={{ fontSize: '1.2rem', color: '#cbd5e1', marginBottom: '2rem' }}>
                    Kód pre pripojenie: <strong style={{ fontSize: '2rem', letterSpacing: '4px', color: 'white', background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px dashed #facc15' }}>{activeGame?.join_code}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {players.map(p => (
                        <div key={p.id} style={{
                            background: p.user_id === user.id ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${p.user_id === user.id ? '#facc15' : 'rgba(255,255,255,0.1)'}`,
                            padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem',
                            position: 'relative'
                        }}>
                            {isHost && p.user_id !== user.id && (
                                <button onClick={() => handleRemovePlayer(p.id)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer' }}>✖</button>
                            )}
                            {renderAvatar(p.avatar_url, '60px')}
                            <span style={{ fontWeight: 'bold', color: 'white', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                {p.player_name}
                            </span>
                            {activeGame?.host_id === p.user_id && <span style={{ fontSize: '0.7rem', color: '#facc15', marginTop: '-5px' }}>👑 HOST</span>}
                            {p.is_bot && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '-5px' }}>🤖 BOT</span>}
                        </div>
                    ))}
                    {/* Empty slots placeholders */}
                    {Array.from({ length: 8 - players.length }).map((_, i) => (
                        <div key={'empty' + i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', opacity: 0.5 }}>
                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>❓</div>
                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Čaká sa na hráča...</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="neutral" onClick={handleLeaveRoom} style={{ padding: '1rem 2rem' }}>⬅ Opustiť</button>
                    {isHost && (
                        <>
                            <button className="secondary" onClick={handleAddBot} disabled={players.length >= 8 || loading} style={{ padding: '1rem 2rem', border: '1px solid #38bdf8', color: '#38bdf8' }}>
                                🤖 Pridať Bota
                            </button>
                            <button className="primary" onClick={handleStartMatch} disabled={players.length < 1 || loading} style={{ padding: '1rem 3rem', background: '#facc15', color: '#0f172a', fontWeight: 'bold' }}>
                                {loading ? 'Štartujem...' : '▶ SPUSTIŤ HRU'}
                            </button>
                        </>
                    )}
                    {!isHost && (
                        <div style={{ padding: '1rem', color: '#94a3b8', fontStyle: 'italic', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                            Čaká sa na spustenie hry HOSTom...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'join') {
        return (
            <div className="lobby-panel" style={{ width: '100%', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
                <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: 'white' }}>Pripojiť sa do hry</h2>
                <form onSubmit={handleJoinGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="text"
                        placeholder="Zadajte 6-miestny kód"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        maxLength={6}
                        style={{ padding: '1rem', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '2px', background: 'rgba(0,0,0,0.3)', border: '2px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px' }}
                        autoFocus
                    />
                    {errorMsg && <p style={{ color: '#ef4444', margin: 0 }}>{errorMsg}</p>}
                    <button type="submit" className="primary" disabled={loading || joinCodeInput.length < 3} style={{ padding: '1rem', background: '#facc15', color: '#0f172a' }}>
                        {loading ? 'Pripájam sa...' : 'Pripojiť'}
                    </button>
                    <button type="button" className="neutral" onClick={() => { setView('menu'); setErrorMsg(''); }} style={{ padding: '1rem' }}>Zrušiť</button>
                </form>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
            <button
                className="primary"
                onClick={handleHostGame}
                disabled={loading}
                style={{ padding: '1.5rem', fontSize: '1.5rem', borderRadius: '16px', background: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)', color: '#0f172a', fontWeight: 'bold', border: 'none', boxShadow: '0 10px 20px rgba(250, 204, 21, 0.3)' }}
            >
                👑 Vytvoriť Hru (Host)
            </button>
            <button
                className="secondary"
                onClick={() => setView('join')}
                style={{ padding: '1.5rem', fontSize: '1.5rem', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
            >
                🤝 Pripojiť na Kód
            </button>

            {errorMsg && <p style={{ color: '#ef4444', textAlign: 'center' }}>{errorMsg}</p>}

            <button className="neutral" onClick={onBack} style={{ padding: '1rem', marginTop: '1rem' }}>
                ⬅ Späť
            </button>
        </div>
    );
};
