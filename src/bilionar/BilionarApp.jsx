import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';
import { BilionarGame } from './BilionarGame';
import { usePlatformSession } from '../context/PlatformSessionContext';

export const BilionarApp = ({ onBackToPortal, onTerminateLobby }) => {
    const { user } = useAuth();
    const { match, isHost, members, leaveGame } = usePlatformSession();
    const [profile, setProfile] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);

    // Game State
    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);
    const [gameChannel, setGameChannel] = useState(null);

    // Načítanie profilu pre prístup k admin sekcii
    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, is_admin, avatar_url').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    // Inicializácia bilio_games
    useEffect(() => {
        if (!match) {
            onBackToPortal();
            return;
        }

        const initBilionarGame = async () => {
            // Skús nájsť už vytvorenú bilionar hru
            const { data: existingGame } = await supabase.from('bilionar_games').select('*').eq('id', match.id).single();

            if (existingGame) {
                setActiveGame(existingGame);
            } else if (isHost) {
                // Host vytvára bilionar row s rovnakým match.id
                const { data: newGame, error: err } = await supabase.from('bilionar_games').insert([{
                    id: match.id,
                    host_id: user.id,
                    join_code: 'MATCH', // not used anymore for platform matches
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
                    return;
                }

                // Pridá hráčov z lobby_members
                const activeMembers = members.filter(m => m.state === 'in_game');
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
                await supabase.from('platform_matches').update({ status: 'playing' }).eq('id', match.id);
            }
        };

        if (match.id) {
            initBilionarGame();
        }
    }, [match?.id, isHost]);

    const fetchPlayers = async (gameId) => {
        if (!gameId) return;
        const { data } = await supabase.from('bilionar_players')
            .select('*')
            .eq('game_id', gameId)
            .order('joined_at', { ascending: true });
        if (data) setPlayers(data);
    };

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
                    leaveGame();
                    return;
                }
                if (payload.new) {
                    setActiveGame(payload.new);
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
                const newState = msg.payload?.state || msg.state;
                if (newState) {
                    setActiveGame(prev => ({ ...prev, state: newState }));
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
    }, [activeGame?.id, leaveGame]);

    const handleLeave = async () => {
        if (user?.id && activeGame) {
            // Remove from specific game DB if needed, though leaveGame marks match_players 'left'
            await supabase.from('bilionar_players').delete().eq('game_id', activeGame.id).eq('user_id', user.id);
        }
        await leaveGame();
        onBackToPortal();
    };

    if (!match) return null;

    if (!activeGame) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
                <h2 style={{ animation: 'pulse 1.5s infinite' }}>Inicializácia hry...</h2>
            </div>
        );
    }

    return (
        <div className="bilionar-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {showAdmin && (
                <BilionarAdmin onBack={() => setShowAdmin(false)} />
            )}

            {!showAdmin && (
                <BilionarGame
                    activeGame={activeGame}
                    players={players}
                    gameChannel={gameChannel}
                    onSetGame={setActiveGame}
                    onLeave={handleLeave}
                />
            )}

            {/* Show Admin button loosely absolute if admin */}
            {profile?.is_admin && !showAdmin && (
                <button onClick={() => setShowAdmin(true)} style={{ position: 'absolute', top: 20, left: 20, zIndex: 9000 }}>
                    Admin Test Mode
                </button>
            )}
        </div>
    );
};
