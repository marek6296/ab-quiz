import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { FriendsList } from '../components/auth/FriendsList';
import { usePlatformSession } from '../context/PlatformSessionContext';

const GAMES = [
    { id: 'quiz', name: 'Kvíz Duel (AZ Kvíz)', max: 2, icon: '🧠', color: '#3b82f6' },
    { id: 'bilionar', name: 'Bilionár Battle', max: 8, icon: '💰', color: '#facc15' },
    { id: 'higher_lower', name: 'Vyššie alebo Nižšie', max: 8, icon: '📈', color: '#10b981' }
];

const COLOR_PALETTE = ['#eab308', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

export const PlatformLobby = ({ onlineUserIds, onStartGameFlow }) => {
    const { user } = useAuth();
    const { lobby, members, isHost, updateLobbySettings, setLobbyGame, startMatch, leaveLobby, refreshLobby } = usePlatformSession();

    const hasStartedRef = React.useRef(false);

    const [availableQuizCategories, setAvailableQuizCategories] = useState([]);
    const [availableBilionarCategories, setAvailableBilionarCategories] = useState([]);
    const [countdown, setCountdown] = useState(null);

    // Fetch categories on mount
    useEffect(() => {
        const fetchCategories = async () => {
            const { data: qData } = await supabase.from('questions').select('category');
            if (qData) {
                const unique = [...new Set(qData.map(q => q.category).filter(Boolean))].sort();
                setAvailableQuizCategories(unique);
            }
            const { data: bData } = await supabase.from('bilionar_questions').select('category');
            if (bData) {
                const unique = [...new Set(bData.map(q => q.category).filter(Boolean))].sort();
                setAvailableBilionarCategories(unique);
            }
        };
        fetchCategories();
    }, []);

    const handleSelectGame = async (gameId) => {
        if (!isHost) return;
        setLobbyGame(gameId);
        updateLobbySettings({ ...lobby.settings, cat: [] }); // Reset categories
    };

    // Globálny odpočet a presun do hry pre VŠETKÝCH hráčov
    useEffect(() => {
        if (lobby?.status === 'starting' && !hasStartedRef.current) {
            hasStartedRef.current = true;

            const doCountdown = async () => {
                setCountdown("3");
                await new Promise(r => setTimeout(r, 1000));
                setCountdown("2");
                await new Promise(r => setTimeout(r, 1000));
                setCountdown("1");
                await new Promise(r => setTimeout(r, 1000));
                setCountdown("ŠTART!");
                await new Promise(r => setTimeout(r, 600));

                if (isHost) {
                    try {
                        setCountdown("Pripravujem zápas...");
                        // Host reálne odpáli hru v databáze AŽ PO SKONČENÍ odpočtu
                        await startMatch();
                    } catch (e) {
                        setCountdown(null);
                        hasStartedRef.current = false;
                        alert("Nepodarilo sa spustiť hru: " + e.message);
                    }
                } else {
                    setCountdown("Pripravujem zápas...");
                }
            };
            doCountdown();
        }
    }, [lobby?.status, isHost, startMatch]);

    // Listener na skutočné spustenie hry (po tom čo Host vytvoril zápas na DB)
    useEffect(() => {
        if (lobby?.status === 'starting' && lobby?.active_match_id) {
            if (onStartGameFlow) {
                onStartGameFlow(
                    lobby.selected_game,
                    lobby.active_match_id,
                    lobby.selected_game === 'quiz' ? '1v1_online' : lobby.selected_game,
                    {
                        rules: lobby.settings?.rules || 'hex',
                        cat: lobby.settings?.cat || [],
                        diff: lobby.settings?.diff || [1],
                        botDiff: 2
                    }
                );
            }
        }
    }, [lobby?.status, lobby?.active_match_id, lobby?.selected_game, lobby?.settings, onStartGameFlow]);

    const handleToggleCategory = (cat) => {
        if (!isHost) return;
        const currentCats = lobby?.settings?.cat || [];
        const newCats = currentCats.includes(cat)
            ? currentCats.filter(c => c !== cat)
            : [...currentCats, cat];
        updateLobbySettings({ ...lobby.settings, cat: newCats });
    };

    const handleChangeDifficulty = (diffLevel) => {
        if (!isHost) return;
        const currentDiffs = lobby?.settings?.diff || [2];
        let newDiffs;
        if (currentDiffs.includes(diffLevel)) {
            newDiffs = currentDiffs.length === 1 ? currentDiffs : currentDiffs.filter(d => d !== diffLevel);
        } else {
            newDiffs = [...currentDiffs, diffLevel];
        }
        updateLobbySettings({ ...lobby.settings, diff: newDiffs });
    };

    const handleInvite = async (partner) => {
        if (!isHost || !lobby) return;

        // Vložíme do lobby_members záznam s tagom 'invited' – to spustí notifikáciu u pozvaného.
        const { error } = await supabase.from('lobby_members').upsert({
            lobby_id: lobby.id,
            user_id: partner.id,
            role: 'member',
            state: 'invited'
        }, { onConflict: 'lobby_id, user_id' });

        if (error) {
            alert(`Chyba pri pozývaní: ${error.message}`);
        }
    };

    const handleRemovePlayer = async (playerId) => {
        if (!isHost || !lobby) return;
        // Host môž vykopnúť hráča zmenou jeho stavu na 'left'
        await supabase.from('lobby_members').update({ state: 'left', left_at: new Date().toISOString() }).eq('lobby_id', lobby.id).eq('user_id', playerId);
    };

    const handleStartMatch = async () => {
        if (!isHost || !lobby) return;

        // Zmení stav Lobby na starting, čo u všetkých zapne UI odpočet
        await supabase.from('platform_lobbies').update({ status: 'starting' }).eq('id', lobby.id);
    };

    if (!lobby) return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Načítavam dáta Lobby...</div>;

    const gameInfo = GAMES.find(g => g.id === lobby.selected_game) || GAMES[1];

    // Extrakcia nastavení
    const selectedCategories = lobby?.settings?.cat || [];
    const difficulty = lobby?.settings?.diff || [2];
    const gameRules = lobby?.settings?.rules || 'hex';

    if (countdown !== null) {
        const isPreparing = countdown === 'Pripravujem zápas...';
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 20000,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(5, 10, 20, 0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                color: 'white', fontFamily: '"Outfit", sans-serif', transition: 'background 0.5s ease'
            }}>
                <div key={countdown} style={{
                    fontSize: isPreparing ? 'clamp(2rem, 5vw, 4rem)' : 'clamp(5rem, 15vw, 15rem)',
                    fontWeight: '900',
                    color: '#facc15',
                    textShadow: '0 0 60px rgba(250, 204, 21, 0.8), 0 0 20px rgba(255, 255, 255, 0.4)',
                    animation: isPreparing ? 'pulseSoft 2s infinite' : 'countdownPopIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'
                }}>
                    {countdown}
                </div>
                {!isPreparing && (
                    <div style={{ marginTop: '2rem', fontSize: '1.5rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '4px', textTransform: 'uppercase', animation: 'fadeIn 1s ease-out' }}>
                        Priprav sa na hru
                    </div>
                )}
                <style>{`
                    @keyframes countdownPopIn { 0% { opacity: 0; transform: scale(0.3) translateY(50px); filter: blur(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes pulseSoft { 0%, 100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); text-shadow: 0 0 80px rgba(250, 204, 21, 1); } }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', width: '100%', minHeight: '80vh', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center', alignItems: 'flex-start' }}>

            {/* LOBBY COLUMN */}
            <div style={{ flex: '1 1 500px', maxWidth: '800px', background: 'rgba(15, 23, 42, 0.9)', padding: '2.5rem', borderRadius: '24px', border: `2px solid ${gameInfo.color}50` }}>

                {/* Header Lobby */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '2.5rem', margin: 0, color: 'white' }}>{isHost ? 'Tvoja Lobby' : 'Lobby'}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <span style={{ color: '#94a3b8' }}>Pozývací kód: </span>
                            <strong style={{ fontSize: '1.8rem', letterSpacing: '4px', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 1rem', borderRadius: '8px', border: '1px dashed #cbd5e1', color: 'white' }}>
                                {lobby.join_code}
                            </strong>
                            <button className="neutral" onClick={() => navigator.clipboard.writeText(lobby.join_code)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Kopírovať</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {isHost && (
                            <button className="neutral" onClick={() => refreshLobby()} style={{ padding: '1rem', border: '1px solid rgba(250, 204, 21, 0.5)', color: '#facc15', background: 'rgba(250, 204, 21, 0.1)' }}>
                                🔄 Refreshnúť Lobby
                            </button>
                        )}
                        <button className="neutral" onClick={() => leaveLobby()} style={{ padding: '1rem 2rem', border: '2px solid rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>
                            {isHost ? 'Zavrieť Lobby' : 'Opustiť Lobby'}
                        </button>
                    </div>
                </div>

                {/* Vybratá Hra */}
                <div style={{ marginBottom: '3rem', padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <h3 style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Aktuálne Zvolená Hra</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {isHost ? (
                            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                                {GAMES.map(g => (
                                    <div
                                        key={g.id}
                                        onClick={() => handleSelectGame(g.id)}
                                        style={{
                                            minWidth: '200px', padding: '1.5rem', borderRadius: '16px', cursor: 'pointer',
                                            border: `2px solid ${lobby.selected_game === g.id ? g.color : 'rgba(255,255,255,0.1)'}`,
                                            background: lobby.selected_game === g.id ? `${g.color}15` : 'rgba(255,255,255,0.05)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ fontSize: '2.5rem' }}>{g.icon}</span>
                                        <span style={{ color: lobby.selected_game === g.id ? g.color : '#cbd5e1', fontWeight: 'bold', textAlign: 'center' }}>{g.name}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Max {g.max} hráčov</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ fontSize: '4rem' }}>{gameInfo.icon}</div>
                                <div>
                                    <div style={{ fontSize: '2rem', color: gameInfo.color, fontWeight: 'bold' }}>{gameInfo.name}</div>
                                    <div style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>Čaká sa na hostiteľa na spustenie hry (Max {gameInfo.max} hráčov).</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* NASTAVENIA HRY */}
                {(lobby.selected_game === 'quiz' || lobby.selected_game === 'bilionar') && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            ⚙️ Nastavenia Hry {!isHost && <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>(Upravuje Hostiteľ)</span>}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {lobby.selected_game === 'quiz' && (
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Herné Pravidlá</label>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button disabled={!isHost} className={`secondary ${gameRules === 'hex' ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', opacity: gameRules === 'hex' ? 1 : 0.4, border: gameRules === 'hex' ? '1px solid #38bdf8' : 'none' }} onClick={() => updateLobbySettings({ ...lobby.settings, rules: 'hex' })}>
                                            Hex (Cesta)
                                        </button>
                                        <button disabled={!isHost} className={`secondary ${gameRules === 'points' ? 'active' : ''}`} style={{ flex: 1, padding: '0.8rem', opacity: gameRules === 'points' ? 1 : 0.4, border: gameRules === 'points' ? '1px solid #f97316' : 'none' }} onClick={() => updateLobbySettings({ ...lobby.settings, rules: 'points' })}>
                                            Body (Rýchlosť)
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Náročnosť Otázok</label>
                                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '12px' }}>
                                    {[
                                        { level: 1, label: 'Ľahké', color: '#4ade80' },
                                        { level: 2, label: 'Stredné', color: '#fbbf24' },
                                        { level: 3, label: 'Ťažké', color: '#ef4444' }
                                    ].map(diff => {
                                        const isSelected = difficulty.includes(diff.level);
                                        return (
                                            <button
                                                key={diff.level}
                                                disabled={!isHost}
                                                onClick={() => handleChangeDifficulty(diff.level)}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', background: isSelected ? diff.color : 'transparent', color: isSelected ? '#0f172a' : '#cbd5e1', border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default', transition: 'all 0.2s', opacity: isHost ? 1 : (isSelected ? 1 : 0.5) }}>
                                                {diff.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Kategórie</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    <button disabled={!isHost} onClick={() => updateLobbySettings({ ...lobby.settings, cat: [] })} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: selectedCategories.length === 0 ? 'bold' : 'normal', background: selectedCategories.length === 0 ? '#38bdf8' : 'rgba(255,255,255,0.05)', color: selectedCategories.length === 0 ? '#0f172a' : '#cbd5e1', border: `1px solid ${selectedCategories.length === 0 ? 'transparent' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default' }}>
                                        ✨ Všetky
                                    </button>
                                    {(lobby.selected_game === 'quiz' ? availableQuizCategories : availableBilionarCategories).map(c => {
                                        const isSelected = selectedCategories.includes(c);
                                        return (
                                            <button disabled={!isHost} key={c} onClick={() => handleToggleCategory(c)} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.8rem', background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)', color: isSelected ? '#38bdf8' : '#94a3b8', border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`, cursor: isHost ? 'pointer' : 'default', opacity: isHost ? 1 : (isSelected ? 1 : 0.5) }}>
                                                {c}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hráči v Míestnosti */}
                <div>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Hráči v Miestnosti ({members.length}/{gameInfo.max})</span>
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
                        {members.map((p, idx) => {
                            const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
                            return (
                                <div key={p.user_id} style={{
                                    background: 'rgba(255,255,255,0.05)', border: `2px solid ${color}50`, padding: '1.5rem 1rem', borderRadius: '16px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative'
                                }}>
                                    {p.role === 'host' && (
                                        <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#eab308', color: 'black', padding: '0.2rem 0.8rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                                            HOST
                                        </div>
                                    )}
                                    <div style={{ position: 'relative' }}>
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${p.user_id}`} alt={p.user_id} style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', objectFit: 'cover' }} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem', textAlign: 'center' }}>Hráč {idx + 1} <br /><small style={{ color: '#64748b', fontSize: '0.7rem' }}>{p.state}</small></span>
                                    {isHost && user.id !== p.user_id && (
                                        <button onClick={() => handleRemovePlayer(p.user_id)} style={{ position: 'absolute', top: 5, right: 5, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}>
                                            &times;
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                        {isHost && members.length < gameInfo.max && (
                            <div style={{
                                border: '2px dashed rgba(255,255,255,0.1)', padding: '1.5rem 1rem', borderRadius: '16px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                color: '#64748b'
                            }}>
                                <span style={{ fontSize: '2rem' }}>+</span>
                                <span style={{ fontSize: '0.9rem', textAlign: 'center' }}>Čaká sa na pripojenie</span>
                            </div>
                        )}
                    </div>

                    {isHost && (
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                            <button
                                className="primary"
                                onClick={handleStartMatch}
                                disabled={members.length < 1 || countdown !== null}
                                style={{ flex: 1, padding: '1.5rem', fontSize: '1.2rem', fontWeight: 'bold', boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}
                            >
                                SPUSTIŤ ({gameInfo.name})
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* FRIENDS COLUMN */}
            {isHost && (
                <div style={{ flex: '1 1 300px', maxWidth: '400px' }}>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '1rem', paddingLeft: '1rem' }}>Priatelia</h3>
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <FriendsList onInvite={handleInvite} currentLobbyPlayers={members} onlineUserIds={onlineUserIds} />
                    </div>
                </div>
            )}
        </div>
    );
};
