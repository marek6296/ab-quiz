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
    const [mobileTab, setMobileTab] = useState('players'); // 'games', 'settings', 'players', 'friends'

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
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem',
            background: 'var(--bg-gradient, radial-gradient(circle at top, #0f172a, #020617))', color: 'white', boxSizing: 'border-box'
        }}>
            {/* Header NavBar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem',
                background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', border: `1px solid ${gameInfo.color}40`,
                marginBottom: '1rem', flexShrink: 0, gap: '1rem', flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{isHost ? 'Tvoja Lobby' : 'Lobby'}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.3rem 0.8rem', borderRadius: '8px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Kód:</span>
                        <strong style={{ fontSize: '1.2rem', letterSpacing: '2px', color: '#facc15' }}>{lobby.join_code}</strong>
                        <button onClick={() => navigator.clipboard.writeText(lobby.join_code)} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '0 0.5rem' }}>📋</button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                    {isHost && (
                        <button onClick={() => refreshLobby()} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #facc15', background: 'rgba(250, 204, 21, 0.1)', color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>
                            🔄 <span className="hide-mobile">Refresh</span>
                        </button>
                    )}
                    <button onClick={() => leaveLobby()} style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ✖ {isHost ? 'Zavrieť' : 'Opustiť'}
                    </button>
                </div>
            </div>

            {/* Mobile Tabbed Navigation */}
            <div className="mobile-tabs" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.2rem', flexShrink: 0 }}>
                {['games', 'settings', 'players', ...(isHost ? ['friends'] : [])].map(tab => (
                    <button key={tab} onClick={() => setMobileTab(tab)} style={{
                        flex: '1 0 auto', padding: '0.8rem', borderRadius: '12px', border: 'none',
                        background: mobileTab === tab ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                        color: mobileTab === tab ? '#38bdf8' : '#94a3b8',
                        fontWeight: mobileTab === tab ? 'bold' : 'normal',
                        fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px'
                    }}>
                        {tab === 'games' && 'Hra'}
                        {tab === 'settings' && 'Nastavenia'}
                        {tab === 'players' && `Hráči (${members.length})`}
                        {tab === 'friends' && 'Priatelia'}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="lobby-grid" style={{
                gap: '1rem', flex: 1, overflow: 'hidden'
            }}>
                {/* LAVA STRANA: Vyber hry a Nastavenia */}
                <div className={`col-left ${['games', 'settings'].includes(mobileTab) ? 'mobile-active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', overflowY: 'auto', paddingRight: '0.5rem' }}>

                    {/* Hry */}
                    <div className={`panel-games ${mobileTab === 'games' ? 'mobile-active' : ''}`} style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', padding: '1rem', flexShrink: 0 }}>
                        <h3 className="hide-mobile" style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 0.8rem 0' }}>Herný Režim</h3>
                        {isHost ? (
                            <div className="games-grid" style={{ display: 'flex', gap: '0.8rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                {GAMES.map(g => (
                                    <div key={g.id} className="game-option" onClick={() => handleSelectGame(g.id)} style={{
                                        padding: '0.8rem', borderRadius: '12px', cursor: 'pointer',
                                        border: `2px solid ${lobby.selected_game === g.id ? g.color : 'rgba(255,255,255,0.05)'}`,
                                        background: lobby.selected_game === g.id ? `${g.color}15` : 'rgba(255,255,255,0.02)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s'
                                    }}>
                                        <span className="game-icon" style={{ fontSize: '2rem' }}>{g.icon}</span>
                                        <span className="game-name" style={{ color: lobby.selected_game === g.id ? 'white' : '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold' }}>{g.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '2rem' }}>{gameInfo.icon}</span>
                                <div>
                                    <div style={{ color: gameInfo.color, fontSize: '1.1rem', fontWeight: 'bold' }}>{gameInfo.name}</div>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Hostiteľ vyberá hru...</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Nastavenia */}
                    {(lobby.selected_game === 'quiz' || lobby.selected_game === 'bilionar') && (
                        <div className={`panel-settings ${mobileTab === 'settings' ? 'mobile-active' : ''}`} style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 className="hide-mobile" style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Nastavenia {!isHost && <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'none' }}>(Upravuje hostiteľ)</span>}</h3>

                            {lobby.selected_game === 'quiz' && (
                                <div>
                                    <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Pravidlá hry</div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button disabled={!isHost} onClick={() => updateLobbySettings({ ...lobby.settings, rules: 'hex' })} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: gameRules === 'hex' ? '1px solid #38bdf8' : '1px solid transparent', background: gameRules === 'hex' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.05)', color: gameRules === 'hex' ? '#38bdf8' : '#64748b', cursor: isHost ? 'pointer' : 'default', fontWeight: 'bold' }}>Cesta (Hex)</button>
                                        <button disabled={!isHost} onClick={() => updateLobbySettings({ ...lobby.settings, rules: 'points' })} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: gameRules === 'points' ? '1px solid #f97316' : '1px solid transparent', background: gameRules === 'points' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(255,255,255,0.05)', color: gameRules === 'points' ? '#f97316' : '#64748b', cursor: isHost ? 'pointer' : 'default', fontWeight: 'bold' }}>Body (Rýchlosť)</button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Náročnosť otázok</div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {[{ l: 1, t: 'Ľahké', c: '#4ade80' }, { l: 2, t: 'Stredné', c: '#fbbf24' }, { l: 3, t: 'Ťažké', c: '#ef4444' }].map(d => {
                                        const isSel = difficulty.includes(d.l);
                                        return (
                                            <button key={d.l} disabled={!isHost} onClick={() => handleChangeDifficulty(d.l)} style={{ flex: 1, padding: '0.6rem', minWidth: '80px', borderRadius: '8px', border: isSel ? `1px solid ${d.c}` : '1px solid transparent', background: isSel ? `${d.c}15` : 'rgba(255,255,255,0.05)', color: isSel ? d.c : '#64748b', cursor: isHost ? 'pointer' : 'default', opacity: isHost || isSel ? 1 : 0.4 }}>
                                                {d.t}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                <div style={{ color: '#cbd5e1', fontSize: '0.75rem', marginBottom: '0.4rem', flexShrink: 0 }}>Kategórie</div>
                                <div className="categories-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto', alignContent: 'flex-start' }}>
                                    <button disabled={!isHost} onClick={() => updateLobbySettings({ ...lobby.settings, cat: [] })} style={{ padding: '0.3rem 0.6rem', borderRadius: '16px', fontSize: '0.75rem', border: selectedCategories.length === 0 ? '1px solid #38bdf8' : 'none', background: selectedCategories.length === 0 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)', color: selectedCategories.length === 0 ? '#38bdf8' : '#94a3b8', cursor: isHost ? 'pointer' : 'default', flexShrink: 0 }}>
                                        Všetky
                                    </button>
                                    {(lobby.selected_game === 'quiz' ? availableQuizCategories : availableBilionarCategories).map(c => {
                                        const isSel = selectedCategories.includes(c);
                                        return (
                                            <button key={c} disabled={!isHost} onClick={() => handleToggleCategory(c)} style={{ padding: '0.3rem 0.6rem', borderRadius: '16px', fontSize: '0.75rem', border: isSel ? '1px solid #38bdf8' : 'none', background: isSel ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.05)', color: isSel ? 'white' : '#64748b', cursor: isHost ? 'pointer' : 'default', flexShrink: 0 }}>
                                                {c}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* PRAVA STRANA: Hráči, Priatelia a Založenie */}
                <div className={`col-right ${['players', 'friends'].includes(mobileTab) ? 'mobile-active' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>

                    {/* Hráči list */}
                    <div className={`panel-players ${mobileTab === 'players' ? 'mobile-active' : ''}`} style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', padding: '1.5rem', flexShrink: 0 }}>
                        <div className="hide-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Hráči v miestnosti</h3>
                            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{members.length}/{gameInfo.max}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.8rem' }}>
                            {members.map((p, idx) => {
                                const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
                                return (
                                    <div key={p.user_id} style={{
                                        position: 'relative', background: 'rgba(0,0,0,0.3)', border: `1px solid ${color}40`, padding: '1rem 0.5rem', borderRadius: '12px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        {p.role === 'host' && (
                                            <span style={{ position: 'absolute', top: -8, background: '#facc15', color: '#000', fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '8px', fontWeight: 'bold' }}>HOST</span>
                                        )}
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${p.user_id}`} alt="avatar" style={{ width: '45px', height: '45px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90px' }}>Hráč {idx + 1}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.65rem' }}>{p.state}</div>
                                        </div>
                                        {isHost && user.id !== p.user_id && (
                                            <button onClick={() => handleRemovePlayer(p.user_id)} style={{ position: 'absolute', top: 4, right: 4, padding: '0', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                                        )}
                                    </div>
                                )
                            })}
                            {isHost && members.length < gameInfo.max && (
                                <div style={{ border: '1px dashed rgba(255,255,255,0.2)', padding: '1rem 0.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', minHeight: '100px' }}>
                                    <span style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>+</span>
                                    <span style={{ fontSize: '0.7rem', textAlign: 'center' }}>Voľné miesto</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Friends List (Iba Host) */}
                    {isHost && (
                        <div className={`panel-friends ${mobileTab === 'friends' ? 'mobile-active' : ''}`} style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <h3 className="hide-mobile" style={{ color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 1rem 0' }}>Pozvi Priateľov</h3>
                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                                <FriendsList onInvite={handleInvite} currentLobbyPlayers={members} onlineUserIds={onlineUserIds} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* SPUSTIT BTN (Spodna lista) */}
            {isHost && (
                <div style={{ flexShrink: 0, marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                        onClick={handleStartMatch}
                        disabled={members.length < 1 || countdown !== null}
                        style={{
                            width: '100%', padding: '1.2rem', fontSize: '1.4rem', fontWeight: 'bold', borderRadius: '16px', border: 'none',
                            background: members.length >= 1 ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.1)',
                            color: members.length >= 1 ? 'white' : 'rgba(255,255,255,0.3)',
                            boxShadow: members.length >= 1 ? '0 10px 25px rgba(59, 130, 246, 0.4)' : 'none',
                            cursor: members.length >= 1 ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            textTransform: 'uppercase', letterSpacing: '2px'
                        }}
                    >
                        SPUSTIŤ HRU
                    </button>
                </div>
            )}

            <style>{`
                .lobby-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                }
                .mobile-tabs {
                    display: none !important;
                }
                .games-grid {
                    flex-wrap: wrap;
                }
                .game-option {
                    flex: 1 1 auto;
                    min-width: 100px;
                }
                @media (max-width: 800px) {
                    .hide-mobile { display: none !important; }
                    .lobby-grid {
                        display: flex !important;
                        flex-direction: column;
                        overflow-y: auto !important;
                    }
                    .mobile-tabs {
                        display: flex !important;
                    }
                    .col-left, .col-right, .panel-games, .panel-settings, .panel-players, .panel-friends {
                        display: none !important;
                    }
                    .mobile-active {
                        display: flex !important;
                        height: max-content;
                    }
                    .categories-list {
                        max-height: none !important;
                        overflow-y: visible !important;
                    }
                    .games-grid {
                        flex-direction: column !important;
                        flex-wrap: nowrap !important;
                        overflow-x: hidden !important;
                    }
                    .game-option {
                        flex-direction: row !important;
                        text-align: center !important;
                        justify-content: center !important;
                        gap: 1.5rem !important;
                        padding: 1.2rem !important;
                    }
                    .game-icon {
                        font-size: 2.5rem !important;
                        margin-left: 0;
                    }
                    .game-name {
                        font-size: 1.2rem !important;
                    }
                }
            `}</style>
        </div>
    );
};
