import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { HigherLowerGame } from './HigherLowerGame';
import { usePlatformSession } from '../context/PlatformSessionContext';

export const HigherLowerApp = ({ onBackToPortal, onTerminateLobby }) => {
    const { user } = useAuth();
    const { match, isHost, members, leaveGame } = usePlatformSession();

    const [activeGame, setActiveGame] = useState(null);
    const [players, setPlayers] = useState([]);
    const [gameChannel, setGameChannel] = useState(null);

    // Initializácia higher_lower_games
    useEffect(() => {
        if (!match) {
            onBackToPortal();
            return;
        }

        const initGame = async () => {
            const { data: existingGame } = await supabase.from('higher_lower_games').select('*').eq('id', match.id).single();

            if (existingGame) {
                setActiveGame(existingGame);
            } else if (isHost) {
                // Host vytvára row
                const { data: newGame, error: err } = await supabase.from('higher_lower_games').insert([{
                    id: match.id, // prepájame s platform_matches
                    host_id: user.id,
                    status: 'playing',
                    state: { phase: 'init', current_round: 1 }
                }]).select().single();

                if (err) {
                    console.error("Error creating HL game DB row", err);
                    return;
                }

                const activeMembers = members.filter(m => m.state === 'in_game');
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
                await supabase.from('platform_matches').update({ status: 'playing' }).eq('id', match.id);
            }
        };

        if (match.id) {
            initGame();
        }
    }, [match?.id, isHost]);

    const fetchPlayers = async (gameId) => {
        if (!gameId) return;
        const { data } = await supabase.from('higher_lower_players')
            .select('*')
            .eq('game_id', gameId)
            .order('joined_at', { ascending: true });
        if (data) setPlayers(data);
    };

    useEffect(() => {
        if (!activeGame?.id) {
            setPlayers([]);
            return;
        }

        const channelId = `hl_game_state_${activeGame.id}`;
        const channel = supabase.channel(channelId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'higher_lower_games', filter: `id=eq.${activeGame.id}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    leaveGame();
                    return;
                }
                if (payload.new) {
                    setActiveGame(payload.new);
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
        fetchPlayers(activeGame.id);

        return () => {
            supabase.removeChannel(channel);
            setGameChannel(null);
        };
    }, [activeGame?.id, leaveGame]);

    const handleLeave = async () => {
        if (user?.id && activeGame) {
            await supabase.from('higher_lower_players').delete().eq('user_id', user.id);
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
        <div className="higher-lower-theme" style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1000 }}>
            <HigherLowerGame
                activeGame={activeGame}
                players={players}
                gameChannel={gameChannel}
                onSetGame={setActiveGame}
                onLeave={handleLeave}
            />
        </div>
    );
};
