import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore, APP_STATES } from '../game-engine/store';

export const Matchmaking = ({ user }) => {
    const {
        setAppState, gameRules, gameMode, setGameMode,
        setActiveGameId, resetToLobby
    } = useGameStore();

    const [statusText, setStatusText] = useState('Pripájanie k serveru...');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [isCreatingPrivate, setIsCreatingPrivate] = useState(false);

    useEffect(() => {
        if (gameMode === '1v1_quick') {
            findQuickMatch();
        } else if (gameMode === '1v1_private_create') {
            createPrivateRoom();
        }
    }, [gameMode]);

    const findQuickMatch = async () => {
        setStatusText('Hľadám voľného súpera...');

        // Try to find a waiting public game
        const { data: waitingGames } = await supabase.from('games')
            .select('*')
            .eq('status', 'waiting')
            .eq('is_public', true)
            .is('player2_id', null)
            .neq('player1_id', user.id)
            .limit(1);

        if (waitingGames && waitingGames.length > 0) {
            // Join it
            const targetGame = waitingGames[0];
            setStatusText('Pripájam sa k hre...');
            const { error } = await supabase.from('games')
                .update({
                    player2_id: user.id,
                    status: 'active',
                    current_turn: targetGame.player1_id // Player 1 starts
                })
                .eq('id', targetGame.id)
                .is('player2_id', null); // Ensure no race condition

            if (!error) {
                setActiveGameId(targetGame.id);
                setAppState(APP_STATES.IN_GAME);
            } else {
                // If failed (someone else took it), try again
                findQuickMatch();
            }
            return;
        }

        // If no game found, create one and wait
        setStatusText('Vytváram novú hru. Čakám na súpera...');
        const { data: newGame, error } = await supabase.from('games')
            .insert({
                player1_id: user.id,
                status: 'waiting',
                game_type: gameRules,
                is_public: true
            })
            .select()
            .single();

        if (newGame) {
            listenForOpponent(newGame.id);
        }
    };

    const createPrivateRoom = async () => {
        setStatusText('Generujem kód miestnosti...');
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();

        const { data: newGame } = await supabase.from('games')
            .insert({
                player1_id: user.id,
                status: 'waiting',
                game_type: gameRules,
                is_public: false,
                room_code: code
            })
            .select()
            .single();

        if (newGame) {
            setStatusText(`Kód miestnosti: ${code}`);
            setIsCreatingPrivate(true);
            listenForOpponent(newGame.id);
        }
    };

    const joinPrivateRoom = async () => {
        if (!roomCodeInput) return;
        setStatusText('Overujem kód...');

        const { data: games } = await supabase.from('games')
            .select('*')
            .eq('room_code', roomCodeInput.toUpperCase())
            .eq('status', 'waiting')
            .is('player2_id', null)
            .limit(1);

        if (games && games.length > 0) {
            const targetGame = games[0];
            const { error } = await supabase.from('games')
                .update({
                    player2_id: user.id,
                    status: 'active',
                    current_turn: targetGame.player1_id
                })
                .eq('id', targetGame.id);

            if (!error) {
                setGameMode('1v1_private');
                setActiveGameId(targetGame.id);
                setAppState(APP_STATES.IN_GAME);
            } else {
                setStatusText('Nepodarilo sa pripojiť. Skúste znova.');
            }
        } else {
            setStatusText('Miestnosť neexistuje alebo je plná.');
        }
    };

    const listenForOpponent = (gameId) => {
        const channel = supabase.channel(`wait_${gameId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${gameId}`
            }, (payload) => {
                if (payload.new.status === 'active' && payload.new.player2_id) {
                    supabase.removeChannel(channel);
                    setActiveGameId(gameId);
                    setAppState(APP_STATES.IN_GAME);
                }
            })
            .subscribe();
    };

    const handleCancel = async () => {
        // Cleanup if we created a waiting game
        await supabase.from('games')
            .delete()
            .eq('player1_id', user.id)
            .eq('status', 'waiting');

        resetToLobby();
    };

    return (
        <div className="game-container start-screen">
            <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.95)' }}>
                <div className="modal-content glass-panel" style={{ textAlign: 'center', width: '400px', padding: '3rem 2rem' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#f8fafc' }}>
                        {gameMode === '1v1_private_join' ? 'Pripojiť sa' : 'Matchmaking'}
                    </h2>

                    <div style={{ margin: '2rem 0', minHeight: '60px' }}>
                        {gameMode === '1v1_private_join' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Zadajte kód miestnosti"
                                    value={roomCodeInput}
                                    onChange={(e) => setRoomCodeInput(e.target.value)}
                                    style={{ padding: '1rem', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: 'white', textTransform: 'uppercase' }}
                                    maxLength={6}
                                />
                                <button className="primary" onClick={joinPrivateRoom} disabled={roomCodeInput.length < 3}>
                                    Pripojiť
                                </button>
                                <p style={{ color: '#ef4444', height: '20px' }}>{statusText !== 'Pripájanie k serveru...' ? statusText : ''}</p>
                            </div>
                        ) : (
                            <>
                                <div className="loader" style={{ margin: '0 auto 1rem', width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>{statusText}</p>
                                {isCreatingPrivate && (
                                    <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#64748b' }}>Čaká sa na pripojenie súpera s týmto kódom...</p>
                                )}
                            </>
                        )}
                    </div>

                    <button className="neutral" onClick={handleCancel} style={{ width: '100%', marginTop: '1rem' }}>
                        Zrušiť a Návrat
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};
