import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';
import { BilionarLobby } from './BilionarLobby';
import { BilionarGame } from './BilionarGame';

export const BilionarApp = ({ onBackToPortal, onlineUserIds, pendingGameId, onClearPending }) => {
    const { user } = useAuth();
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
    useEffect(() => { prevActiveGameStatus.current = activeGame?.status; }, [activeGame?.status]);

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
                        setActiveGame(null);
                        setPlayers([]);
                        setView('lobby');
                    }}
                />
            )}

            {!showAdmin && view === 'lobby' && (
                <BilionarLobby
                    activeGame={activeGame}
                    players={players}
                    onStartGame={(startedGame) => {
                        setActiveGame(startedGame);
                        setView('game');
                    }}
                    onSetGame={setActiveGame}
                    onBackToPortal={onBackToPortal}
                    onShowAdmin={() => setShowAdmin(true)}
                    onlineUserIds={onlineUserIds}
                    pendingGameId={pendingGameId}
                    onClearPending={onClearPending}
                />
            )}
        </div>
    );
};
