import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthTabs } from './components/auth/AuthTabs';
import { Lobby } from './components/Lobby';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { QuestionModal } from './components/QuestionModal';
import { GameInviteModal } from './components/GameInviteModal';
import { supabase } from './lib/supabase';
import { useAudio } from './hooks/useAudio';

const ConfirmExitModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="modal-content glass-panel" style={{ textAlign: 'center', padding: '2.5rem', maxWidth: '450px' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Opustiť hru?</h2>
        <p style={{ fontSize: '1.1rem', margin: '0 0 2.5rem', color: '#cbd5e1', lineHeight: '1.6' }}>
          Ste si istý, že chcete ukončiť aktuálny súboj? <br />
          <strong>Váš postup bude stratený.</strong>
        </p>
        <div className="modal-actions" style={{ gap: '1rem' }}>
          <button className="danger" onClick={onConfirm} style={{ minWidth: '140px' }}>
            Áno, skončiť
          </button>
          <button className="primary" onClick={onCancel} style={{ minWidth: '140px' }}>
            Zostať v hre
          </button>
        </div>
      </div>
    </div>
  );
};

// Wrapper component to use the Auth context
const GameApp = () => {
  const { user } = useAuth();
  const [gameMode, setGameMode] = useState(null);
  const [gameRules, setGameRules] = useState('hex'); // 'hex' or 'points'
  const [activeGameId, setActiveGameId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [opponentName, setOpponentName] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [allQuestions, setAllQuestions] = useState([]);
  const [localCategory, setLocalCategory] = useState('Všetky kategórie');
  const [localDifficulty, setLocalDifficulty] = useState(1);
  const { playSound } = useAudio();

  useEffect(() => {
    fetch('/questions.json')
      .then(res => res.json())
      .then(data => setAllQuestions(data.data || []))
      .catch(err => console.error("Failed to load questions JSON", err));
  }, []);

  // Fetch current user profile
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('username').eq('id', user.id).single()
        .then(({ data }) => setProfile(data));
    }
  }, [user]);

  // Pass necessary info down to the game engine
  const { board, currentPlayer, winner, claimHexagon, resetGame, localPlayerNum, p1Score, p2Score, p1Combo, p2Combo, gameData } = useGameState({
    userId: user?.id,
    gameMode,
    gameRules,
    activeGameId
  });

  const [incomingInvite, setIncomingInvite] = useState(null);

  const getRandomQuestionForConfig = useCallback(() => {
    let cat = localCategory;
    let diff = localDifficulty;
    if (gameMode === '1v1_online' && gameData) {
      cat = gameData.category || 'Všetky kategórie';
      diff = gameData.difficulty || 1;
    }

    let pool = allQuestions;
    if (cat !== 'Všetky kategórie') {
      pool = pool.filter(q => q.category === cat);
    }
    pool = pool.filter(q => q.difficulty === diff);

    if (pool.length === 0) {
      console.warn("No questions match config! Falling back to any available question.");
      pool = allQuestions.length > 0 ? allQuestions : [{ id: 1, text: "Načítavam otázky...", answer: "..." }];
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }, [allQuestions, localCategory, localDifficulty, gameMode, gameData]);

  const handleStartGame = useCallback((mode, rules = 'hex', gameId = null, cat = 'Všetky kategórie', diff = 1) => {
    setGameMode(mode);
    setGameRules(rules);
    setActiveGameId(gameId);
    setLocalCategory(cat);
    setLocalDifficulty(diff);

    if (mode === '1v1_online' && gameId) {
      // Set status playing
      supabase.from('profiles').update({ online_status: 'playing' }).eq('id', user.id).then();
    } else {
      resetGame();
    }
  }, [user, resetGame, setGameMode, setActiveGameId]);

  // Listen for Online Game Invites
  useEffect(() => {
    if (!user) return;

    // Set status to online
    supabase.from('profiles').update({ online_status: 'online' }).eq('id', user.id).then();

    const subscription = supabase
      .channel('game_invites')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'games',
        filter: `player2_id=eq.${user.id}`
      }, async (payload) => {
        // If we are already in a game, probably should ignore. But we'll show it for now.
        if (payload.new.status === 'waiting') {
          // Fetch challenger name
          const { data } = await supabase.from('profiles').select('username').eq('id', payload.new.player1_id).single();
          setIncomingInvite({
            gameId: payload.new.id,
            gameRules: payload.new.game_type || 'hex',
            challengerName: data?.username || 'Neznámy Hráč'
          });
        }
      })
      // we also want to redirect if a game we created gets accepted
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `player1_id=eq.${user.id}`
      }, (payload) => {
        if (payload.new.status === 'active' && !activeGameId) {
          // Our invite was accepted!
          handleStartGame('1v1_online', payload.new.id);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      // Set offline
      if (user) supabase.from('profiles').update({ online_status: 'offline' }).eq('id', user.id).then();
    };
  }, [user, activeGameId, handleStartGame]);

  // Fetch opponent name when in online game
  useEffect(() => {
    if (gameMode === '1v1_online' && activeGameId) {
      const fetchOpponent = async () => {
        const { data: game } = await supabase.from('games').select('player1_id, player2_id').eq('id', activeGameId).single();
        if (game) {
          const opponentId = game.player1_id === user.id ? game.player2_id : game.player1_id;
          const { data: oppProfile } = await supabase.from('profiles').select('username').eq('id', opponentId).single();
          if (oppProfile) setOpponentName(oppProfile.username);
        }
      };
      fetchOpponent();
    } else {
      setOpponentName(null);
    }
  }, [gameMode, activeGameId, user?.id]);

  const handleAcceptInvite = async (gameId, rules) => {
    // Update game status to active
    const { error } = await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
    if (!error) {
      setIncomingInvite(null);
      handleStartGame('1v1_online', rules, gameId);
    }
  };

  const handleDeclineInvite = async (gameId) => {
    await supabase.from('games').delete().eq('id', gameId);
    setIncomingInvite(null);
  };

  const handleHexClick = (hexId) => {
    // If it's BOT's turn, ignore manual clicks
    if (gameMode === '1vbot' && currentPlayer === 2) return;

    // Online: if it's not your turn, ignore clicks
    if (gameMode === '1v1_online' && currentPlayer !== localPlayerNum) {
      alert("Teraz je na ťahu súper!");
      return;
    }

    const hex = board.find(h => h.id === hexId);
    if (hex.owner === 'player1' || hex.owner === 'player2') {
      return;
    }

    playSound('click');
    const q = getRandomQuestionForConfig();
    setActiveModal({ hexId, question: q });
  };

  // BOT Turn automation
  useEffect(() => {
    if (gameMode === '1vbot' && currentPlayer === 2 && !winner && !activeModal && !showExitConfirm) {
      // Pick a random available hex after a short delay
      const availableHexes = board.filter(h => h.owner !== 'player1' && h.owner !== 'player2');
      if (availableHexes.length > 0) {
        const timeout = setTimeout(() => {
          const randomHex = availableHexes[Math.floor(Math.random() * availableHexes.length)];
          const q = getRandomQuestionForConfig();
          setActiveModal({ hexId: randomHex.id, question: q });
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
  }, [currentPlayer, gameMode, board, winner, activeModal, showExitConfirm]);

  const handleResolveQuestion = (targetOwner, pointsEarned = 0, breakCombo = false) => {
    if (activeModal) {
      claimHexagon(activeModal.hexId, targetOwner, pointsEarned, breakCombo);
      setActiveModal(null);
    }
  };

  // Win condition sound
  useEffect(() => {
    if (winner) {
      playSound('winner');
    }
  }, [winner, playSound]);

  const handleRestart = async () => {
    if (activeGameId) {
      await supabase.from('games').update({ status: 'finished' }).eq('id', activeGameId);
      supabase.from('profiles').update({ online_status: 'online' }).eq('id', user?.id).then();
    }
    setGameMode(null);
    setActiveGameId(null);
    setShowExitConfirm(false);
    resetGame();
  };

  // Not logged in -> Show Auth screens
  if (!user) {
    return (
      <div className="game-container start-screen">
        <h1>AB Kvíz</h1>
        <AuthTabs />
      </div>
    );
  }

  // Logged in, no game mode selected -> Show Lobby
  if (!gameMode) {
    return (
      <>
        <Lobby
          onStart1vBot={(rules) => handleStartGame('1vbot', rules)}
        />
        <GameInviteModal
          invite={incomingInvite}
          onAccept={(gameId) => handleAcceptInvite(gameId, incomingInvite?.gameRules)}
          onDecline={handleDeclineInvite}
        />
      </>
    );
  }

  // Game is active
  return (
    <>
      {/* Versus Animation Overlay */}
      <div className="versus-overlay">
        <div className="versus-content">
          <div className="vs-player">
            <div className="vs-avatar player1-bg" style={{ color: 'var(--player1-color)' }}>1</div>
            <span style={{ fontWeight: 700 }}>
              {gameMode === '1v1_online'
                ? (localPlayerNum === 1 ? profile?.username || 'Vy' : opponentName || 'Súper')
                : profile?.username || 'Vy'
              }
            </span>
          </div>
          <div className="vs-text">VS</div>
          <div className="vs-player">
            <div className="vs-avatar player2-bg" style={{ color: 'var(--player2-color)' }}>2</div>
            <span style={{ fontWeight: 700 }}>
              {gameMode === '1vbot'
                ? 'BOT'
                : (gameMode === '1v1_online'
                  ? (localPlayerNum === 2 ? profile?.username || 'Vy' : opponentName || 'Súper')
                  : 'Hráč 2')
              }
            </span>
          </div>
        </div>
        <div className="vs-title">Bitka začína!</div>
      </div>

      {/* Game start sound plays when game begins. Placed outside of vs overlay to ensure it's not paused by any browser CSS optimizations */}
      <audio
        src="/game-start.mp3"
        autoPlay
        ref={el => { if (el) el.volume = 0.15; }}
      />

      <div className="game-container game-entrance">
        <h1 className="game-title">
          <span>{profile?.username || (localPlayerNum === 1 ? 'Vy' : 'Súper')}</span>
          <span className="vs">VS</span>
          <span>{gameMode === '1vbot' ? 'CPU' : (opponentName || (localPlayerNum === 2 ? 'Vy' : 'Súper'))}</span>
        </h1>

        {winner && (
          <div className="winner-banner">
            {winner === localPlayerNum
              ? `(Vy) ${profile?.username || 'Ja'} Vyhráva!`
              : `${opponentName || (gameMode === '1vbot' ? 'BOT' : 'Súper')} Vyhráva!`
            }
          </div>
        )}

        <div className="status-board">
          {/* Player 1: Dot on the left */}
          <div className={`player-status ${currentPlayer === 1 ? 'active' : ''}`}>
            <div className="dot player1-bg" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, paddingLeft: '4px' }}>
              <span className="player1-text" style={{ lineHeight: '1.2' }}>
                {gameMode === '1v1_online'
                  ? (localPlayerNum === 1 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                  : `(Vy) ${profile?.username || 'Ja'}`
                }
              </span>
              {gameRules === 'points' && (
                <span className="player1-text" style={{ fontSize: '0.85rem', opacity: 0.85, lineHeight: '1.2' }}>
                  {p1Score} bodov {p1Combo >= 5 ? '🔥 2x' : p1Combo >= 3 ? '🔥 1.5x' : ''}
                </span>
              )}
            </div>
          </div>

          <button className="neutral" onClick={() => setShowExitConfirm(true)}>Opustiť Hru</button>

          {/* Player 2: Dot on the right */}
          <div className={`player-status ${currentPlayer === 2 ? 'active' : ''}`}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0, paddingRight: '4px' }}>
              <span className="player2-text" style={{ lineHeight: '1.2' }}>
                {gameMode === '1vbot'
                  ? 'BOT'
                  : (gameMode === '1v1_online'
                    ? (localPlayerNum === 2 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                    : 'Hráč 2')
                }
              </span>
              {gameRules === 'points' && (
                <span className="player2-text" style={{ fontSize: '0.85rem', opacity: 0.85, lineHeight: '1.2' }}>
                  {p2Score} bodov {p2Combo >= 5 ? '🔥 2x' : p2Combo >= 3 ? '🔥 1.5x' : ''}
                </span>
              )}
            </div>
            <div className="dot player2-bg" />
          </div>
        </div>

        <GameBoard board={board} onHexClick={handleHexClick} />

        {activeModal && (
          <QuestionModal
            hexId={activeModal.hexId}
            question={activeModal.question}
            currentPlayer={currentPlayer}
            gameMode={gameMode}
            gameRules={gameRules}
            p1Combo={p1Combo}
            p2Combo={p2Combo}
            onResolve={handleResolveQuestion}
            onClose={() => setActiveModal(null)}
            localPlayerNum={localPlayerNum}
            playerNames={{
              player1: gameMode === '1v1_online'
                ? (localPlayerNum === 1 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                : `(Vy) ${profile?.username || 'Ja'}`,
              player2: gameMode === '1vbot'
                ? 'BOT'
                : (gameMode === '1v1_online'
                  ? (localPlayerNum === 2 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                  : 'Hráč 2')
            }}
          />
        )}

        <ConfirmExitModal
          isOpen={showExitConfirm}
          onConfirm={handleRestart}
          onCancel={() => setShowExitConfirm(false)}
        />

        <GameInviteModal
          invite={incomingInvite}
          onAccept={(gameId) => handleAcceptInvite(gameId, incomingInvite?.gameRules)}
          onDecline={handleDeclineInvite}
        />
      </div>
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <GameApp />
    </AuthProvider>
  );
}

export default App;
