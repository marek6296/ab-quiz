import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { HigherLowerGame } from './HigherLowerGame';
import { usePlatformSession } from '../context/PlatformSessionContext';
import { HigherLowerLobby } from './HigherLowerLobby';
import { HigherLowerAdmin } from './HigherLowerAdmin';

export const HigherLowerApp = ({ onBackToPortal, onTerminateLobby, onlineUserIds, pendingGameId, onClearPending }) => {
    const { user } = useAuth();
    const { match, isHost, members, leaveGame } = usePlatformSession();
    const [view, setView] = useState('lobby');
    const viewRef = useRef(view);

    const [showAdmin, setShowAdmin] = useState(() => localStorage.getItem('hl_admin_open') === 'true');
    useEffect(() => { localStorage.setItem('hl_admin_open', showAdmin); }, [showAdmin]);

    useEffect(() => { viewRef.current = view; }, [view]);

    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);
    const [gameChannel, setGameChannel] = useState(null);
    const [latestPlayerGuess, setLatestPlayerGuess] = useState(null);

    const fetchPlayers = async (gameId) => {
        if (!gameId) return;
        const { data } = await supabase.from('higher_lower_players')
            .select('*')
            .eq('game_id', gameId)
            .order('joined_at', { ascending: true });
        if (data) setPlayers(data);
    };

    // Game sync logic

    // HigherLowerApp main logic

    // Platform Match Initialization
    useEffect(() => {
        if (!match) return;

        const initHLGame = async (retries = 7) => {
            const { data: existingGame } = await supabase.from('higher_lower_games').select('*').eq('id', match.id).maybeSingle();

            if (existingGame) {
                setActiveGame(existingGame);
                setView('game');
                if (onClearPending) onClearPending();
            } else if (isHost) {
                const joinCode = 'H' + Math.random().toString(36).substring(2, 7).toUpperCase();
                const { data: newGame, error: err } = await supabase.from('higher_lower_games').insert([{
                    id: match.id,
                    host_id: user.id,
                    join_code: joinCode,
                    status: 'playing',
                    is_public: false,
                    settings: {
                        bot_difficulty: match.snapshot_settings?.botDiff || 2
                    },
                    state: { phase: 'init' }
                }]).select().single();

                if (err) {
                    console.error("Error creating higher_lower DB row", err);
                    if (retries > 0) setTimeout(() => initHLGame(retries - 1), 1000);
                    return;
                }

                const activeMembers = members.filter(m => m.state === 'in_game' || m.state === 'in_lobby');
                const hlPlayers = activeMembers.map(m => ({
                    game_id: match.id,
                    user_id: m.user_id,
                    player_name: m.metadata?.player_name || 'Hráč',
                    avatar_url: m.metadata?.avatar_url || '',
                    is_bot: m.role === 'bot',
                    color: m.metadata?.color || '#10b981'
                }));

                if (hlPlayers.length > 0) {
                    await supabase.from('higher_lower_players').insert(hlPlayers);
                }

                setActiveGame(newGame);
                setView('game');
                if (onClearPending) onClearPending();
                await supabase.from('platform_matches').update({ status: 'playing' }).eq('id', match.id);
            } else if (retries > 0) {
                if (view !== 'game') {
                    setTimeout(() => initHLGame(retries - 1), 1000);
                }
            } else {
                console.error("Non-host failed to boot HL game because host took too long");
            }
        };

        if (match.id) {
            initHLGame();
        }
    }, [match?.id, isHost]);

    useEffect(() => {
        if (!activeGame?.id) return;

        fetchPlayers(activeGame.id);

        const channelId = `hl_game_state_${activeGame.id}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'higher_lower_games', filter: `id=eq.${activeGame.id}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    setActiveGame(null);
                    setView('lobby');
                    onBackToPortal();
                    return;
                }
                if (payload.new) {
                    setActiveGame(payload.new);
                    if (payload.new.status === 'playing' && viewRef.current === 'lobby') {
                        setView('game');
                    }
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'higher_lower_players', filter: `game_id=eq.${activeGame.id}` }, () => {
                fetchPlayers(activeGame.id);
            })
            .on('broadcast', { event: 'phase_change' }, (msg) => {
                const newState = msg.payload?.state || msg.state;
                if (newState) {
                    setActiveGame(prev => ({ ...prev, state: newState }));
                }
            })
            .on('broadcast', { event: 'player_guess' }, (msg) => {
                setLatestPlayerGuess({ ...msg.payload, _receivedAt: Date.now() });
            })
            .subscribe();

        setGameChannel(channel);
        return () => {
            supabase.removeChannel(channel);
            setGameChannel(null);
        };
    }, [activeGame?.id, onBackToPortal]);

    useEffect(() => {
        if (activeGame?.status === 'playing' && view === 'lobby') {
            setView('game');
        }
    }, [activeGame?.status, view]);

    // Avoid kicking valid Supabase games arbitrarily if match is null.
    // The channel's DELETE event already perfectly cleans up dead games.

    if (showAdmin) {
        return <HigherLowerAdmin onBack={() => setShowAdmin(false)} />;
    }

    return (
        <div className="higher-lower-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1000 }}>
            {!showAdmin && view === 'lobby' && !match && (
                <HigherLowerLobby
                    activeGame={activeGame}
                    players={players}
                    onlineUserIds={onlineUserIds}
                    pendingGameId={pendingGameId}
                    onClearPending={onClearPending}
                    onSetGame={setActiveGame}
                    onShowAdmin={() => setShowAdmin(true)}
                    onBackToPortal={() => {
                        if (match) { leaveGame(); }
                        onBackToPortal();
                    }}
                    match={match}
                    members={members}
                    onStartGame={(game) => {
                        setActiveGame(game);
                        setView('game');
                    }}
                />
            )}

            {!showAdmin && view === 'lobby' && match && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Wait for DB bootup to transition to 'game' */}
                </div>
            )}

            {!showAdmin && view === 'game' && (
                <HigherLowerGame
                    activeGame={activeGame}
                    players={players}
                    gameChannel={gameChannel}
                    latestPlayerGuess={latestPlayerGuess}
                    onSetGame={setActiveGame}
                    onLeave={async () => {
                        if (user?.id) {
                            await supabase.from('higher_lower_players').delete().eq('user_id', user.id);
                        }
                        if (match) { await leaveGame(); }
                        if (onTerminateLobby) {
                            await onTerminateLobby();
                        }
                        setActiveGame(null);
                        setPlayers([]);
                        onBackToPortal();
                    }}
                />
            )}
        </div>
    );
};
