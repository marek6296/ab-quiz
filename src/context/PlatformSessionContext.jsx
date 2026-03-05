import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const PlatformSessionContext = createContext({});

export const usePlatformSession = () => useContext(PlatformSessionContext);

export const PlatformSessionProvider = ({ children }) => {
    const { user } = useAuth();

    // Core states
    const [lobby, setLobby] = useState(null);
    const [members, setMembers] = useState([]);
    const [match, setMatch] = useState(null);
    const [matchPlayers, setMatchPlayers] = useState([]);

    // Loading/Error states
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Derived states
    const myMemberState = members.find(m => m.user_id === user?.id);
    const myMatchState = matchPlayers.find(m => m.user_id === user?.id);
    const isHost = myMemberState?.role === 'host';

    // Heartbeat ref to avoid stale closures
    const heartbeatTimer = useRef(null);

    // Initial Load & Auth change
    useEffect(() => {
        if (!user?.id) {
            setLobby(null);
            setMembers([]);
            setMatch(null);
            setMatchPlayers([]);
            setIsLoading(false);
            return;
        }

        const initializeSession = async () => {
            setIsLoading(true);
            try {
                // 1. Find if I am in any lobby where my state is NOT 'left'
                const { data: memberData, error: memError } = await supabase
                    .from('lobby_members')
                    .select('lobby_id, role, state')
                    .eq('user_id', user.id)
                    .neq('state', 'left')
                    .order('joined_at', { ascending: false })
                    .limit(1);

                if (memError) throw memError;

                if (memberData && memberData.length > 0) {
                    const activeLobbyId = memberData[0].lobby_id;
                    await loadLobbyData(activeLobbyId);
                } else {
                    setLobby(null);
                    setMembers([]);
                }
            } catch (err) {
                console.error("Error initializing session:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        initializeSession();
    }, [user?.id]);

    const loadLobbyData = async (lobbyId) => {
        const { data: lobbyData, error: lobbyError } = await supabase
            .from('platform_lobbies')
            .select('*')
            .eq('id', lobbyId)
            .single();

        if (lobbyError || !lobbyData || lobbyData.status === 'closed') {
            await leaveLobby(); // Clean up if lobby is dead
            return;
        }

        setLobby(lobbyData);

        const { data: membersData } = await supabase
            .from('lobby_members')
            .select('*')
            .eq('lobby_id', lobbyId)
            .neq('state', 'left')
            .order('joined_at', { ascending: true });

        setMembers(membersData || []);

        // Load match if active
        if (lobbyData.active_match_id) {
            await loadMatchData(lobbyData.active_match_id);
        } else {
            setMatch(null);
            setMatchPlayers([]);
        }
    };

    const loadMatchData = async (matchId) => {
        const { data: matchData } = await supabase
            .from('platform_matches')
            .select('*')
            .eq('id', matchId)
            .single();

        if (matchData) setMatch(matchData);

        const { data: playersData } = await supabase
            .from('match_players')
            .select('*')
            .eq('match_id', matchId)
            .neq('state', 'left');

        if (playersData) setMatchPlayers(playersData);
    };

    // Subscriptions
    useEffect(() => {
        if (!lobby?.id) return;

        const subLobby = supabase.channel(`lobby_${lobby.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_lobbies', filter: `id=eq.${lobby.id}` }, (payload) => {
                if (payload.eventType === 'DELETE' || (payload.new && payload.new.status === 'closed')) {
                    setLobby(null);
                    setMembers([]);
                    setMatch(null);
                } else if (payload.new) {
                    setLobby(payload.new);
                    // If a new match started
                    if (payload.new.active_match_id && payload.new.active_match_id !== lobby.active_match_id) {
                        loadMatchData(payload.new.active_match_id);
                    }
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members', filter: `lobby_id=eq.${lobby.id}` }, () => {
                loadLobbyData(lobby.id); // Reload members (could optimize to only update array)
            });

        let subMatch = null;
        if (lobby.active_match_id) {
            subMatch = supabase.channel(`match_${lobby.active_match_id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_matches', filter: `id=eq.${lobby.active_match_id}` }, (payload) => {
                    if (payload.new) setMatch(payload.new);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${lobby.active_match_id}` }, () => {
                    loadMatchData(lobby.active_match_id);
                });
        }

        subLobby.subscribe();
        if (subMatch) subMatch.subscribe();

        return () => {
            supabase.removeChannel(subLobby);
            if (subMatch) supabase.removeChannel(subMatch);
        };
    }, [lobby?.id, lobby?.active_match_id]);

    // Heartbeat
    useEffect(() => {
        if (!user?.id || !lobby?.id) {
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
            return;
        }

        const setupHeartbeat = async () => {
            // Write immediately
            await supabase.from('lobby_members').update({ last_seen_at: new Date().toISOString() }).eq('lobby_id', lobby.id).eq('user_id', user.id);
            if (lobby.active_match_id) {
                // If in match, update there too
                await supabase.from('match_players').update({ last_seen_at: new Date().toISOString() }).eq('match_id', lobby.active_match_id).eq('user_id', user.id);
            }
        };

        setupHeartbeat();
        heartbeatTimer.current = setInterval(setupHeartbeat, 10000); // Every 10s

        return () => {
            if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
        };
    }, [user?.id, lobby?.id, lobby?.active_match_id]);


    // Actions
    const createLobby = async (gameType) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // 1. Create Lobby
            const { data: newLobby, error: lobbyErr } = await supabase
                .from('platform_lobbies')
                .insert({
                    host_user_id: user.id,
                    join_code: joinCode,
                    selected_game: gameType || 'quiz',
                    status: 'waiting',
                    settings: { cat: [], diff: [1] } // Default settings
                })
                .select()
                .single();

            if (lobbyErr) throw lobbyErr;

            // 2. Add Host to members
            await supabase
                .from('lobby_members')
                .insert({
                    lobby_id: newLobby.id,
                    user_id: user.id,
                    role: 'host',
                    state: 'in_lobby'
                });

            await loadLobbyData(newLobby.id);
            return newLobby;
        } catch (err) {
            console.error("Create lobby error:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const joinLobby = async (joinCode) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const { data: targetLobby } = await supabase
                .from('platform_lobbies')
                .select('id, status')
                .eq('join_code', joinCode.toUpperCase())
                .neq('status', 'closed')
                .single();

            if (!targetLobby) throw new Error("Lobby not found or already closed");

            await joinLobbyById(targetLobby.id);
        } catch (err) {
            console.error("Join lobby error:", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const joinLobbyById = async (id) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const { data: targetLobby } = await supabase
                .from('platform_lobbies')
                .select('id, status')
                .eq('id', id)
                .neq('status', 'closed')
                .single();

            if (!targetLobby) throw new Error("Lobby not found or already closed");

            // Check if already a member, if not insert
            const { data: existingMember } = await supabase
                .from('lobby_members')
                .select('*')
                .eq('lobby_id', targetLobby.id)
                .eq('user_id', user.id)
                .single();

            if (existingMember) {
                await supabase.from('lobby_members').update({ state: 'in_lobby', left_at: null }).eq('lobby_id', targetLobby.id).eq('user_id', user.id);
            } else {
                await supabase.from('lobby_members').insert({
                    lobby_id: targetLobby.id,
                    user_id: user.id,
                    role: 'member',
                    state: 'in_lobby'
                });
            }

            await loadLobbyData(targetLobby.id);
        } catch (err) {
            console.error("Join lobby error:", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const leaveLobby = async () => {
        if (!user || !lobby) return;
        try {
            // Update state to left
            await supabase.from('lobby_members').update({ state: 'left', left_at: new Date().toISOString() }).eq('lobby_id', lobby.id).eq('user_id', user.id);

            // If in match, also leave match
            if (lobby.active_match_id && myMatchState && myMatchState.state !== 'left') {
                await supabase.from('match_players').update({ state: 'left', left_at: new Date().toISOString(), forfeit: true }).eq('match_id', lobby.active_match_id).eq('user_id', user.id);
            }

            setLobby(null);
            setMembers([]);
            setMatch(null);
            setMatchPlayers([]);
            sessionStorage.removeItem('ab_quiz_active_lobby');
        } catch (e) {
            console.error(e);
        }
    };

    const leaveGame = async () => {
        if (!user || !lobby || !match) return;
        try {
            // Only leave the GAME, return to lobby post-game state
            await supabase.from('match_players').update({ state: 'left', left_at: new Date().toISOString(), forfeit: true }).eq('match_id', match.id).eq('user_id', user.id);
            await supabase.from('lobby_members').update({ state: 'in_lobby' }).eq('lobby_id', lobby.id).eq('user_id', user.id);

            // Note: 1v1 forfeit logic will be handled by a DB trigger or separate game controller
            // Here we just mark our local state as 'not in game' but keep the lobby
        } catch (e) {
            console.error(e);
        }
    };

    const updateLobbySettings = async (settings) => {
        if (!isHost || !lobby) return;
        await supabase.from('platform_lobbies').update({ settings }).eq('id', lobby.id);
    };

    const setLobbyGame = async (gameType) => {
        if (!isHost || !lobby) return;
        await supabase.from('platform_lobbies').update({ selected_game: gameType }).eq('id', lobby.id);
    };

    const startMatch = async () => {
        if (!isHost || !lobby) return;
        setIsLoading(true);
        try {
            // 1. Create a new Match record
            const { data: newMatch, error: matchErr } = await supabase
                .from('platform_matches')
                .insert({
                    lobby_id: lobby.id,
                    game_type: lobby.selected_game,
                    status: 'preparing',
                    snapshot_settings: lobby.settings,
                    created_by: user.id
                })
                .select()
                .single();
            if (matchErr) throw matchErr;

            // 2. Add all currently 'in_lobby' members as active 'match_players'
            const activeMembers = members.filter(m => m.state === 'in_lobby' || m.state === 'in_game');
            const playersToInsert = activeMembers.map(m => ({
                match_id: newMatch.id,
                user_id: m.user_id,
                state: 'active'
            }));

            if (playersToInsert.length > 0) {
                await supabase.from('match_players').insert(playersToInsert);
            }

            // 3. Update Lobby to point to this new match and set starting
            await supabase.from('platform_lobbies')
                .update({
                    status: 'starting',
                    active_match_id: newMatch.id
                })
                .eq('id', lobby.id);

            // 4. Update member states to 'in_game'
            if (activeMembers.length > 0) {
                // Not ideal for massive scalability to await in loop, but fine for 2-4 players.
                // Could be batched.
                for (const m of activeMembers) {
                    await supabase.from('lobby_members').update({ state: 'in_game' }).eq('lobby_id', lobby.id).eq('user_id', m.user_id);
                }
            }

            // Provide real-time UI the go-ahead
        } catch (err) {
            console.error("Start match error:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PlatformSessionContext.Provider value={{
            lobby,
            members,
            match,
            matchPlayers,
            myMemberState,
            myMatchState,
            isHost,
            isLoading,
            error,
            createLobby,
            joinLobby,
            joinLobbyById,
            leaveLobby,
            leaveGame,
            updateLobbySettings,
            setLobbyGame,
            startMatch
        }}>
            {children}
        </PlatformSessionContext.Provider>
    );
};
