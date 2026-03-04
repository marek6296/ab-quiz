import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const GAMES = [
    { id: 'quiz', name: 'Kvíz Duel (AZ Kvíz)', max: 2, icon: '🧠', color: '#3b82f6' },
    { id: 'bilionar', name: 'Bilionár Battle', max: 8, icon: '💰', color: '#facc15' },
    { id: 'higher_lower', name: 'Vyššie alebo Nižšie', max: 8, icon: '📈', color: '#10b981' }
];

const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

export const PlatformLobby = ({ lobbyId, onLeaveLobby, onStartGameFlow }) => {
    const { user } = useAuth();
    const [lobby, setLobby] = useState(null);
    const [players, setPlayers] = useState([]);
    const playersRef = React.useRef([]);
    const [loading, setLoading] = useState(true);
    const [countdown, setCountdown] = useState(null);

    // Keep ref updated for the postgres_changes closure
    useEffect(() => {
        playersRef.current = players;
    }, [players]);

    const isHost = lobby?.host_id === user?.id;

    useEffect(() => {
        if (!lobbyId) return;

        const fetchLobby = async () => {
            const { data } = await supabase.from('platform_lobbies').select('*').eq('id', lobbyId).single();
            if (data) {
                // Ak sa vrátime z hry (a sme host) a status je stále playing, resetneme ho na waiting
                if (data.host_id === user?.id && data.status === 'playing') {
                    await supabase.from('platform_lobbies').update({ status: 'waiting', active_game_id: null }).eq('id', lobbyId);
                    data.status = 'waiting';
                    data.active_game_id = null;
                } else if (data.host_id !== user?.id && data.status === 'playing' && data.active_game_id) {
                    // Pre zúčastnených hráčov, ak sa načítajú neskoro, pošleme ich rovno do hry
                    let subMode = null;
                    if (data.selected_game === 'quiz') {
                        // Nemáme tu hneď "players" refs, tak skúsime z databázy zistiť pocty (optimalne by to už mala aplikacia vedieť)
                        // Pre fallback necháme default
                    }
                    setTimeout(() => onStartGameFlow(data.selected_game, data.active_game_id, subMode), 1000);
                }
                setLobby(data);
            }
        };
        const fetchPlayers = async () => {
            const { data } = await supabase.from('platform_players').select('*').eq('lobby_id', lobbyId).order('joined_at', { ascending: true });
            if (data) setPlayers(data);
            setLoading(false);
        };

        fetchLobby();
        fetchPlayers();

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
                        onStartGameFlow(payload.new.selected_game, payload.new.active_game_id, subMode);
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
        await supabase.from('platform_lobbies').update({ selected_game: gameId }).eq('id', lobbyId);
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
        if (isHost) {
            await supabase.from('platform_players').delete().eq('lobby_id', lobbyId);
            await supabase.from('platform_lobbies').delete().eq('id', lobbyId);
        } else {
            await supabase.from('platform_players').delete().eq('lobby_id', lobbyId).eq('user_id', user.id);
        }
        onLeaveLobby();
    };

    const handleStartGame = async () => {
        if (!isHost || !lobby) return;
        const selectedGameInfo = GAMES.find(g => g.id === lobby.selected_game);

        if (players.length > selectedGameInfo.max) {
            alert(`Táto hra podporuje len max ${selectedGameInfo.max} hráčov! Zmeň hru alebo vyhoď AI botov.`);
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

        // Tu Host skutočne oznámi platforme, aby všetkým zmenila obrazovku
        let targetGameId = lobbyId; // Defaultne pre nové hry (ideme cez lobbyId)

        if (lobby.selected_game === 'bilionar') {
            const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data: bGame } = await supabase.from('bilionar_games').insert([{
                host_id: user.id,
                join_code: joinCode,
                status: 'playing',
                is_public: false,
                settings: {
                    questions_count: 10,
                    difficulty: 2,
                    categories: [],
                    difficulty_levels: [1, 2, 3],
                    bot_difficulty: 2
                },
                state: { phase: 'init' }
            }]).select().single();

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
                const { data: qGame } = await supabase.from('games').insert([{
                    player1_id: players[0]?.user_id || user.id,
                    player2_id: players[1]?.user_id || null,
                    game_type: 'hex',
                    status: 'active',
                    category: JSON.stringify({ cats: [], diffs: [1] }),
                    difficulty: 1
                }]).select().single();

                if (qGame) {
                    targetGameId = qGame.id;
                }
            }
        }
        else if (lobby.selected_game === 'higher_lower') {
            const { data: hlGame } = await supabase.from('higher_lower_games').insert([{
                host_id: user.id,
                status: 'playing',
                state: { phase: 'init', current_round: 1 }
            }]).select().single();

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

        // Pre legacy podporu: Pred vygenerovaním zmeny `status=playing` si host zaloguje stav pre seba.
        // Hneď nasleduje OnStartGameFlow, alebo to spraví listener pre `status === playing`.
        await supabase.from('platform_lobbies').update({ status: 'playing', active_game_id: targetGameId }).eq('id', lobbyId);
    };

    if (loading || !lobby) return <div className="game-container game-portal"><div className="loader"></div></div>;

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
        <div className="game-container game-portal" style={{ padding: '2rem', height: '100vh', overflowY: 'auto' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.7)', padding: '2.5rem', borderRadius: '24px', border: `2px solid ${gameInfo.color}50` }}>

                {/* Header Lobby */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '2.5rem', margin: 0, color: 'white' }}>Lobby</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <span style={{ color: '#94a3b8' }}>Pozývací kód: </span>
                            <strong style={{ fontSize: '1.8rem', letterSpacing: '4px', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 1rem', borderRadius: '8px', border: '1px dashed #cbd5e1', color: 'white' }}>
                                {lobby.join_code}
                            </strong>
                            <button className="neutral" onClick={() => navigator.clipboard.writeText(lobby.join_code)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Kopírovať</button>
                        </div>
                    </div>

                    <button className="neutral" onClick={handleLeave} style={{ padding: '1rem 2rem', border: '2px solid rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>
                        Opustiť Lobby
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
        </div>
    );
};
