import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { generateInitialBoard } from '../../hooks/useGameState';
import { useAudio } from '../../hooks/useAudio';

export const FriendsList = ({ selectedGameRules = 'hex', selectedCategory = 'Všetky kategórie', selectedDifficulty = 1 }) => {
    const { user } = useAuth();
    const [friends, setFriends] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { playSound } = useAudio();

    const [outgoingInvite, setOutgoingInvite] = useState(null);

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
        sender:profiles!friends_user_id_fkey(id, username, online_status),
        receiver:profiles!friends_friend_id_fkey(id, username, online_status)
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
            .select('id, username, email')
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
        const { data, error } = await supabase.from('games').insert({
            player1_id: user.id,
            player2_id: partner.id,
            current_turn: user.id, // Challenger starts first
            game_type: selectedGameRules,
            category: selectedCategory,
            difficulty: selectedDifficulty,
            board_state: generateInitialBoard(selectedGameRules)
        }).select().single();

        if (error) {
            console.error('Error creating game invite:', error);
            alert('Nepodarilo sa vytvoriť hru.');
        } else {
            setOutgoingInvite({ gameId: data.id, partnerName: partner.username });
        }
    };

    const handleCancelGameInvite = async () => {
        if (outgoingInvite) {
            await supabase.from('games').delete().eq('id', outgoingInvite.gameId);
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
                        <button className="neutral" onClick={cancelChallenge}>Zrušiť výzvu</button>
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
                            <li key={result.id} className="friend-item">
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
                            <li key={req.id} className="friend-item pending">
                                <span>{req.sender.username}</span>
                                <div className="actions">
                                    <button className="primary small" onClick={() => acceptRequest(req.id)}>Prijať</button>
                                    <button className="danger small" onClick={() => removeFriend(req.id)}>Odmietnuť</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Accepted Friends */}
            <div className="friend-section">
                <h4>Moji Priatelia</h4>
                {acceptedFriends.length === 0 ? (
                    <p className="placeholder-text" style={{ marginTop: '0.5rem', textAlign: 'left' }}>Ešte nemáte žiadnych priateľov.</p>
                ) : (
                    <ul>
                        {acceptedFriends.map(friend => {
                            const partner = friend.user_id === user.id ? friend.receiver : friend.sender;
                            return (
                                <li key={friend.id} className="friend-item">
                                    <div className="friend-info">
                                        <span className={`status-dot ${partner.online_status}`}></span>
                                        <span>{partner.username}</span>
                                    </div>
                                    <div className="actions">
                                        <button
                                            className="primary small"
                                            disabled={partner.online_status !== 'online'}
                                            onClick={() => handleChallenge(partner)}
                                        >
                                            Vyzvať
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
