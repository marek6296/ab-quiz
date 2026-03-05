import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { HigherLowerGame } from './HigherLowerGame';
import { usePlatformSession } from '../context/PlatformSessionContext';
import { HigherLowerLobby } from './HigherLowerLobby';

export const HigherLowerApp = ({ onBackToPortal, onTerminateLobby, onlineUserIds, pendingGameId, onClearPending }) => {
    const { user } = useAuth();
    const { match, isHost, members, leaveGame } = usePlatformSession();
    const [view, setView] = useState('lobby');
    const viewRef = useRef(view);

    useEffect(() => { viewRef.current = view; }, [view]);

    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);
    const [gameChannel, setGameChannel] = useState(null);

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

    // Autoboot
    useEffect(() => {
        if (pendingGameId && view === 'lobby') {
            const bootGame = async () => {
                const { data } = await supabase.from('higher_lower_games').select('*').eq('id', pendingGameId).single();
                if (data) {
                    setActiveGame(data);
                    setView('game');
                    fetchPlayers(pendingGameId);
                    if (onClearPending) onClearPending();
                }
            };
            bootGame();
        }
    }, [pendingGameId, view, onClearPending]);

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

    return (
        <div className="higher-lower-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1000 }}>
            {view === 'lobby' ? (
                <HigherLowerLobby
                    activeGame={activeGame}
                    players={players}
                    onlineUserIds={onlineUserIds}
                    pendingGameId={pendingGameId}
                    onClearPending={onClearPending}
                    onSetGame={setActiveGame}
                    onBackToPortal={onBackToPortal}
                    match={match}
                    members={members}
                    onStartGame={(game) => {
                        setActiveGame(game);
                        setView('game');
                    }}
                />
            ) : (
                <HigherLowerGame
                    activeGame={activeGame}
                    players={players}
                    gameChannel={gameChannel}
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
