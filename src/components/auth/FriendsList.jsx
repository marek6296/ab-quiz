import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { generateInitialBoard } from '../../game-engine/board';
import { useAudio } from '../../hooks/useAudio';

export const FriendsList = ({ selectedGameRules = 'hex', selectedCategory = [], selectedDifficulty = 1, onlineUserIds = new Set(), isBilionar = false, existingBilionarGameId = null, isHost = true, onInvite = null }) => {
    const { user } = useAuth();
    const [friends, setFriends] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { playSound } = useAudio();

    const [outgoingInvite, setOutgoingInvite] = useState(null);

    // Default `FriendsList` parameters for older components vs new PlatformLobby
    const isPlatformLobby = typeof onInvite === 'function';

    // Fetch friends and pending requests
    const fetchFriends = async () => {
        if (!user) return;

        // We get relationships where the current user is either user_id or friend_id
        const { data, error } = await supabase
            .from('friends')
            .select(`
        id,
        status,
        user_id,
        friend_id,
        sender:profiles!friends_user_id_fkey(id, username, online_status, avatar_url),
        receiver:profiles!friends_friend_id_fkey(id, username, online_status, avatar_url)
      `)
            .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

        if (error) {
            console.error('Error fetching friends:', error);
            return;
        }

        setFriends(data || []);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchFriends();

        // Subscribe to realtime changes on the friends table for this user
        const subscription = supabase
            .channel('friends_updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friends',
                filter: `user_id=eq.${user.id}`
            }, fetchFriends)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friends',
                filter: `friend_id=eq.${user.id}`
            }, fetchFriends)
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setLoading(true);
        setError('');

        // Search for users by username or email, excluding the current user
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, email, avatar_url')
            .or(`username.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
            .neq('id', user.id)
            .limit(5);

        if (error) {
            setError('Chyba pri vyhľadávaní.');
            console.error(error);
        } else {
            setSearchResults(data || []);
            if (data?.length === 0) setError('Nenašli sa žiadni užívatelia.');
        }
        setLoading(false);
    };

    const sendFriendRequest = async (targetUserId) => {
        setError('');
        const { error } = await supabase
            .from('friends')
            .insert({
                user_id: user.id,
                friend_id: targetUserId,
                status: 'pending'
            });

        if (error) {
            if (error.code === '23505') {
                // Unique violation
                alert('Už ste poslali žiadosť (alebo ste priatelia).');
            } else {
                console.error('Error sending request:', error);
                alert('Nepodarilo sa odoslať žiadosť.');
            }
        } else {
            setSearchQuery('');
            setSearchResults([]);
            fetchFriends();
        }
    };

    const processRequest = async (id, newStatus) => {
        const { error } = await supabase
            .from('friends')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) console.error('Error accepting request:', error);
        else fetchFriends();
    };

    const removeFriend = async (id) => {
        const { error } = await supabase
            .from('friends')
            .delete()
            .eq('id', id);

        if (error) console.error('Error removing friend:', error);
        else fetchFriends();
    };

    const handleChallenge = async (partner) => {
        if (outgoingInvite) return;

        // PLATFORM LOBBY INVITE LOGIC (NEW)
        if (isPlatformLobby && onInvite) {
            onInvite(partner);
            setOutgoingInvite({ partnerName: partner.username });
            playSound('click');
            setTimeout(() => setOutgoingInvite(null), 3000); // Clear after 3s
            return;
        }

        if (isBilionar) {
            // BILIONAR CHALLENGE LOGIC
            let gameId = existingBilionarGameId;

            if (!gameId) {
                const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const { data: game, error: gameError } = await supabase.from('bilionar_games').insert([{
                    host_id: user.id,
                    join_code: joinCode,
                    status: 'waiting',
                    settings: { questions_count: 10, difficulty: 2 },
                    state: { phase: 'init' }
                }]).select().single();

                if (gameError) {
                    alert(`Chyba pri vytváraní hry: ${gameError.message}`);
                    return;
                }
                gameId = game.id;

                // Add Host if creating new
                await supabase.from('bilionar_players').insert([{
                    game_id: gameId, user_id: user.id, player_name: user?.user_metadata?.username || 'Host', is_bot: false
                }]);
            }

            // Get current count for color assignment
            const { count: currentCount } = await supabase.from('bilionar_players').select('*', { count: 'exact', head: true }).eq('game_id', gameId);
            const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
            const assignedColor = COLOR_PALETTE[currentCount % COLOR_PALETTE.length];

            // Add Partner (This triggers their invite UI via useGameInvites)
            const { error: inviteError } = await supabase.from('bilionar_players').insert([{
                game_id: gameId,
                user_id: partner.id,
                player_name: partner.username,
                avatar_url: partner.avatar_url,
                is_bot: false,
                color: assignedColor
            }]);

            if (inviteError) {
                if (inviteError.code === '23505') {
                    alert(`${partner.username} už je v tejto miestnosti!`);
                } else {
                    alert(`Pozvánka zlyhala: ${inviteError.message}`);
                }
                return;
            }

            if (!existingBilionarGameId) {
                setOutgoingInvite({ gameId: gameId, partnerName: partner.username, gameType: 'bilionar' });
            } else {
                // Just play a sound or show a small feedback that invitation was sent
                playSound('click');
            }
        } else {
            // HEX CHALLENGE LOGIC
            const diff = Array.isArray(selectedDifficulty) ? selectedDifficulty[0] : selectedDifficulty;
            const { data, error } = await supabase.from('games').insert({
                player1_id: user.id,
                player2_id: partner.id,
                current_turn: user.id,
                game_type: selectedGameRules,
                category: JSON.stringify(selectedCategory),
                difficulty: parseInt(diff) || 1,
                is_public: false,
                board_state: generateInitialBoard(selectedGameRules)
            }).select().single();

            if (error) {
                alert(`Nepodarilo sa vytvoriť hru: ${error.message}`);
            } else {
                setOutgoingInvite({ gameId: data.id, partnerName: partner.username, gameType: 'hex' });
            }
        }
    };

    const handleCancelGameInvite = async () => {
        if (outgoingInvite) {
            if (outgoingInvite.gameType === 'bilionar') {
                await supabase.from('bilionar_games').delete().eq('id', outgoingInvite.gameId);
            } else {
                await supabase.from('games').delete().eq('id', outgoingInvite.gameId);
            }
            setOutgoingInvite(null);
        }
    };

    // Helper to categorize relationships
    const pendingReceived = friends.filter(f => f.status === 'pending' && f.friend_id === user.id);
    const acceptedFriends = friends.filter(f => f.status === 'accepted');

    return (
        <div className="friends-list-container">

            {/* Outgoing Invite Modal */}
            {outgoingInvite && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <h2>Čaká sa na prijatie...</h2>
                        <div className="spinner"></div>
                        <p className="question-text" style={{ fontSize: '1.2rem', margin: '2rem 0' }}>
                            Vyzvali ste hráča <strong>{outgoingInvite.partnerName}</strong>
                        </p>
                        <button className="neutral" onClick={handleCancelGameInvite}>Zrušiť výzvu</button>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="friend-search-form">
                <input
                    type="text"
                    placeholder="Hľadať podľa mena alebo emailu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
                <button type="submit" disabled={loading} className="primary search-btn">Hľadať</button>
            </form>

            {error && <div className="friend-error" style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</div>}

            {/* Search Results */}
            {searchResults.length > 0 && (
                <div className="search-results">
                    <h4>Výsledky hľadania</h4>
                    <ul>
                        {searchResults.map(result => (
                            <li key={result.id} className="friend-item" style={{ gap: '0.75rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                    {result.avatar_url ? <img src={result.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                                </div>
                                <span>{result.username}</span>
                                <button className="secondary small" onClick={() => sendFriendRequest(result.id)}>Pridať</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Pending Requests Received */}
            {pendingReceived.length > 0 && (
                <div className="friend-section">
                    <h4>Žiadosti o priateľstvo</h4>
                    <ul>
                        {pendingReceived.map(req => (
                            <li key={req.id} className="friend-item pending" style={{ gap: '0.75rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                    {req.sender.avatar_url ? <img src={req.sender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                                </div>
                                <span>{req.sender.username}</span>
                                <div className="actions">
                                    <button className="primary small" onClick={() => processRequest(req.id, 'accepted')}>Prijať</button>
                                    <button className="danger small" onClick={() => removeFriend(req.id)}>Odmietnuť</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Accepted Friends */}
            <div className="friend-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Moji Priatelia</h4>
                    <button
                        className="secondary small"
                        onClick={() => {
                            setLoading(true);
                            fetchFriends().finally(() => setLoading(false));
                        }}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', opacity: 0.8 }}
                    >
                        ↻ Obnoviť
                    </button>
                </div>
                {acceptedFriends.length === 0 ? (
                    <p className="placeholder-text" style={{ marginTop: '0.5rem', textAlign: 'left' }}>Ešte nemáte žiadnych priateľov.</p>
                ) : (
                    <ul>
                        {acceptedFriends.map(friend => {
                            const partner = friend.user_id === user.id ? friend.receiver : friend.sender;
                            const isOnline = onlineUserIds.has(partner.id);
                            const onlineClass = isOnline ? 'online' : (partner.online_status === 'playing' ? 'online' : 'offline');

                            return (
                                <li key={friend.id} className="friend-item">
                                    <div className="friend-info" style={{ gap: '0.75rem' }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                {partner.avatar_url ? <img src={partner.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                                            </div>
                                            <span
                                                className={`status-dot ${onlineClass}`}
                                                style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', border: '2px solid #1e293b' }}
                                            ></span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 600 }}>{partner.username}</span>
                                            {partner.online_status === 'playing' && <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>V hre</span>}
                                        </div>
                                    </div>
                                    <div className="actions">
                                        <button
                                            className="primary small"
                                            disabled={!isOnline || partner.online_status === 'playing' || !isHost}
                                            onClick={() => handleChallenge(partner)}
                                        >
                                            {partner.online_status === 'playing' ? 'V Hre' : 'Pozvať'}
                                        </button>
                                        <button className="danger small" onClick={() => removeFriend(friend.id)}>X</button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

        </div>
    );
};
