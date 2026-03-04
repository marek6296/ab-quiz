import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BilionarAdmin } from './BilionarAdmin';
import { BilionarLobby } from './BilionarLobby';
import { BilionarGame } from './BilionarGame';
import { useGameInvites } from '../hooks/useGameInvites';
import { GameInviteModal } from '../components/GameInviteModal';

export const BilionarApp = ({ onBackToPortal }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [showAdmin, setShowAdmin] = useState(false);
    const [view, setView] = useState('lobby'); // 'lobby', 'game'
    const [activeGame, setActiveGame] = useState(null);
    const [onlineUserIds, setOnlineUserIds] = useState(new Set());
    const [incomingInvite, setIncomingInvite] = useState(null);

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('username, is_admin').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));

            // Global Presence Tracking
            const channel = supabase.channel('global-presence-bilionar', {
                config: { presence: { key: user.id } }
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    const state = channel.presenceState();
                    const onlineIds = new Set(Object.keys(state));
                    setOnlineUserIds(onlineIds);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({ online_at: new Date().toISOString() });
                    }
                });

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user]);

    // Re-use invitations hook but handle it specifically for Bilionar
    useGameInvites({ 
        user, 
        activeGameId: activeGame?.id, 
        handleStartGame: (mode, rules, gameId) => {
            // mode will be '1v1_online' usually from the hook
            // For Bilionar, we need to fetch the game data and switch view
            supabase.from('bilionar_games').select('*').eq('id', gameId).single().then(({ data }) => {
                if (data) {
                    setActiveGame(data);
                    setView('game');
                }
            });
        }, 
        setIncomingInvite: (invite) => {
            if (invite && invite.gameType === 'bilionar') {
               setIncomingInvite(invite);
            }
        } 
    });

    const handleAcceptInvite = async (gameId) => {
        const { error } = await supabase.from('bilionar_games').update({ status: 'playing' }).eq('id', gameId);
        if (!error) {
            setIncomingInvite(null);
            const { data: game } = await supabase.from('bilionar_games').select('*').eq('id', gameId).single();
            if (game) {
                setActiveGame(game);
                setView('game');
            }
        }
    };

    const handleDeclineInvite = async (gameId) => {
        await supabase.from('bilionar_games').delete().eq('id', gameId);
        setIncomingInvite(null);
    };

    if (showAdmin) {
        return <BilionarAdmin onBack={() => setShowAdmin(false)} />;
    }

    if (view === 'game') {
        return (
            <BilionarGame
                activeGame={activeGame}
                onLeave={() => {
                    setActiveGame(null);
                    setView('lobby');
                }}
            />
        );
    }

    return (
        <>
            <BilionarLobby
                onStartGame={(startedGame) => {
                    setActiveGame(startedGame);
                    setView('game');
                }}
                onBackToPortal={onBackToPortal}
                onShowAdmin={() => setShowAdmin(true)}
                onlineUserIds={onlineUserIds}
            />
            <GameInviteModal 
                invite={incomingInvite}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
            />
        </>
    );
};
