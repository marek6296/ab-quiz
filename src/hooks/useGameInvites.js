import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useGameInvites = ({ user, activeGameId, handleStartGame, setIncomingInvite }) => {
    // Vytvorenie stabilnej referencie funkcií na to, aby sme nemuseli unsubscribovať channel
    const activeGameIdRef = useRef(activeGameId);
    const handleStartGameRef = useRef(handleStartGame);
    useEffect(() => {
        activeGameIdRef.current = activeGameId;
        handleStartGameRef.current = handleStartGame;
    }, [activeGameId, handleStartGame]);

    useEffect(() => {
        if (!user) return;

        // Set online status
        supabase.from('profiles').update({ online_status: 'online' }).eq('id', user.id).then();

        const subscription = supabase
            .channel('game_invites')
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
                        challengerName: data?.username || 'Neznámy Hráč'
                    });
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `player1_id=eq.${user.id}`
            }, (payload) => {
                if (payload.new.status === 'active' && !activeGameIdRef.current) {
                    handleStartGameRef.current('1v1_online', payload.new.game_type || 'hex', payload.new.id);
                }
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
            // Set offline on unmount
            if (user) supabase.from('profiles').update({ online_status: 'offline' }).eq('id', user.id).then();
        };
    }, [user, setIncomingInvite]);
};
