import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const BilionarGame = ({ activeGame, onLeave }) => {
    const { user } = useAuth();
    const [players, setPlayers] = useState([]);

    // Mock game state for UI development
    const [timeLeft, setTimeLeft] = useState(15);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showCorrect, setShowCorrect] = useState(false);
    const [mockQuestion, setMockQuestion] = useState({
        text: "Ktorá planéta v slnečnej sústave je známa ako červená planéta?",
        options: {
            A: "Venuša",
            B: "Mars",
            C: "Jupiter",
            D: "Saturn"
        },
        correct: "B"
    });

    // Realtime players fetch
    useEffect(() => {
        const fetchPlayers = async () => {
            const { data } = await supabase.from('bilionar_players').select('*').eq('game_id', activeGame.id).order('joined_at', { ascending: true });
            if (data) setPlayers(data);
        };
        fetchPlayers();

        const channel = supabase.channel(`bilionar_game_${activeGame.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bilionar_players', filter: `game_id=eq.${activeGame.id}` }, () => {
                fetchPlayers();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeGame]);

    // Mock Timer Logic for preview
    useEffect(() => {
        if (timeLeft > 0 && !showCorrect) {
            const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timerId);
        } else if (timeLeft === 0 && !showCorrect) {
            setShowCorrect(true);
        }
    }, [timeLeft, showCorrect]);

    const handleSelectOption = (key) => {
        if (selectedAnswer || showCorrect) return; // Prevent multiple selections or selecting after time is up
        setSelectedAnswer(key);
    };

    const renderPlayerAvatar = (p) => {
        const isMe = p.user_id === user.id;
        return (
            <div key={p.id} className={`bilionar-player-avatar ${isMe ? 'is-me' : ''}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                width: '60px'
            }}>
                <div style={{
                    position: 'relative', width: '45px', height: '45px', borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)', border: `2px solid ${isMe ? '#facc15' : 'rgba(250, 204, 21, 0.4)'}`,
                    overflow: 'hidden', boxShadow: isMe ? '0 0 10px rgba(250, 204, 21, 0.6)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {p.avatar_url ? (
                        <img src={p.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                    ) : null}
                    <div style={{ display: p.avatar_url ? 'none' : 'block', fontSize: '20px' }}>👤</div>

                    {/* Score Badge Overlay */}
                    <div style={{
                        position: 'absolute', bottom: '-4px', right: '-4px', background: '#0f172a',
                        border: '1px solid #facc15', color: '#facc15', fontSize: '10px',
                        fontWeight: 'bold', padding: '1px 4px', borderRadius: '8px'
                    }}>
                        {p.score}
                    </div>
                </div>
                <span style={{ fontSize: '10px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontWeight: isMe ? 'bold' : 'normal' }}>
                    {p.player_name?.split(' ')[0]}
                </span>
            </div>
        );
    };

    return (
        <div className="bilionar-board">

            {/* TOP BAR: Players and Scores */}
            <div className="bilionar-top-bar">
                {players.map(renderPlayerAvatar)}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="bilionar-main-content">

                {/* Timer Area */}
                <div className="bilionar-timer-wrapper">
                    <div className="bilionar-timer-circle" style={{
                        background: `conic-gradient(#ef4444 ${(timeLeft / 15) * 360}deg, transparent 0deg)`
                    }}>
                        <div className="bilionar-timer-inner">
                            {timeLeft}
                        </div>
                    </div>
                </div>

                {/* Question Area */}
                <div className="bilionar-question-container">
                    <div className="bilionar-question-box">
                        <span className="question-number">Otázka 1/10</span>
                        <h2>{mockQuestion.text}</h2>
                    </div>
                </div>

                {/* Options Area */}
                <div className="bilionar-options-grid">
                    {Object.entries(mockQuestion.options).map(([key, value]) => {
                        let statusClass = '';
                        if (selectedAnswer === key) statusClass = 'selected';
                        if (showCorrect) {
                            if (key === mockQuestion.correct) statusClass = 'correct';
                            else if (selectedAnswer === key) statusClass = 'wrong';
                        }

                        return (
                            <button
                                key={key}
                                className={`bilionar-option-btn ${statusClass}`}
                                onClick={() => handleSelectOption(key)}
                                disabled={selectedAnswer !== null || showCorrect}
                            >
                                <div className="option-letter">{key}:</div>
                                <div className="option-text">{value}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                <button className="danger" onClick={onLeave} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Leave (Dev)</button>
            </div>
        </div>
    );
};
