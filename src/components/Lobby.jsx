import React from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FriendsList } from './auth/FriendsList';
import { useAudio } from '../hooks/useAudio';

export const Lobby = ({ onStart1vBot }) => {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = React.useState(null);
    const [gameRules, setGameRules] = React.useState('hex'); // 'hex' or 'points'
    const [category, setCategory] = React.useState('Všetky kategórie');
    const [difficulty, setDifficulty] = React.useState(1);
    const { playSound } = useAudio();

    const CATEGORIES = [
        "Všetky kategórie",
        "Aktuálne dianie", "Anatómia", "Biológia", "Botanika", "Chémia",
        "Cudzie jazyky", "Dejiny", "Filmy a seriály", "Fyzika", "Gastro",
        "Geografia", "Hry a hračky", "Hudba", "IT", "Literatúra",
        "Logika a hádanky", "Mytológia", "Móda", "Náboženstvo", "Politika",
        "Popkultúra a celebrity", "Ríša zvierat", "Slovenský jazyk",
        "Technológie", "Výtvarné umenie", "Šport"
    ];

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>Kategória Otázok</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'bold' }}>Náročnosť ({difficulty === 1 ? 'Ľahké' : difficulty === 2 ? 'Stredné' : 'Ťažké'})</label>
                            <input
                                type="range"
                                min="1"
                                max="3"
                                step="1"
                                value={difficulty}
                                onChange={(e) => setDifficulty(parseInt(e.target.value, 10))}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem' }}>
                                <span>1</span>
                                <span>2</span>
                                <span>3</span>
                            </div>
                        </div>
                    </div>

                    <div className="modal-actions" style={{ flexDirection: 'column', gap: '1rem' }}>
                        <button className="primary" onClick={() => onStart1vBot(gameRules, category, difficulty)}>
                            Hrať proti BOT-ovi
                        </button>
                        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Pre **Online Multiplayer** si vyhľadajte priateľa v paneli napravo a kliknite na "Vyzvať". Bude použitý zvolený mód vyššie.
                        </p>
                    </div>
                </div>

                <div className="lobby-panel friends-panel">
                    <h2>Priatelia a Hráči</h2>
                    <FriendsList selectedGameRules={gameRules} selectedCategory={category} selectedDifficulty={difficulty} />
                </div>
            </div>
        </div>
    );
};

