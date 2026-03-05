import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';
import { BilionarLobby } from './BilionarLobby';
import { BilionarGame } from './BilionarGame';
import { usePlatformSession } from '../context/PlatformSessionContext';

export const BilionarApp = ({ activePlatformLobbyId, onBackToPortal, onTerminateLobby, onlineUserIds, pendingGameId, onClearPending }) => {
    const { user } = useAuth();
    const { match, isHost, members, leaveGame } = usePlatformSession();
    const [profile, setProfile] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);
    const [view, setView] = useState('lobby'); // 'lobby', 'game'
    const viewRef = useRef(view);

    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);
    const [gameChannel, setGameChannel] = useState(null);

    const fetchPlayers = async (gameId) => {
        if (!gameId) return;
        const { data } = await supabase.from('bilionar_players')
            .select('*')
            .eq('game_id', gameId)
            .order('joined_at', { ascending: true });
        if (data) setPlayers(data);
    };

    const syncGame = async (gameId) => {
        if (!gameId) return;
        const { data, error } = await supabase.from('bilionar_games')
            .select('*')
            .eq('id', gameId)
            .single();

        if (data) {
            setActiveGame(data);
            // Crucial: Fallback trigger for view transition if real-time event was missed
            if (data.status === 'playing' && viewRef.current === 'lobby') {
                console.log("Fallback sync triggered view transition to game");
                setView('game');
            }
        } else if (error && error.code === 'PGRST116') {
            // PGRST116 means zero rows returned (Game was deleted)
            console.log("Game deleted by host, leaving lobby.");
            setActiveGame(null);
            setView('lobby'); // The lobby component itself will revert to 'menu'
            return;
        }
        fetchPlayers(gameId);
    };

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, is_admin, avatar_url').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);


    // Platform Match Initialization
    useEffect(() => {
        if (!match) return;

        const initBilionarGame = async (retries = 7) => {
            const { data: existingGame } = await supabase.from('bilionar_games').select('*').eq('id', match.id).maybeSingle();

            if (existingGame) {
                setActiveGame(existingGame);
                setView('game');
                if (onClearPending) onClearPending();
            } else if (isHost) {
                // Generate a random join code to prevent duplicate primary key restrictions if they play multiple games
                const joinCode = 'B' + Math.random().toString(36).substring(2, 7).toUpperCase();
                const { data: newGame, error: err } = await supabase.from('bilionar_games').insert([{
                    id: match.id,
                    host_id: user.id,
                    join_code: joinCode,
                    status: 'playing',
                    is_public: false,
                    settings: {
                        questions_count: 10,
                        difficulty: match.snapshot_settings?.diff?.[0] || 2,
                        categories: match.snapshot_settings?.cat || [],
                        difficulty_levels: match.snapshot_settings?.diff || [2],
                        bot_difficulty: match.snapshot_settings?.botDiff || 2
                    },
                    state: { phase: 'init' }
                }]).select().single();

                if (err) {
                    console.error("Error creating bilionar DB row", err);
                    if (retries > 0) setTimeout(() => initBilionarGame(retries - 1), 1000);
                    return;
                }

                const activeMembers = members.filter(m => m.state === 'in_game' || m.state === 'in_lobby');
                const bPlayers = activeMembers.map(m => ({
                    game_id: match.id,
                    user_id: m.user_id,
                    player_name: m.metadata?.player_name || 'Hráč',
                    avatar_url: m.metadata?.avatar_url || '',
                    is_bot: m.role === 'bot',
                    color: m.metadata?.color || '#eab308'
                }));

                if (bPlayers.length > 0) {
                    await supabase.from('bilionar_players').insert(bPlayers);
                }

                setActiveGame(newGame);
                setView('game');
                if (onClearPending) onClearPending();
                await supabase.from('platform_matches').update({ status: 'playing' }).eq('id', match.id);
            } else if (retries > 0) {
                // Non-host polling for the host to initialize the game row
                if (view !== 'game') {
                    setTimeout(() => initBilionarGame(retries - 1), 1000);
                }
            } else {
                console.error("Non-host failed to boot bilionar game because host took too long");
            }
        };

        if (match.id) {
            initBilionarGame();
        }
    }, [match?.id, isHost]);

    // Central DB Match Watcher to Force Extraneous Clients out of Dead Games
    useEffect(() => {
        if (!match && view === 'game' && activePlatformLobbyId) {
            onBackToPortal();
            setActiveGame(null);
        }
    }, [match, view, activePlatformLobbyId, onBackToPortal]);

    // Autoboot from Platform Match is now handled completely by the unified effect above.

    // Central Subscription for Bilionár Game Cycle
    useEffect(() => {
        if (!activeGame?.id) {
            setPlayers([]);
            return;
        }

        const channelId = `bilionar_game_state_${activeGame.id}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bilionar_games',
                filter: `id=eq.${activeGame.id}`
            }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    console.log("Realtime: Game deleted by host");
                    setActiveGame(null);
                    setView('lobby');
                    return;
                }
                if (payload.new) {
                    setActiveGame(payload.new);
                    // Auto-transition to game view if status changes to playing
                    if (payload.new.status === 'playing' && viewRef.current === 'lobby') {
                        console.log("Realtime: Auto-transition to game view");
                        setView('game');
                    }
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bilionar_players',
                filter: `game_id=eq.${activeGame.id}`
            }, () => {
                fetchPlayers(activeGame.id);
            })
            .on('broadcast', { event: 'phase_change' }, (msg) => {
                // High-speed sync for animations
                // Compatible with both {state: s} and {payload: {state: s}} formats
                const newState = msg.payload?.state || msg.state;
                if (newState) {
                    setActiveGame(prev => ({ ...prev, state: newState }));
                    if (prevActiveGameStatus.current !== 'playing' && viewRef.current === 'lobby') {
                        setView('game');
                    }
                }
            })
            .subscribe();

        setGameChannel(channel);

        // Initial fetch
        fetchPlayers(activeGame.id);

        return () => {
            supabase.removeChannel(channel);
            setGameChannel(null);
        };
    }, [activeGame?.id]);

    const prevActiveGameStatus = useRef(activeGame?.status);
    useEffect(() => {
        prevActiveGameStatus.current = activeGame?.status;
        if (activeGame?.status === 'playing' && view === 'lobby') {
            setView('game');
        }
    }, [activeGame?.status, view]);

    // Fallback sync (periodically check if game state has changed)
    useEffect(() => {
        if (!activeGame?.id) return;

        const timer = setInterval(() => {
            syncGame(activeGame.id);
        }, 2000);

        return () => clearInterval(timer);
    }, [activeGame?.id]);

    return (
        <div className="bilionar-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {showAdmin && (
                <BilionarAdmin onBack={() => setShowAdmin(false)} />
            )}

            {!showAdmin && view === 'game' && (
                <BilionarGame
                    activeGame={activeGame}
                    players={players}
                    gameChannel={gameChannel}
                    onSetGame={setActiveGame}
                    onLeave={async () => {
                        if (user?.id) {
                            // Remove player from all games to completely leave and prevent ghost reconnects
                            await supabase.from('bilionar_players').delete().eq('user_id', user.id);
                        }
                        if (match) { leaveGame(); }
                        if (onTerminateLobby) {
                            await onTerminateLobby();
                        }
                        setActiveGame(null);
                        setPlayers([]);
                        onBackToPortal();
                    }}
                />
            )}

            {!showAdmin && view === 'lobby' && !match && (
                <BilionarLobby
                    activeGame={activeGame}
                    players={players}
                    onStartGame={(startedGame) => {
                        setActiveGame(startedGame);
                        setView('game');
                    }}
                    onSetGame={setActiveGame}
                    onBackToPortal={() => {
                        if (match) { leaveGame(); }
                        onBackToPortal();
                    }}
                    onShowAdmin={() => setShowAdmin(true)}
                    onlineUserIds={onlineUserIds}
                    pendingGameId={pendingGameId}
                    onClearPending={onClearPending}
                />
            )}

            {!showAdmin && view === 'lobby' && match && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 1s ease-out' }}>
                    <div style={{ fontSize: '2rem', color: '#facc15', letterSpacing: '2px', textShadow: '0 0 20px rgba(250, 204, 21, 0.5)', animation: 'pulseSoft 2s infinite' }}>
                        Pripája sa do arény...
                    </div>
                </div>
            )}
        </div>
    );
};
