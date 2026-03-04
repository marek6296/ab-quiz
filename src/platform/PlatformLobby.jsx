import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { FriendsList } from '../components/auth/FriendsList';
import { generateInitialBoard } from '../game-engine/board';

const GAMES = [
    { id: 'quiz', name: 'Kvíz Duel (AZ Kvíz)', max: 2, icon: '🧠', color: '#3b82f6' },
    { id: 'bilionar', name: 'Bilionár Battle', max: 8, icon: '💰', color: '#facc15' },
    { id: 'higher_lower', name: 'Vyššie alebo Nižšie', max: 8, icon: '📈', color: '#10b981' }
];

const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

export const PlatformLobby = ({ initialLobbyId, onlineUserIds, onLeaveLobby, onStartGameFlow }) => {
    const { user } = useAuth();
    const [lobbyId, setLobbyId] = useState(initialLobbyId);
    const [lobby, setLobby] = useState(null);
    const [players, setPlayers] = useState([]);
    const playersRef = React.useRef([]);
    const [loading, setLoading] = useState(true);
    const [countdown, setCountdown] = useState(null);

    // -- GAME SETTINGS STATE --
    const [gameRules, setGameRules] = useState('hex'); // 'hex' vs 'points'
    const [difficulty, setDifficulty] = useState([2]);
    const [botDifficulty, setBotDifficulty] = useState(2);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [availableQuizCategories, setAvailableQuizCategories] = useState([]);
    const [availableBilionarCategories, setAvailableBilionarCategories] = useState([]);

    // Fetch categories on mount
    useEffect(() => {
        const fetchCategories = async () => {
            const { data: qData } = await supabase.from('questions').select('category');
            if (qData) {
                const unique = [...new Set(qData.map(q => q.category).filter(Boolean))].sort();
                setAvailableQuizCategories(unique);
            }
            const { data: bData } = await supabase.from('bilionar_questions').select('category');
            if (bData) {
                const unique = [...new Set(bData.map(q => q.category).filter(Boolean))].sort();
                setAvailableBilionarCategories(unique);
            }
        };
        fetchCategories();
    }, []);

    // Initializácia domovskej permanentnej Lobby
    useEffect(() => {
        if (initialLobbyId || !user?.id) return;

        const initHomeLobby = async () => {
            const { data } = await supabase.from('platform_lobbies').select('id').eq('host_id', user.id).single();
            if (data) {
                setLobbyId(data.id);
            } else {
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                const { data: newLobby } = await supabase.from('platform_lobbies').insert([{
                    host_id: user.id,
                    join_code: code,
                    status: 'waiting',
                    selected_game: 'bilionar',
                    settings: {}
                }]).select().single();

                if (newLobby) {
                    const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single();
                    await supabase.from('platform_players').insert([{
                        lobby_id: newLobby.id,
                        user_id: user.id,
                        player_name: profile?.username || 'Host',
                        avatar_url: profile?.avatar_url || '',
                        is_bot: false,
                        color: '#eab308'
                    }]);
                    setLobbyId(newLobby.id);
                }
            }
        };
        initHomeLobby();
    }, [initialLobbyId, user]);

    // Keep ref updated for the postgres_changes closure
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const isHost = lobby?.host_id === user?.id;

    useEffect(() => {
        if (!lobbyId) return;

        const fetchLobby = async () => {
            const { data, error } = await supabase.from('platform_lobbies').select('*').eq('id', lobbyId).single();
            if (error || !data) {
                // Ak sa načítanie nepodarí, a ide o našu vlastnú home lobby, mali by sme ju recreatenúť?
                // Nateraz len opustíme
                onLeaveLobby();
                return;
            }
            // Ak sa vrátime z hry (a sme host) a status je stále playing, resetneme ho na waiting
            if (data.host_id === user?.id && data.status === 'playing') {
                await supabase.from('platform_lobbies').update({ status: 'waiting', active_game_id: null }).eq('id', lobbyId);
                data.status = 'waiting';
                data.active_game_id = null;
            } else if (data.host_id !== user?.id && data.status === 'playing' && data.active_game_id) {
                // Pre zúčastnených hráčov, ak sa načítajú neskoro, pošleme ich rovno do hry
                let subMode = null;
                if (data.selected_game === 'quiz') {
                    // Nemáme tu hneď "players" refs, tak skúsime z databázy zistiť pocty 
                }
                setTimeout(() => onStartGameFlow(data.selected_game, data.active_game_id, subMode, {
                    rules: data.selected_game === 'quiz' ? 'hex' : null,
                    cat: [],
                    diff: [1]
                }), 1000);
            }
            setLobby(data);
            fetchPlayers(); // Fetch players only after lobby is found
        };
        const fetchPlayers = async () => {
            const { data } = await supabase.from('platform_players').select('*').eq('lobby_id', lobbyId).order('joined_at', { ascending: true });
            if (data) setPlayers(data);
            setLoading(false);
        };

        fetchLobby();

        const channel = supabase.channel(`platform_lobby_${lobbyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_lobbies', filter: `id=eq.${lobbyId}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    onLeaveLobby(); // Host zmazal lobby
                    return;
                }
                if (payload.new) {
                    setLobby(payload.new);
                    if (payload.new.status === 'playing' && payload.new.active_game_id) {
                        let subMode = null;
                        if (payload.new.selected_game === 'quiz') {
                            const pList = playersRef.current;
                            const isBot = pList.length === 2 && pList[1].is_bot;
                            subMode = isBot ? '1vbot' : '1v1_online';
                        }
                        // Launch actual game view
                        // Launch actual game view
                        onStartGameFlow(payload.new.selected_game, payload.new.active_game_id, subMode, {
                            rules: gameRules,
                            cat: selectedCategories,
                            diff: difficulty
                        });
                    }
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_players', filter: `lobby_id=eq.${lobbyId}` }, () => {
                fetchPlayers();
            })
            .on('broadcast', { event: 'countdown' }, (msg) => {
                setCountdown(msg.payload.timer);
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [lobbyId, onLeaveLobby, onStartGameFlow]);

    const handleSelectGame = async (gameId) => {
        if (!isHost) return;
        setLobby(prev => ({ ...prev, selected_game: gameId }));
        // Reset categories when switching games
        setSelectedCategories([]);
        await supabase.from('platform_lobbies').update({ selected_game: gameId }).eq('id', lobbyId);
    };

    const handleToggleCategory = (cat) => {
        if (!isHost) return;
        setSelectedCategories(prev => {
            if (prev.includes(cat)) return prev.filter(c => c !== cat);
            return [...prev, cat];
        });
    };

    const handleAddBot = async () => {
        if (!isHost || players.length >= 8) return;
        const botNum = players.filter(p => p.is_bot).length + 1;
        const botAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${Math.random()}`;
        const usedColors = new Set(players.map(p => p.color));
        const assignedColor = COLOR_PALETTE.find(c => !usedColors.has(c)) || COLOR_PALETTE[players.length % COLOR_PALETTE.length];

        await supabase.from('platform_players').insert([{
            lobby_id: lobbyId,
            is_bot: true,
            player_name: `Bot ${botNum}`,
            avatar_url: botAvatar,
            color: assignedColor
        }]);
    };

    const handleRemovePlayer = async (playerId) => {
        if (!isHost) return;
        await supabase.from('platform_players').delete().eq('id', playerId);
    };

    const handleLeave = async () => {
        if (!isHost) {
            await supabase.from('platform_players').delete().eq('lobby_id', lobbyId).eq('user_id', user.id);
        }
        onLeaveLobby();
    };

    const handleInvite = async (partner) => {
        if (!isHost) return;
        const usedColors = new Set(players.map(p => p.color));
        const assignedColor = COLOR_PALETTE.find(c => !usedColors.has(c)) || COLOR_PALETTE[players.length % COLOR_PALETTE.length];

        const { error } = await supabase.from('platform_players').insert([{
            lobby_id: lobbyId,
            user_id: partner.id,
            player_name: partner.username,
            avatar_url: partner.avatar_url,
            is_bot: false,
            color: assignedColor
        }]);

        if (error) {
            if (error.code === '23505') alert(`${partner.username} už je pozvaný alebo v lobby!`);
            else alert(`Chyba pri pozývaní: ${error.message}`);
        }
    };

    const handleStartGame = async () => {
        if (!isHost || !lobby) return;
        const selectedGameInfo = GAMES.find(g => g.id === lobby.selected_game);

        if (players.length > selectedGameInfo.max) {
            alert(`Táto hra podporuje len max ${selectedGameInfo.max} hráčov! Zmeň hru alebo vyhoď AI botov.`);
            return;
        }

        // Vytvorenie hry PRED odpočítavaním, aby sme predišli zlyhaniu po štarte
        let targetGameId = null;

        if (lobby.selected_game === 'bilionar') {
            const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data: bGame, error: bError } = await supabase.from('bilionar_games').insert([{
                host_id: user.id,
                join_code: joinCode,
                status: 'playing',
                is_public: false,
                settings: {
                    questions_count: 10,
                    difficulty: difficulty[0] || 2,
                    categories: selectedCategories,
                    difficulty_levels: difficulty && difficulty.length > 0 ? difficulty : [2],
                    bot_difficulty: botDifficulty
                },
                state: { phase: 'init' }
            }]).select().single();

            if (bError) {
                alert('Chyba pri vytváraní hry (Bilionár): ' + bError.message);
                return;
            }
            if (bGame) {
                targetGameId = bGame.id;
                const bPlayers = players.map(p => ({
                    game_id: bGame.id,
                    user_id: p.user_id,
                    player_name: p.player_name,
                    avatar_url: p.avatar_url,
                    is_bot: p.is_bot,
                    color: p.color
                }));
                await supabase.from('bilionar_players').insert(bPlayers);
            }
        }
        else if (lobby.selected_game === 'quiz') {
            const isBot = players.length === 2 && players[1].is_bot;

            if (isBot) {
                targetGameId = 'localbot_' + lobbyId;
            } else {
                // Pre Kvíz Duel - create `games` record
                const { data: qGame, error: qError } = await supabase.from('games').insert([{
                    player1_id: players[0]?.user_id || user.id,
                    player2_id: players[1]?.user_id || null,
                    game_type: gameRules,
                    status: 'active',
                    board_state: generateInitialBoard(gameRules),
                    current_turn: players[0]?.user_id || user.id,
                    category: JSON.stringify({ cats: selectedCategories, diffs: difficulty && difficulty.length > 0 ? difficulty : [1] }),
                    difficulty: difficulty[0] || 1
                }]).select().single();

                if (qError) {
                    alert('Chyba pri vytváraní hry (Kvíz Duel): ' + qError.message);
                    return;
                }
                if (qGame) {
                    targetGameId = qGame.id;
                }
            }
        }
        else if (lobby.selected_game === 'higher_lower') {
            const { data: hlGame, error: hlError } = await supabase.from('higher_lower_games').insert([{
                host_id: user.id,
                status: 'playing',
                state: { phase: 'init', current_round: 1 }
            }]).select().single();

            if (hlError) {
                alert('Chyba pri vytváraní hry (Higher Lower): ' + hlError.message);
                return;
            }
            if (hlGame) {
                targetGameId = hlGame.id;
                const hlPlayers = players.map(p => ({
                    game_id: hlGame.id,
                    user_id: p.user_id,
                    player_name: p.player_name,
                    avatar_url: p.avatar_url,
                    is_bot: p.is_bot,
                    color: p.color
                }));
                await supabase.from('higher_lower_players').insert(hlPlayers);
            }
        }

        if (!targetGameId) {
            alert('Nastala neočakávaná chyba pri vytváraní hry.');
            return;
        }

        // Host spustí odpočítavanie (broadcast pre všetkých naraz na plynulý sync)
        for (let i = 3; i >= 1; i--) {
            await supabase.channel(`platform_lobby_${lobbyId}`).send({
                type: 'broadcast',
                event: 'countdown',
                payload: { timer: i }
            });
            await new Promise(r => setTimeout(r, 1000));
        }

        await supabase.channel(`platform_lobby_${lobbyId}`).send({
            type: 'broadcast',
            event: 'countdown',
            payload: { timer: 'ŠTART!' }
        });

        await new Promise(r => setTimeout(r, 800)); // malá pauza pre efekt

        let subMode = null;
        if (lobby.selected_game === 'quiz') {
            const isBot = players.length === 2 && players[1].is_bot;
            subMode = isBot ? '1vbot' : '1v1_online';
        }

        await supabase.from('platform_lobbies').update({ status: 'playing', active_game_id: targetGameId }).eq('id', lobbyId);

        // Launch actual game view pre Hosta
        onStartGameFlow(lobby.selected_game, targetGameId, subMode, {
            rules: gameRules,
            cat: selectedCategories,
            diff: difficulty,
            botDiff: botDifficulty
        });
    };

    if (loading || !lobby) return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Načítavam dáta Lobby...</div>;

    const gameInfo = GAMES.find(g => g.id === lobby.selected_game) || GAMES[1];

    if (countdown !== null) {
        return (
            <div className="game-container game-portal" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '10vw', fontWeight: '900', color: '#facc15', textShadow: '0 0 40px rgba(250, 204, 21, 0.6)', animation: 'popIn 0.5s ease-out forwards' }}>
                    {countdown}
                </div>
                <style>{`
                    @keyframes popIn { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', width: '100%', minHeight: '80vh', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center', alignItems: 'flex-start' }}>

            {/* LOBBY COLUMN */}
            <div style={{ flex: '1 1 500px', maxWidth: '800px', background: 'rgba(15, 23, 42, 0.9)', padding: '2.5rem', borderRadius: '24px', border: `2px solid ${gameInfo.color}50` }}>

                {/* Header Lobby */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '2.5rem', margin: 0, color: 'white' }}>{isHost ? 'Tvoja Lobby' : 'Lobby'}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <span style={{ color: '#94a3b8' }}>Pozývací kód: </span>
                            <strong style={{ fontSize: '1.8rem', letterSpacing: '4px', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 1rem', borderRadius: '8px', border: '1px dashed #cbd5e1', color: 'white' }}>
                                {lobby.join_code}
                            </strong>
                            <button className="neutral" onClick={() => navigator.clipboard.writeText(lobby.join_code)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Kopírovať</button>
                        </div>
                    </div>

                    <button className="neutral" onClick={handleLeave} style={{ padding: '1rem 2rem', border: '2px solid rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>
                        {isHost ? 'Zavrieť Lobby' : 'Opustiť Lobby'}
                    </button>
                </div>

                {/* Vybratá Hra */}
                <div style={{ marginBottom: '3rem', padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <h3 style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Aktuálne Zvolená Hra</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {isHost ? (
                            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                                {GAMES.map(g => (
                                    <div
                                        key={g.id}
                                        onClick={() => handleSelectGame(g.id)}
                                        style={{
                                            minWidth: '200px', padding: '1.5rem', borderRadius: '16px', cursor: 'pointer',
                                            border: `2px solid ${lobby.selected_game === g.id ? g.color : 'rgba(255,255,255,0.1)'}`,
                                            background: lobby.selected_game === g.id ? `${g.color}15` : 'rgba(255,255,255,0.05)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ fontSize: '2.5rem' }}>{g.icon}</span>
                                        <span style={{ color: lobby.selected_game === g.id ? g.color : '#cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>{g.name}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Max {g.max} hráčov</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ fontSize: '4rem' }}>{gameInfo.icon}</div>
                                <div>
                                    <div style={{ fontSize: '2rem', color: gameInfo.color, fontWeight: 'bold' }}>{gameInfo.name}</div>
                                    <div style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>Čaká sa na hostiteľa na spustenie hry (Max {gameInfo.max} hráčov).</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* NASTAVENIA HRY */}
                {(lobby.selected_game === 'quiz' || lobby.selected_game === 'bilionar') && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            ⚙️ Nastavenia Hry {!isHost && <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>(Upravuje Hostiteľ)</span>}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {lobby.selected_game === 'quiz' && (
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Herné Pravidlá</label>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button disabled={!isHost} className={`secondary ${gameRules === 'hex' ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', opacity: gameRules === 'hex' ? 1 : 0.4, border: gameRules === 'hex' ? '1px solid #38bdf8' : 'none' }} onClick={() => setGameRules('hex')}>
                                            Hex (Cesta)
                                        </button>
                                        <button disabled={!isHost} className={`secondary ${gameRules === 'points' ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', opacity: gameRules === 'points' ? 1 : 0.4, border: gameRules === 'points' ? '1px solid #f97316' : 'none' }} onClick={() => setGameRules('points')}>
                                            Body (Rýchlosť)
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Náročnosť Otázok</label>
                                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '12px' }}>
                                    {[
                                        { level: 1, label: 'Ľahké', color: '#4ade80' },
                                        { level: 2, label: 'Stredné', color: '#fbbf24' },
                                        { level: 3, label: 'Ťažké', color: '#ef4444' }
                                    ].map(diff => {
                                        const isSelected = difficulty.includes(diff.level);
                                        return (
                                            <button
                                                key={diff.level}
                                                disabled={!isHost}
                                                onClick={() => setDifficulty(prev => {
                                                    if (prev.includes(diff.level)) {
                                                        if (prev.length === 1) return prev;
                                                        return prev.filter(d => d !== diff.level);
                                                    } else {
                                                        return [...prev, diff.level];
                                                    }
                                                })}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', background: isSelected ? diff.color : 'transparent', color: isSelected ? '#0f172a' : '#cbd5e1', border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default', transition: 'all 0.2s', opacity: isHost ? 1 : (isSelected ? 1 : 0.5) }}>
                                                {diff.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Sila bota, len ak je aspon jeden hrac bot */}
                            {players.some(p => p.is_bot) && (
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Sila BOTa (Nervozita, IQ a postreh)</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '12px' }}>
                                        {[
                                            { level: 1, label: 'Ľahký', color: '#4ade80' },
                                            { level: 2, label: 'Stredný', color: '#fbbf24' },
                                            { level: 3, label: 'Ťažký', color: '#ef4444' }
                                        ].map(diff => (
                                            <button key={diff.level} disabled={!isHost} onClick={() => setBotDifficulty(diff.level)} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', background: botDifficulty === diff.level ? diff.color : 'transparent', color: botDifficulty === diff.level ? '#0f172a' : '#cbd5e1', border: 'none', cursor: isHost ? 'pointer' : 'default', transition: 'all 0.2s', opacity: isHost ? 1 : (botDifficulty === diff.level ? 1 : 0.5) }}>
                                                {diff.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Kategórie</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    <button disabled={!isHost} onClick={() => setSelectedCategories([])} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: selectedCategories.length === 0 ? 'bold' : 'normal', background: selectedCategories.length === 0 ? '#38bdf8' : 'rgba(255,255,255,0.05)', color: selectedCategories.length === 0 ? '#0f172a' : '#cbd5e1', border: `1px solid ${selectedCategories.length === 0 ? 'transparent' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default' }}>
                                        ✨ Všetky
                                    </button>
                                    {(lobby.selected_game === 'quiz' ? availableQuizCategories : availableBilionarCategories).map(c => {
                                        const isSelected = selectedCategories.includes(c);
                                        return (
                                            <button disabled={!isHost} key={c} onClick={() => handleToggleCategory(c)} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.8rem', background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)', color: isSelected ? '#38bdf8' : '#94a3b8', border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default', opacity: isHost ? 1 : (isSelected ? 1 : 0.5) }}>
                                                {c}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hráči v Míestnosti */}
                <div>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Hráči v Miestnosti ({players.length}/8)</span>
                        {isHost && players.length < 8 && (
                            <button className="secondary" onClick={handleAddBot} style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem', borderColor: '#38bdf8', color: '#38bdf8' }}>
                                + Pridať BOTa
                            </button>
                        )}
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
                        {players.map(p => (
                            <div key={p.id} style={{
                                background: 'rgba(255,255,255,0.05)', border: `2px solid ${p.color}50`, padding: '1.5rem 1rem', borderRadius: '16px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative'
                            }}>
                                {isHost && p.user_id !== user.id && (
                                    <button onClick={() => handleRemovePlayer(p.id)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}>✖</button>
                                )}
                                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: `2px solid ${p.color}`, overflow: 'hidden' }}>
                                    {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2rem' }}>👤</span>}
                                </div>
                                <span style={{ color: 'white', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }}>
                                    {p.player_name}
                                </span>
                                {p.is_bot && <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '-10px' }}>BOT</span>}
                                {p.user_id === lobby.host_id && <span style={{ fontSize: '0.75rem', color: '#facc15', marginTop: '-10px', fontWeight: 'bold' }}>HOSTITEL</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {isHost && (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                            className="primary"
                            onClick={handleStartGame}
                            disabled={players.length > gameInfo.max}
                            style={{
                                padding: '1.5rem 4rem', fontSize: '1.5rem', background: gameInfo.color, color: '#0f172a', fontWeight: '900',
                                border: 'none', borderRadius: '24px', boxShadow: `0 10px 30px ${gameInfo.color}60`, opacity: players.length > gameInfo.max ? 0.5 : 1
                            }}>
                            SPUSTIŤ ({gameInfo.name})
                        </button>
                    </div>
                )}
            </div>
            {/* LOBBY COLUMN END */}

            {/* FRIENDS COLUMN */}
            <div style={{ flex: '1 1 300px', maxWidth: '450px', background: 'rgba(15, 23, 42, 0.9)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.5rem' }}>Priatelia</h3>
                <FriendsList
                    isHost={isHost}
                    onInvite={handleInvite}
                    onlineUserIds={onlineUserIds}
                />
            </div>

        </div>
    );
};
