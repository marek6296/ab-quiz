import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FriendsList } from './auth/FriendsList';

export const Lobby = ({ onStart1vBot, onStartMatchmaking, onShowAdmin, onBackToPortal }) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = useState(null);
    const [activeTab, setActiveTab] = useState('play'); // play, friends, profile

    // Game Setup State
    const [setupMode, setSetupMode] = useState(null); // null means showing Mode selection
    const [gameRules, setGameRules] = useState('hex');
    const [availableCategories, setAvailableCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [difficulty, setDifficulty] = useState(1);

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('questions').select('category', { count: 'exact' });
            if (data) {
                const unique = [...new Set(data.map(q => q.category))].sort();
                setAvailableCategories(unique);
            }
        };
        fetchCategories();
    }, []);

    useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    const handleStartFromSetup = () => {
        if (setupMode === '1vbot') {
            onStart1vBot(gameRules, selectedCategories, difficulty);
        } else {
            onStartMatchmaking(setupMode, gameRules, selectedCategories, difficulty);
        }
    };

    const toggleCategory = (cat) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const isAllSelected = selectedCategories.length === 0;

    return (
        <div className="dashboard-layout">
            <aside className="dashboard-sidebar">
                <div className="sidebar-logo">
                    <h1 className="logo-brutal">
                        AB Kvíz
                    </h1>
                </div>

                <nav className="sidebar-nav">
                    <button className={`nav-item ${activeTab === 'play' ? 'active' : ''}`} onClick={() => { setActiveTab('play'); setSetupMode(null); }}>
                        <span style={{ fontSize: '1.5rem' }}>🎮</span> Hrať
                    </button>
                    <button className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>
                        <span style={{ fontSize: '1.5rem' }}>👥</span> Priatelia
                    </button>
                    <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                        <span style={{ fontSize: '1.5rem' }}>👤</span> Profil
                    </button>
                    {profile?.is_admin && (
                        <button className="nav-item" onClick={onShowAdmin} style={{ color: '#f8fafc', fontWeight: 'bold' }}>
                            <span style={{ fontSize: '1.5rem' }}>🛠️</span> Administrácia
                        </button>
                    )}
                </nav>

                <div style={{ marginTop: 'auto', marginBottom: '1rem' }}>
                    <button className="nav-item" onClick={onBackToPortal} style={{ width: '100%', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <span style={{ fontSize: '1.5rem' }}>⬅️</span> Zmeniť hru
                    </button>
                </div>

                <div className="user-profile" style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 'bold', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{profile?.username || 'Hráč'}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Online</div>
                    </div>
                </div>
            </aside>

            <main className="dashboard-content">
                <div className="mobile-only-logo">
                    <h1 className="logo-brutal">AB Kvíz</h1>
                </div>

                {activeTab === 'play' && !setupMode && (
                    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#f8fafc' }}>Vyberte si herný režim</h2>
                        <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem' }}>Vyberte si, ako a proti komu chcete hrať.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                            <div className="mode-card primary" onClick={() => setSetupMode('1v1_quick')}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
                                <h3>Rýchla Hra</h3>
                                <p>Náhodne ťa prepojíme s iným aktívnym hráčom, ktorý práve čaká na zápas.</p>
                                <span style={{ color: '#38bdf8', fontWeight: 'bold', marginTop: 'auto' }}>Hrať okamžite →</span>
                            </div>

                            <div className="mode-card" onClick={() => setSetupMode('1v1_private_create')}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                                <h3>Založiť Miestnosť</h3>
                                <p>Vytvor privátnu hru s vlastnými pravidlami a pošli kód kamošovi.</p>
                                <span style={{ color: '#cbd5e1', fontWeight: 'bold', marginTop: 'auto' }}>Vytvoriť →</span>
                            </div>

                            <div className="mode-card" onClick={() => setSetupMode('1v1_private_join')}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔑</div>
                                <h3>Pripojiť sa</h3>
                                <p>Máš kód od kamaráta? Zadaj ho do vyhľadávača a prepoj sa na neho.</p>
                                <span style={{ color: '#cbd5e1', fontWeight: 'bold', marginTop: 'auto' }}>Zadať kód →</span>
                            </div>

                            <div className="mode-card" onClick={() => setSetupMode('1vbot')}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
                                <h3>Tréning s BOTom</h3>
                                <p>Hraj proti nášmu inteligentnému robotovi na offline tréning.</p>
                                <span style={{ color: '#cbd5e1', fontWeight: 'bold', marginTop: 'auto' }}>Trénovať →</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'play' && setupMode && (
                    <div className="setup-panel">
                        <button onClick={() => setSetupMode(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>←</span> Späť na výber
                        </button>

                        <h2 style={{ fontSize: '2rem', marginBottom: '2rem', color: '#f8fafc' }}>Konfigurácia Hry</h2>

                        {setupMode !== '1v1_private_join' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Rules Selection */}
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontWeight: 'bold', marginBottom: '1rem' }}>Herné Pravidlá</label>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button className={`secondary ${gameRules === 'hex' ? 'active' : ''}`} style={{ flex: 1, padding: '1rem', opacity: gameRules === 'hex' ? 1 : 0.4, border: gameRules === 'hex' ? '1px solid #38bdf8' : 'none' }} onClick={() => setGameRules('hex')}>
                                            Hex (Cesta)
                                        </button>
                                        <button className={`secondary ${gameRules === 'points' ? 'active' : ''}`} style={{ flex: 1, padding: '1rem', opacity: gameRules === 'points' ? 1 : 0.4, border: gameRules === 'points' ? '1px solid #f97316' : 'none' }} onClick={() => setGameRules('points')}>
                                            Body (Rýchlosť)
                                        </button>
                                    </div>
                                </div>

                                {/* Difficulty Selection */}
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontWeight: 'bold', marginBottom: '1rem' }}>Náročnosť Otázok</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '12px' }}>
                                        {[
                                            { level: 1, label: 'Ľahké', color: '#4ade80' },
                                            { level: 2, label: 'Stredné', color: '#fbbf24' },
                                            { level: 3, label: 'Ťažké', color: '#ef4444' }
                                        ].map(diff => (
                                            <button key={diff.level} onClick={() => setDifficulty(diff.level)} style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', fontWeight: 'bold', background: difficulty === diff.level ? diff.color : 'transparent', color: difficulty === diff.level ? '#0f172a' : '#cbd5e1', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                {diff.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Category Selection */}
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', fontWeight: 'bold', marginBottom: '1rem' }}>Kategórie</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        <button onClick={() => setSelectedCategories([])} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: isAllSelected ? 'bold' : 'normal', background: isAllSelected ? '#38bdf8' : 'rgba(255,255,255,0.05)', color: isAllSelected ? '#0f172a' : '#cbd5e1', border: `1px solid ${isAllSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                                            ✨ Všetky
                                        </button>
                                        {availableCategories.map(c => {
                                            const isSelected = selectedCategories.includes(c);
                                            return (
                                                <button key={c} onClick={() => toggleCategory(c)} style={{ padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.9rem', background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)', color: isSelected ? '#38bdf8' : '#94a3b8', border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                                                    {c}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button className="primary" style={{ padding: '1.25rem', fontSize: '1.2rem', marginTop: '1rem' }} onClick={handleStartFromSetup}>
                                    Potvrdiť a Spustiť 🚀
                                </button>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Pre pripojenie k existujúcej miestnosti pokračujte tlačidlom nižšie, ktoré vám otvorí panel na zadanie kódu miestnosti.</p>
                                <button className="primary" style={{ padding: '1.25rem', fontSize: '1.2rem', width: '100%' }} onClick={handleStartFromSetup}>
                                    Prejsť na zadávanie Kódu 🔑
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'friends' && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '2.5rem', color: '#f8fafc', margin: 0 }}>Social a Priatelia</h2>
                        </div>
                        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '20px', padding: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Vďaka tomuto panelu môžeš vyhľadávať iných hráčov, pridávať si ich a rovno ich vyzývať do napínavých duelov.</p>
                            <FriendsList selectedGameRules={gameRules} selectedCategory={selectedCategories} selectedDifficulty={difficulty} />
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                        <h2 style={{ fontSize: '2.5rem', color: '#f8fafc', marginBottom: '2rem' }}>Môj Profil</h2>
                        <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '20px', padding: '3rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: '100px', height: '100px', background: 'var(--primary-gradient)', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                                👤
                            </div>
                            <h3 style={{ fontSize: '1.8rem', color: '#f8fafc', marginBottom: '0.5rem' }}>{profile?.username}</h3>
                            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>{user?.email}</p>

                            <hr style={{ borderColor: 'rgba(255,255,255,0.1)', marginBottom: '2rem' }} />

                            <button className="neutral" onClick={() => signOut()} style={{ padding: '1rem 2rem', border: '1px solid #ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                                Odhlásiť sa zo systému
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
