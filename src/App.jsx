import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthTabs } from './components/auth/AuthTabs';
import { Lobby } from './components/Lobby';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { QuestionModal } from './components/QuestionModal';
import { getRandomQuestion } from './data/questions';
import { GameInviteModal } from './components/GameInviteModal';
import { supabase } from './lib/supabase';

// Wrapper component to use the Auth context
const GameApp = () => {
  const { user } = useAuth();
  const [gameMode, setGameMode] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [opponentName, setOpponentName] = useState(null);

  // Fetch current user profile
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('username').eq('id', user.id).single()
        .then(({ data }) => setProfile(data));
    }
  }, [user]);

  // Pass necessary info down to the game engine
  const { board, currentPlayer, winner, claimHexagon, resetGame, localPlayerNum } = useGameState({
    userId: user?.id,
    gameMode,
    activeGameId
  });

  const [incomingInvite, setIncomingInvite] = useState(null);

  const handleStartGame = useCallback((mode, gameId = null) => {
    setGameMode(mode);
    setActiveGameId(gameId);

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
  }, [gameMode, activeGameId, user.id]);

  const handleAcceptInvite = async (gameId) => {
    // Update game status to active
    const { error } = await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
    if (!error) {
      setIncomingInvite(null);
      handleStartGame('1v1_online', gameId);
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

    const q = getRandomQuestion();
    setActiveModal({ hexId, question: q });
  };

  // BOT Turn automation
  useEffect(() => {
    if (gameMode === '1vbot' && currentPlayer === 2 && !winner && !activeModal) {
      // Pick a random available hex after a short delay
      const availableHexes = board.filter(h => h.owner !== 'player1' && h.owner !== 'player2');
      if (availableHexes.length > 0) {
        const timeout = setTimeout(() => {
          const randomHex = availableHexes[Math.floor(Math.random() * availableHexes.length)];
          const q = getRandomQuestion();
          setActiveModal({ hexId: randomHex.id, question: q });
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
  }, [currentPlayer, gameMode, board, winner, activeModal]);

  const handleResolveQuestion = (targetOwner) => {
    if (activeModal) {
      claimHexagon(activeModal.hexId, targetOwner);
      setActiveModal(null);
    }
  };

  const handleRestart = async () => {
    if (activeGameId) {
      await supabase.from('games').update({ status: 'finished' }).eq('id', activeGameId);
      supabase.from('profiles').update({ online_status: 'online' }).eq('id', user?.id).then();
    }
    setGameMode(null);
    setActiveGameId(null);
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
          onStart1vBot={() => handleStartGame('1vbot')}
          onStartOnline={() => { }} // We trigger online by clicking "Vyzvat" now
        />
        <GameInviteModal
          invite={incomingInvite}
          onAccept={handleAcceptInvite}
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

      <div className="game-container game-entrance">
        <h1>{gameMode === '1vbot' ? '1vBOT Tréning' : 'AB Kvíz (Online)'}</h1>

        {winner && (
          <div className="winner-banner">
            {winner === localPlayerNum
              ? `(Vy) ${profile?.username || 'Ja'} Vyhráva!`
              : `${opponentName || (gameMode === '1vbot' ? 'BOT' : 'Súper')} Vyhráva!`
            }
          </div>
        )}

        <div className="status-board">
          <div className={`player-status ${currentPlayer === 1 ? 'active' : ''}`}>
            <span className="player1-text">
              {gameMode === '1v1_online'
                ? (localPlayerNum === 1 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                : `(Vy) ${profile?.username || 'Ja'}`
              }
            </span>
            <div className="dot player1-bg" />
          </div>

          <button className="neutral" onClick={handleRestart}>Opustiť Hru</button>

          <div className={`player-status ${currentPlayer === 2 ? 'active' : ''}`}>
            <span className="player2-text">
              {gameMode === '1vbot'
                ? 'BOT'
                : (gameMode === '1v1_online'
                  ? (localPlayerNum === 2 ? `(Vy) ${profile?.username || 'Ja'}` : (opponentName || 'Súper'))
                  : 'Hráč 2')
              }
            </span>
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

        <GameInviteModal
          invite={incomingInvite}
          onAccept={handleAcceptInvite}
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
