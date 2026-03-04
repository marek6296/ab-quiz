import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { FriendsList } from '../components/auth/FriendsList';

// Simple helper to generate a random 6-character alphanumeric code
const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const BilionarLobby = ({
    onStartGame,
    onBackToPortal,
    onShowAdmin,
    onlineUserIds = new Set(),
    pendingGameId = null,
    onClearPending = () => { },
    activeGame,
    players = [],
    onSetGame
}) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = useState(null);
    const [activeTab, setActiveTab] = useState('play'); // play, friends, profile

    // UI State for modes
    const [view, setView] = useState('menu'); // 'menu', 'join', 'room', 'matchmaking', 'setup'
    const [setupMode, setSetupMode] = useState(null); // 'quick', 'host', 'invite', 'bot'
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const matchmakingTimer = useRef(null);

    // Game Setup State
    const [availableCategories, setAvailableCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [difficulty, setDifficulty] = useState([2]); // Default to Stredné
    const [botDifficulty, setBotDifficulty] = useState(2);

    // Initial load
    useEffect(() => {
        if (user) {
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('bilionar_questions').select('category');
            if (data) {
                const unique = [...new Set(data.map(q => q.category))].sort();
                setAvailableCategories(unique);
            }
        };
        fetchCategories();
    }, []);

    // Check if user is already in a waiting lobby (e.g. accepted an invite)
    useEffect(() => {
        const checkExistingLobby = async () => {
            if (!user || activeGame) return; // Only check if no active game is already set
            setLoading(true);
            const { data } = await supabase
                .from('bilionar_players')
                .select('game_id, bilionar_games(*)')
                .eq('user_id', user.id)
                .order('joined_at', { ascending: false })
                .limit(10);

            if (data && data.length > 0) {
                // Find first valid game (waiting or playing, NOT finished)
                const validGameRow = data.find(row => {
                    const g = row.bilionar_games;
                    return g && ['waiting', 'playing'].includes(g.status) && g.state?.phase !== 'finished';
                });

                if (validGameRow) {
                    const game = validGameRow.bilionar_games;
                    onSetGame(game);

                    // If it's still waiting, go to room. If playing, setting activeGame will let BilionarApp handle transition
                    if (game.status === 'waiting') {
                        setView('room');
                    }
                    setActiveTab('play');
                } else {
                    // Safe cleanup: if they have dangling player records for dead games, let's remove them
                    // This prevents ghost reconnections in the future.
                    supabase.from('bilionar_players').delete().eq('user_id', user.id).then();
                }
            }
            setLoading(false);
        };
        checkExistingLobby();
    }, [user, activeGame, onSetGame]);

    // Handle incoming pending game (invited directly while active)
    useEffect(() => {
        const handlePending = async () => {
            if (pendingGameId && !activeGame) {
                setLoading(true);
                const { data: game, error } = await supabase.from('bilionar_games').select('*').eq('id', pendingGameId).single();
                if (game) {
                    onSetGame(game);
                    setView('room');
                    setActiveTab('play');
                    if (onClearPending) onClearPending();
                } else if (error) {
                    console.error("Error loading pending game:", error);
                }
                setLoading(false);
            }
        };
        handlePending();
    }, [pendingGameId, activeGame, onSetGame, onClearPending]);

    // Update local view state based on activeGame existence
    useEffect(() => {
        if (activeGame && view !== 'room') {
            setView('room');
        } else if (!activeGame && view === 'room') {
            setView('menu');
        }
    }, [activeGame, view]);

    const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

    const handleHostGame = async (config = {}) => {
        if (!profile) return;
        setLoading(true);
        setErrorMsg('');

        const joinCode = generateJoinCode();
        const { cats = [], diffs = [2], isPublic = false } = config;

        // Create Game (Private by default)
        const { data: game, error: gameError } = await supabase.from('bilionar_games').insert([{
            host_id: user.id,
            join_code: joinCode,
            status: 'waiting',
            is_public: isPublic,
            settings: {
                questions_count: 10,
                difficulty: diffs[0] || 2,
                categories: cats,
                difficulty_levels: diffs
            },
            state: { phase: 'init' }
        }]).select().single();

        if (gameError) {
            setErrorMsg('Nepodarilo sa vytvoriť hru: ' + gameError.message);
            setLoading(false);
            return gameError;
        }

        // Add Host as Player
        const { error: playerError } = await supabase.from('bilionar_players').insert([{
            game_id: game.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false,
            color: COLOR_PALETTE[0]
        }]);

        if (playerError) {
            setErrorMsg('Chyba pri priájaní: ' + playerError.message);
            setLoading(false);
            return playerError;
        }

        setActiveGame(game);
        await fetchPlayers(game.id);
        setView('room');
        setActiveTab('play');
        setLoading(false);
        return game;
    };

    const handleQuickGame = async (config = {}) => {
        if (!profile) return;
        setLoading(true);
        setErrorMsg('');
        setView('matchmaking');
        const { cats = [], diffs = [2] } = config;

        // Search for public lobbies with similar settings (if possible, otherwise any)
        const { data: lobbies } = await supabase.from('bilionar_games')
            .select('*, bilionar_players(count)')
            .eq('status', 'waiting')
            .eq('is_public', true)
            .neq('host_id', user.id)
            .order('created_at', { ascending: false });

        const availableLobby = lobbies?.find(l => {
            const count = l.bilionar_players?.[0]?.count || 0;
            if (count >= 8) return false;

            const lSettings = l.settings || {};
            const lCats = lSettings.categories || [];
            const lDiffs = lSettings.difficulty_levels || [2];

            // If user has specific categories, try to match
            if (cats.length > 0) {
                // If the lobby has cats, they must overlap. If the lobby is 'All', it's okay.
                if (lCats.length > 0 && !cats.some(c => lCats.includes(c))) return false;
            }

            // Simple difficulty check: must have at least one common difficulty
            if (!diffs.some(d => lDiffs.includes(d))) return false;

            return true;
        });

        if (availableLobby) {
            // Get current count for color assignment
            const { count } = await supabase.from('bilionar_players').select('*', { count: 'exact', head: true }).eq('game_id', availableLobby.id);
            const assignedColor = COLOR_PALETTE[count % COLOR_PALETTE.length];

            const { error: joinError } = await supabase.from('bilionar_players').upsert([{
                game_id: availableLobby.id,
                user_id: user.id,
                player_name: profile.username,
                avatar_url: profile.avatar_url,
                is_bot: false,
                color: assignedColor
            }], { onConflict: 'game_id,user_id' });

            if (!joinError) {
                setActiveGame(availableLobby);
                await fetchPlayers(availableLobby.id);
                setView('room');
                setLoading(false);
                return;
            }
        }

        // No suitable lobby found after a short wait (simulated)
        if (matchmakingTimer.current) clearTimeout(matchmakingTimer.current);
        matchmakingTimer.current = setTimeout(async () => {
            const joinCode = generateJoinCode();
            const { data: newGame, error: createError } = await supabase.from('bilionar_games').insert([{
                host_id: user.id,
                join_code: joinCode,
                status: 'waiting',
                is_public: true,
                settings: {
                    questions_count: 10,
                    difficulty: diffs[0] || 2,
                    categories: cats,
                    difficulty_levels: diffs
                },
                state: { phase: 'init' }
            }]).select().single();

            if (!createError) {
                await supabase.from('bilionar_players').insert([{
                    game_id: newGame.id,
                    user_id: user.id,
                    player_name: profile.username,
                    avatar_url: profile.avatar_url,
                    is_bot: false,
                    color: COLOR_PALETTE[0]
                }]);
                setActiveGame(newGame);
                await fetchPlayers(newGame.id);
                setView('room');
            } else {
                setErrorMsg('Chyba pri vytváraní: ' + createError.message);
                setView('menu');
            }
            setLoading(false);
        }, 1500);
    };

    const handleStartFromSetup = async () => {
        const config = { cats: selectedCategories, diffs: difficulty };

        if (setupMode === 'quick') {
            handleQuickGame(config);
        } else if (setupMode === 'host') {
            handleHostGame({ ...config, isPublic: false });
        } else if (setupMode === 'invite') {
            const game = await handleHostGame({ ...config, isPublic: false });
            if (game && !game.message) {
                setIsInviteModalOpen(true);
            }
        } else if (setupMode === 'bot') {
            // Create game, add host, add bot, and start immediately
            setLoading(true);
            const joinCode = generateJoinCode();
            const { data: game, error } = await supabase.from('bilionar_games').insert([{
                host_id: user.id,
                join_code: joinCode,
                status: 'playing', // Start playing immediately for bot game
                is_public: false,
                settings: {
                    questions_count: 10,
                    difficulty: difficulty[0] || 2,
                    categories: selectedCategories,
                    difficulty_levels: difficulty,
                    bot_difficulty: botDifficulty
                },
                state: { phase: 'init' }
            }]).select().single();

            if (game) {
                // Add Host
                await supabase.from('bilionar_players').insert([{
                    game_id: game.id, user_id: user.id, player_name: profile.username, avatar_url: profile.avatar_url, is_bot: false, color: COLOR_PALETTE[0]
                }]);
                // Add Bot
                const botAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`;
                await supabase.from('bilionar_players').insert([{
                    game_id: game.id, is_bot: true, player_name: 'Bot Inteligent', avatar_url: botAvatar, score: 0, color: COLOR_PALETTE[1]
                }]);

                onStartGame(game);
            } else {
                setErrorMsg('Chyba: ' + (error?.message || 'Unknown error'));
            }
            setLoading(false);
        }
    };

    const toggleCategory = (cat) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
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

        const assignedColor = COLOR_PALETTE[count % COLOR_PALETTE.length];

        // Add User as Player
        const { error: playerError } = await supabase.from('bilionar_players').upsert([{
            game_id: game.id,
            user_id: user.id,
            player_name: profile.username,
            avatar_url: profile.avatar_url,
            is_bot: false,
            color: assignedColor
        }], { onConflict: 'game_id,user_id' });

        if (playerError) {
            setErrorMsg('Nepodarilo sa pripojiť: ' + playerError.message);
            setLoading(false);
            return;
        }

        onSetGame(game);
        setView('room');
        setActiveTab('play');
        setLoading(false);
    };

    const handleAddBot = async () => {
        if (!activeGame || players.length >= 8) return;
        setLoading(true);

        const botNum = players.filter(p => p.is_bot).length + 1;
        const botName = `Bot ${botNum}`;
        const botAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`; // Random robot avatar

        // Find first unused color
        const usedColors = new Set(players.map(p => p.color));
        let assignedColor = COLOR_PALETTE.find(c => !usedColors.has(c)) || COLOR_PALETTE[players.length % COLOR_PALETTE.length];

        const { error } = await supabase.from('bilionar_players').insert([{
            game_id: activeGame.id,
            is_bot: true,
            player_name: botName,
            avatar_url: botAvatar,
            color: assignedColor
        }]);

        if (error) {
            console.error("Error adding bot:", error);
        }
        setLoading(false);
    };

    const handleRemovePlayer = async (playerId) => {
        if (!activeGame) return;
        await supabase.from('bilionar_players').delete().eq('id', playerId);
    };

    const handleLeaveRoom = async () => {
        if (activeGame) {
            if (activeGame.host_id === user.id) {
                // Delete all players first to prevent foreign key constraint issues if no CASCADE is setup
                await supabase.from('bilionar_players').delete().eq('game_id', activeGame.id);
                await supabase.from('bilionar_games').delete().eq('id', activeGame.id);
            } else {
                await supabase.from('bilionar_players').delete().eq('game_id', activeGame.id).eq('user_id', user.id);
            }
        }
        onSetGame(null);
        setView('menu');
        setJoinCodeInput('');
    };

    const handleStartMatch = async () => {
        if (!activeGame || activeGame.host_id !== user.id) return;
        setLoading(true);
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

    return (
        <div className="dashboard-layout">
            <aside className="dashboard-sidebar">
                <div className="sidebar-logo">
                    <h1 className="logo-brutal">
                        Bilionár Battle
                    </h1>
                </div>

                <nav className="sidebar-nav">
                    <button className={`nav-item ${activeTab === 'play' ? 'active' : ''}`} onClick={() => { setActiveTab('play'); setView(activeGame ? 'room' : 'menu'); }} style={{ ...(activeTab === 'play' && { background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', borderLeft: '4px solid #facc15' }) }}>
                        <span style={{ fontSize: '1.5rem' }}>🎮</span> Hrať
                    </button>
                    <button className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')} style={{ ...(activeTab === 'friends' && { background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', borderLeft: '4px solid #facc15' }) }}>
                        <span style={{ fontSize: '1.5rem' }}>👥</span> Priatelia
                    </button>
                    <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')} style={{ ...(activeTab === 'profile' && { background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', borderLeft: '4px solid #facc15' }) }}>
                        <span style={{ fontSize: '1.5rem' }}>👤</span> Profil
                    </button>
                    {profile?.is_admin && onShowAdmin && (
                        <button className="nav-item" onClick={onShowAdmin} style={{ color: '#f8fafc', fontWeight: 'bold' }}>
                            <span style={{ fontSize: '1.5rem' }}>🛠️</span> Administrácia
                        </button>
                    )}
                </nav>

                <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
                    <button className="nav-item" onClick={onBackToPortal} style={{ width: '100%', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <span style={{ fontSize: '1.5rem' }}>⬅️</span> Zmeniť hru
                    </button>
                </div>

                <div className="user-profile" style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0,
                        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {profile?.avatar_url ? (
                            <img
                                src={`${profile.avatar_url}${profile.avatar_url.includes('?') ? '&' : '?'}t=${Date.now()}`}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerText = '👤'; }}
                            />
                        ) : '👤'}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 'bold', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{profile?.username || 'Hráč'}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Online</div>
                    </div>
                </div>
            </aside>

            <main className="dashboard-content">
                <div className="mobile-only-logo">
                    <h1 className="logo-brutal" style={{ color: '#facc15', textShadow: '0 0 10px rgba(250, 204, 21, 0.3)' }}>Bilionár Battle</h1>
                </div>

                {activeTab === 'play' && (
                    <>
                        {view === 'menu' && (
                            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#f8fafc' }}>Vyberte si herný režim</h2>
                                <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem' }}>Vyberte si, ako a s kým chcete hrať o milióny.</p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                                    <div className="mode-card primary" onClick={() => { setSetupMode('quick'); setView('setup'); }} style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(0,0,0,0.4) 100%)', border: '2px solid rgba(250, 204, 21, 0.4)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
                                        <h3 style={{ color: '#facc15' }}>Rýchla Hra</h3>
                                        <p>Najrýchlejšia cesta k miliónu. Pripojíme ťa k náhodným hráčom v otvorenej miestnosti.</p>
                                        <span style={{ color: '#facc15', fontWeight: 'bold', marginTop: 'auto' }}>Hrať okamžite →</span>
                                    </div>

                                    <div className="mode-card primary" onClick={() => { setSetupMode('host'); setView('setup'); }} style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(0,0,0,0.4) 100%)', border: '2px solid rgba(250, 204, 21, 0.4)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                                        <h3 style={{ color: '#facc15' }}>Založiť Miestnosť</h3>
                                        <p>Vytvor privátnu hru pre seba a priateľov. Budeš hostiteľ a správca miestnosti.</p>
                                        <span style={{ color: '#facc15', fontWeight: 'bold', marginTop: 'auto' }}>Vytvoriť →</span>
                                    </div>

                                    <div className="mode-card primary" onClick={() => setView('join')} style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(0,0,0,0.4) 100%)', border: '2px solid rgba(250, 204, 21, 0.4)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔑</div>
                                        <h3 style={{ color: '#facc15' }}>Pripojiť sa</h3>
                                        <p>Máš kód od kamaráta? Zadaj ho a prepoj sa priamo do jeho hry.</p>
                                        <span style={{ color: '#facc15', fontWeight: 'bold', marginTop: 'auto' }}>Zadať kód →</span>
                                    </div>

                                    <div className="mode-card primary" onClick={() => { setSetupMode('invite'); setView('setup'); }} style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(0,0,0,0.4) 100%)', border: '2px solid rgba(250, 204, 21, 0.4)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                                        <h3 style={{ color: '#facc15' }}>Hrať s priateľmi</h3>
                                        <p>Pozvi svojich priateľov priamo zo zoznamu do súkromnej hry.</p>
                                        <span style={{ color: '#facc15', fontWeight: 'bold', marginTop: 'auto' }}>Pozvať →</span>
                                    </div>

                                    <div className="mode-card primary" onClick={() => { setSetupMode('bot'); setView('setup'); }} style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(0,0,0,0.4) 100%)', border: '2px solid rgba(250, 204, 21, 0.4)' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
                                        <h3 style={{ color: '#facc15' }}>Tréning s BOTom</h3>
                                        <p>Hraj proti nášmu inteligentnému robotovi na offline tréning.</p>
                                        <span style={{ color: '#facc15', fontWeight: 'bold', marginTop: 'auto' }}>Trénovať →</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'setup' && (
                            <div className="setup-panel" style={{ maxWidth: '800px', margin: '0 auto', background: 'rgba(0,0,0,0.4)', borderRadius: '24px', padding: '2.5rem', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
                                <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>←</span> Späť na výber
                                </button>

                                <h2 style={{ fontSize: '2.5rem', color: '#facc15', marginBottom: '2rem', textShadow: '0 0 10px rgba(250, 204, 21, 0.3)' }}>Nastavenia Hry</h2>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    {/* Categories */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                                            <label style={{ color: '#94a3b8', fontWeight: 'bold' }}>Kategórie otázok</label>
                                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Označených: {selectedCategories.length || 'Všetky'}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => setSelectedCategories([])}
                                                style={{
                                                    padding: '0.75rem 1.25rem', borderRadius: '12px', fontSize: '0.9rem', border: 'none',
                                                    background: selectedCategories.length === 0 ? '#facc15' : 'rgba(255,255,255,0.05)',
                                                    color: selectedCategories.length === 0 ? '#0f172a' : '#f8fafc',
                                                    fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                🌈 Všetky
                                            </button>
                                            {availableCategories.map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => toggleCategory(cat)}
                                                    style={{
                                                        padding: '0.75rem 1.25rem', borderRadius: '12px', fontSize: '0.9rem',
                                                        border: selectedCategories.includes(cat) ? '1px solid #facc15' : '1px solid rgba(255,255,255,0.1)',
                                                        background: selectedCategories.includes(cat) ? 'rgba(250, 204, 21, 0.1)' : 'rgba(255,255,255,0.05)',
                                                        color: selectedCategories.includes(cat) ? '#facc15' : '#cbd5e1',
                                                        cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Difficulty */}
                                    <div>
                                        <label style={{ display: 'block', color: '#94a3b8', fontWeight: 'bold', marginBottom: '1rem' }}>Náročnosť otázok</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {[
                                                { level: 1, label: 'Ľahké', color: '#4ade80' },
                                                { level: 2, label: 'Stredné', color: '#fbbf24' },
                                                { level: 3, label: 'Ťažké', color: '#ef4444' }
                                            ].map(diff => (
                                                <button
                                                    key={diff.level}
                                                    onClick={() => setDifficulty(prev => {
                                                        if (prev.includes(diff.level)) {
                                                            if (prev.length === 1) return prev;
                                                            return prev.filter(d => d !== diff.level);
                                                        } else return [...prev, diff.level];
                                                    })}
                                                    style={{
                                                        flex: 1, padding: '1rem', borderRadius: '12px', border: difficulty.includes(diff.level) ? `2px solid ${diff.color}` : '1px solid rgba(255,255,255,0.1)',
                                                        background: difficulty.includes(diff.level) ? `${diff.color}15` : 'transparent',
                                                        color: difficulty.includes(diff.level) ? diff.color : '#94a3b8',
                                                        fontWeight: 'bold', cursor: 'pointer'
                                                    }}
                                                >
                                                    {diff.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bot Difficulty */}
                                    {setupMode === 'bot' && (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <label style={{ display: 'block', color: '#94a3b8', fontWeight: 'bold', marginBottom: '1rem' }}>Inteligencia Bota</label>
                                            <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '16px' }}>
                                                {[
                                                    { level: 1, label: 'Nováčik', icon: '🐣' },
                                                    { level: 2, label: 'Stredný', icon: '🧠' },
                                                    { level: 3, label: 'Génius', icon: '⚡' }
                                                ].map(botD => (
                                                    <button
                                                        key={botD.level}
                                                        onClick={() => setBotDifficulty(botD.level)}
                                                        style={{
                                                            flex: 1, padding: '1rem', borderRadius: '10px',
                                                            background: botDifficulty === botD.level ? '#facc15' : 'transparent',
                                                            color: botDifficulty === botD.level ? '#0f172a' : '#94a3b8',
                                                            border: 'none', fontWeight: 'bold', cursor: 'pointer',
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '1.5rem' }}>{botD.icon}</span>
                                                        <span>{botD.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleStartFromSetup}
                                        disabled={loading}
                                        style={{
                                            marginTop: '1rem', padding: '1.5rem', borderRadius: '16px', background: '#facc15', color: '#0f172a',
                                            fontWeight: '900', fontSize: '1.25rem', border: 'none', cursor: 'pointer',
                                            boxShadow: '0 8px 20px rgba(250, 204, 21, 0.3)', transition: 'all 0.2s'
                                        }}
                                    >
                                        {loading ? 'Pripravujem hru...' : 'SPUSTIŤ HRU →'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {view === 'join' && (
                            <div className="setup-panel" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
                                <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>←</span> Späť na výber
                                </button>
                                <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem', color: 'white' }}>Pripojiť sa do hry</h2>
                                <form onSubmit={handleJoinGame} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Zadajte 6-miestny kód"
                                        value={joinCodeInput}
                                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                                        maxLength={6}
                                        style={{ padding: '1.5rem', fontSize: '1.8rem', textAlign: 'center', letterSpacing: '4px', background: 'rgba(0,0,0,0.3)', border: '2px solid rgba(250, 204, 21, 0.5)', color: 'white', borderRadius: '12px', outline: 'none' }}
                                        autoFocus
                                    />
                                    {errorMsg && <p style={{ color: '#ef4444', margin: 0 }}>{errorMsg}</p>}
                                    <button type="submit" className="primary" disabled={loading || joinCodeInput.length < 3} style={{ padding: '1.2rem', background: '#facc15', color: '#0f172a', fontWeight: 'bold', fontSize: '1.2rem', border: 'none', borderRadius: '12px' }}>
                                        {loading ? 'Pripájam sa...' : 'Pripojiť sa do miestnosti'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {view === 'matchmaking' && (
                            <div className="setup-panel" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
                                <div className="loader" style={{ margin: '0 auto 2rem', width: '60px', height: '60px', border: '5px solid rgba(250, 204, 21, 0.1)', borderTop: '5px solid #facc15', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'white' }}>Hľadám súperov...</h2>
                                <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem' }}>Pripravujeme tvoj vstup do sveta veľkých peňazí.</p>
                                <button className="neutral" onClick={() => {
                                    if (matchmakingTimer.current) clearTimeout(matchmakingTimer.current);
                                    setView('menu');
                                }} style={{ padding: '1rem 2rem' }}>Zrušiť</button>
                                <style>{`
                                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                                `}</style>
                            </div>
                        )}

                        {view === 'room' && (
                            <div className="setup-panel" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(250, 204, 21, 0.5)' }}>
                                <h2 style={{ color: '#facc15', fontSize: '2.5rem', marginBottom: '1rem', textShadow: '0 0 10px rgba(250, 204, 21, 0.5)' }}>Pripravovňa</h2>
                                <div style={{ fontSize: '1.2rem', color: '#cbd5e1', marginBottom: '2rem' }}>
                                    Kód pre pripojenie: <strong style={{ fontSize: '2rem', letterSpacing: '4px', color: 'white', background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px dashed #facc15' }}>{activeGame?.join_code}</strong>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                                    {players.map(p => (
                                        <div key={p.id} style={{
                                            background: p.user_id === user.id ? 'rgba(250, 204, 21, 0.1)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${p.user_id === user.id ? 'rgba(250, 204, 21, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                                            padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem',
                                            position: 'relative'
                                        }}>
                                            {activeGame?.host_id === user.id && p.user_id !== user.id && (
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
                                    {Array.from({ length: 8 - players.length }).map((_, i) => (
                                        <div key={'empty' + i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', opacity: 0.5 }}>
                                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>❓</div>
                                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Voľné miesto</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button className="neutral" onClick={handleLeaveRoom} style={{ padding: '1rem 2rem' }}>⬅ Opustiť</button>
                                    {activeGame?.host_id === user.id && (
                                        <>
                                            <button className="secondary" onClick={() => setIsInviteModalOpen(true)} style={{ padding: '1rem 2rem', border: '1px solid #38bdf8', color: '#38bdf8', background: 'transparent' }}>
                                                👥 Pozvať priateľa
                                            </button>
                                            <button className="secondary" onClick={handleAddBot} disabled={players.length >= 8 || loading} style={{ padding: '1rem 2rem', border: '1px solid #facc15', color: '#facc15', background: 'transparent' }}>
                                                🤖 Pridať Bota
                                            </button>
                                            <button className="primary" onClick={handleStartMatch} disabled={players.length < 1 || loading} style={{ padding: '1rem 3rem', background: '#facc15', color: '#0f172a', fontWeight: 'bold' }}>
                                                {loading ? 'Štartujem...' : '▶ SPUSTIŤ HRU'}
                                            </button>
                                        </>
                                    )}
                                    {activeGame?.host_id !== user.id && (
                                        <div style={{ padding: '1rem', color: '#94a3b8', fontStyle: 'italic', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                                            Čaká sa na spustenie hry HOSTom...
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'friends' && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '2.5rem', color: '#f8fafc', margin: 0 }}>Social a Priatelia</h2>
                        </div>
                        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '20px', padding: '2rem', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
                            <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Vďaka tomuto panelu môžeš vyhľadávať iných hráčov a pridávať si ich do priateľov.</p>
                            <FriendsList
                                selectedGameRules="bilionar"
                                isBilionar={true}
                                onlineUserIds={onlineUserIds}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                        <h2 style={{ fontSize: '2.5rem', color: '#f8fafc', marginBottom: '2rem' }}>Môj Profil</h2>
                        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '20px', padding: '3rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 2rem' }}>
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    background: profile?.avatar_url ? 'transparent' : 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)',
                                    border: '4px solid rgba(255,255,255,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '3.5rem',
                                    overflow: 'hidden'
                                }}>
                                    {profile?.avatar_url ? (
                                        <img
                                            src={`${profile.avatar_url}${profile.avatar_url.includes('?') ? '&' : '?'}t=${Date.now()}`}
                                            alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerText = '👤'; }}
                                        />
                                    ) : '👤'}
                                </div>
                                <label
                                    htmlFor="avatar-upload"
                                    style={{
                                        position: 'absolute', bottom: '0', right: '0',
                                        background: '#facc15', width: '36px', height: '36px',
                                        borderRadius: '50%', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', cursor: 'pointer', border: '3px solid #0f172a',
                                        fontSize: '1.2rem'
                                    }}
                                >
                                    📷
                                </label>
                                <input
                                    id="avatar-upload"
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        const fileExt = file.name.split('.').pop();
                                        const fileName = `${user.id}-${Math.random()}.${fileExt}`;
                                        const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(fileName, file, { upsert: true, contentType: file.type });
                                        if (uploadError) { alert("Chyba pri nahrávaní: " + uploadError.message); return; }
                                        const { data: { publicUrl } } = supabase.storage.from('profile-pictures').getPublicUrl(fileName);
                                        const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
                                        if (updateError) { alert("Chyba pri aktualizácii profilu"); } else { setProfile(prev => ({ ...prev, avatar_url: publicUrl })); }
                                    }}
                                />
                            </div>

                            <h3 style={{ fontSize: '1.8rem', color: '#f8fafc', marginBottom: '0.5rem' }}>{profile?.username}</h3>
                            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>{user?.email}</p>

                            <hr style={{ borderColor: 'rgba(255,255,255,0.1)', marginBottom: '2rem' }} />

                            <button className="neutral" onClick={() => signOut()} style={{ padding: '1rem 2rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                                Odhlásiť sa zo systému
                            </button>
                        </div>
                    </div>
                )}

                {isInviteModalOpen && activeGame && (
                    <div className="modal-overlay" style={{ zIndex: 10000 }}>
                        <div className="modal-content glass-panel" style={{ maxWidth: '600px', width: '95%', padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, color: '#facc15' }}>Pozvať priateľov</h2>
                                <button onClick={() => setIsInviteModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '2rem', cursor: 'pointer' }}>×</button>
                            </div>
                            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                <FriendsList
                                    selectedGameRules="bilionar"
                                    isBilionar={true}
                                    onlineUserIds={onlineUserIds}
                                    existingBilionarGameId={activeGame.id}
                                />
                            </div>
                            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                                <button className="primary" onClick={() => setIsInviteModalOpen(false)} style={{ padding: '1rem 2rem' }}>Hotovo</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
