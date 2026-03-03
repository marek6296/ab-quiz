import React from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FriendsList } from './auth/FriendsList';
import { useAudio } from '../hooks/useAudio';

export const Lobby = ({ onStart1vBot, onShowAdmin }) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = React.useState(null);
    const [gameRules, setGameRules] = React.useState('hex'); // 'hex' or 'points'
    const [availableCategories, setAvailableCategories] = React.useState([]);
    const [selectedCategories, setSelectedCategories] = React.useState([]); // empty means All
    const [difficulty, setDifficulty] = React.useState(1);
    const { playSound } = useAudio();

    React.useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('questions').select('category', { count: 'exact' });
            if (data) {
                const unique = [...new Set(data.map(q => q.category))].sort();
                setAvailableCategories(unique);
            }
        };
        fetchCategories();
    }, []);

    const toggleCategory = (cat) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const isAllSelected = selectedCategories.length === 0;

    const audioRef = React.useRef(null);

    React.useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = 0.006; // Set volume to 0.6% (reduced by 60% from 0.015)

            // Handle modern browser autoplay policies
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    // Auto-play was prevented by the browser. 
                    // Wait for the first click anywhere on the page to start music.
                    const playOnInteraction = () => {
                        audio.play();
                        document.removeEventListener('click', playOnInteraction);
                    };
                    document.addEventListener('click', playOnInteraction);
                });
            }
        }
    }, []);

    React.useEffect(() => {
        if (user?.id) {
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => setProfile(data));
        }
    }, [user]);

    return (
        <div className="game-container start-screen lobby">
            {/* Background Music Loop */}
            <audio ref={audioRef} src="/chrono-echoes.mp3" autoPlay loop />

            <div className="lobby-header">
                <h1>AB Kvíz</h1>
                <div className="user-info">
                    {profile?.is_admin && (
                        <button className="secondary" onClick={onShowAdmin} style={{ marginRight: '1rem', background: '#38bdf8', color: '#0f172a' }}>
                            Administrácia
                        </button>
                    )}
                    <span>Prihlásený ako: <strong>{profile?.username || user?.email}</strong></span>
                    <button className="text-button" onClick={() => signOut()}>Odhlásiť sa</button>
                </div>
            </div>

            <div className="lobby-content">
                <div className="lobby-panel">
                    <h2>Herné Módy</h2>

                    {/* Game Rules Selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '12px' }}>
                        <button
                            className={`secondary ${gameRules === 'hex' ? 'active' : ''}`}
                            style={{ flex: 1, margin: 0, opacity: gameRules === 'hex' ? 1 : 0.5, border: gameRules === 'hex' ? '1px solid var(--player1-color)' : 'none' }}
                            onClick={() => setGameRules('hex')}
                        >
                            Hex (Cesta)
                        </button>
                        <button
                            className={`secondary ${gameRules === 'points' ? 'active' : ''}`}
                            style={{ flex: 1, margin: 0, opacity: gameRules === 'points' ? 1 : 0.5, border: gameRules === 'points' ? '1px solid var(--player2-color)' : 'none' }}
                            onClick={() => setGameRules('points')}
                        >
                            Body (Rýchlosť)
                        </button>
                    </div>

                    {/* Category & Difficulty Selectors */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '1rem', fontWeight: 'bold' }}>Kategórie Otázok</label>

                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.6rem',
                                maxHeight: '220px',
                                overflowY: 'auto',
                                paddingRight: '0.5rem',
                                alignContent: 'flex-start'
                            }}>
                                <button
                                    onClick={(e) => { e.preventDefault(); setSelectedCategories([]); }}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        fontSize: '0.85rem',
                                        fontWeight: isAllSelected ? 'bold' : 'normal',
                                        background: isAllSelected ? 'var(--player1-color)' : 'rgba(255,255,255,0.05)',
                                        color: isAllSelected ? '#0f172a' : '#cbd5e1',
                                        border: `1px solid ${isAllSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        margin: 0
                                    }}
                                >
                                    ✨ Všetky kategórie
                                </button>
                                {availableCategories.map(c => {
                                    const isSelected = selectedCategories.includes(c);
                                    return (
                                        <button
                                            key={c}
                                            onClick={(e) => { e.preventDefault(); toggleCategory(c); }}
                                            style={{
                                                padding: '0.4rem 0.8rem',
                                                borderRadius: '20px',
                                                fontSize: '0.85rem',
                                                background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                                                color: isSelected ? '#38bdf8' : '#94a3b8',
                                                border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                margin: 0
                                            }}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '1rem', fontWeight: 'bold' }}>Náročnosť</label>
                            <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: '12px' }}>
                                {[
                                    { level: 1, label: 'Ľahké', color: '#4ade80' },
                                    { level: 2, label: 'Stredné', color: '#fbbf24' },
                                    { level: 3, label: 'Ťažké', color: '#ef4444' }
                                ].map(diff => (
                                    <button
                                        key={diff.level}
                                        onClick={(e) => { e.preventDefault(); setDifficulty(diff.level); }}
                                        style={{
                                            flex: 1,
                                            margin: 0,
                                            padding: '0.6rem 0',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            background: difficulty === diff.level ? diff.color : 'transparent',
                                            color: difficulty === diff.level ? '#0f172a' : '#cbd5e1',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {diff.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="modal-actions" style={{ flexDirection: 'column', gap: '1rem' }}>
                        <button className="primary" onClick={() => onStart1vBot(gameRules, selectedCategories, difficulty)}>
                            Hrať proti BOT-ovi
                        </button>
                        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Pre **Online Multiplayer** si vyhľadajte priateľa v paneli napravo a kliknite na "Vyzvať". Bude použitý zvolený mód vyššie.
                        </p>
                    </div>
                </div>

                <div className="lobby-panel friends-panel">
                    <h2>Priatelia a Hráči</h2>
                    <FriendsList selectedGameRules={gameRules} selectedCategory={selectedCategories} selectedDifficulty={difficulty} />
                </div>
            </div>
        </div>
    );
};

