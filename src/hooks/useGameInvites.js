import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useGameInvites = ({ user, activeGameId, handleStartGame, setIncomingInvite }) => {
    const activeGameIdRef = useRef(activeGameId);
    const handleStartGameRef = useRef(handleStartGame);

    useEffect(() => {
        activeGameIdRef.current = activeGameId;
        handleStartGameRef.current = handleStartGame;
    }, [activeGameId, handleStartGame]);

    useEffect(() => {
        if (!user) return;

        supabase.from('profiles').update({ online_status: 'online' }).eq('id', user.id).then();

        // Combined channel for both game systems
        const subscription = supabase
            .channel('game_invites_global')
            // --- AB QUIZ (HEX) SYSTEM ---
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'games',
                filter: `player2_id=eq.${user.id}`
            }, async (payload) => {
                if (payload.new.status === 'waiting' && !activeGameIdRef.current) {
                    const { data } = await supabase.from('profiles').select('username').eq('id', payload.new.player1_id).single();
                    setIncomingInvite({
                        gameId: payload.new.id,
                        gameRules: payload.new.game_type || 'hex',
                        gameType: 'hex',
                        challengerName: data?.username || 'Neznámy Hráč'
                    });
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `player2_id=eq.${user.id}`
            }, (payload) => {
                if (payload.new.status === 'active') {
                    setIncomingInvite(null);
                    if (!activeGameIdRef.current) {
                        handleStartGameRef.current('1v1_online', payload.new.game_type || 'hex', payload.new.id);
                    }
                }
                if (payload.new.status === 'cancelled' || payload.new.status === 'declined') {
                    setIncomingInvite(null);
                }
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'games'
            }, (payload) => {
                setIncomingInvite(prev => (prev?.gameType === 'hex' && prev?.gameId === payload.old.id ? null : prev));
            })

            // --- BILIONAR SYSTEM ---
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'bilionar_games',
                filter: `host_id=neq.${user.id}` // We only care about games where we are NOT the host
            }, async (payload) => {
                // Bilionar uses a joining system, but for direct invites we might use a dedicated field or logic.
                // For now, let's look for a 'invited_player_id' field if you have one, or just listen to the bilionar_players join.
                // Actually, let's implement a 'target_id' in bilionar_games for private invites.
            })
            // Listen for players being added (if we are added to a game by someone else)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'bilionar_players',
                filter: `user_id=eq.${user.id}`
            }, async (payload) => {
                // If we were added to a game and it's still waiting, notify us
                const { data: game } = await supabase.from('bilionar_games').select('*').eq('id', payload.new.game_id).single();
                if (game && game.status === 'waiting' && game.host_id !== user.id) {
                    const { data: host } = await supabase.from('profiles').select('username').eq('id', game.host_id).single();
                    setIncomingInvite({
                        gameId: game.id,
                        gameRules: 'bilionar',
                        gameType: 'bilionar',
                        challengerName: host?.username || 'Neznámy Hráč'
                    });
                }
            })
            // --- PLATFORM LOBBY SYSTEM ---
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'lobby_members',
                filter: `user_id=eq.${user.id}`
            }, async (payload) => {
                if (payload.eventType === 'DELETE') return;

                if (payload.new.state === 'invited') {
                    const { data: lobby } = await supabase.from('platform_lobbies').select('*').eq('id', payload.new.lobby_id).single();
                    if (lobby && lobby.status === 'waiting' && lobby.host_id !== user.id) {
                        const { data: host } = await supabase.from('profiles').select('username').eq('id', lobby.host_id).single();
                        setIncomingInvite({
                            gameId: lobby.id,
                            gameRules: 'Lobby',
                            gameType: 'platform_lobby',
                            challengerName: host?.username || 'Kamarát'
                        });
                    }
                }
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
            if (user) supabase.from('profiles').update({ online_status: 'offline' }).eq('id', user.id).then();
        };
    }, [user, setIncomingInvite]);
};
