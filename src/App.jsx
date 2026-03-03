import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthTabs } from './components/auth/AuthTabs';
import { Lobby } from './components/Lobby';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { QuestionModal } from './components/QuestionModal';
import { GameInviteModal } from './components/GameInviteModal';
import { Matchmaking } from './components/Matchmaking';

import { supabase } from './lib/supabase';
import { Admin } from './components/Admin';
import { useAudio } from './hooks/useAudio';
import { useGameStore, APP_STATES } from './game-engine/store';
import { GamePortal } from './components/GamePortal';

// Custom Hooks pre logiku hry
import { useBlockNavigation } from './hooks/useBlockNavigation';
import { useGameInvites } from './hooks/useGameInvites';
import { useModalSync } from './hooks/useModalSync';
import { useBotTurn } from './hooks/useBotTurn';

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
const ABQuizApp = ({ onBackToPortal }) => {
  const { user } = useAuth();
  const {
    appState, setAppState,
    gameMode, setGameMode,
    gameRules, setGameRules,
    activeGameId, setActiveGameId,
    resetToLobby, addDebugLog
  } = useGameStore();

  const [activeModal, setActiveModal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [opponentName, setOpponentName] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // States pre lokálne spustenie
  const [localCategory, setLocalCategory] = useState([]); // Empty array means "All"
  const [localDifficulty, setLocalDifficulty] = useState(1);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [showVersus, setShowVersus] = useState(false);
  const manualExitRef = useRef(false);
  const prevActiveModalRef = useRef(null);
  const usedQuestionIdsRef = useRef(new Set());

  const { playSound } = useAudio();

  // Blokovanie navigácie späť počas aktívnej hry
  useBlockNavigation(appState === APP_STATES.IN_GAME, () => setShowExitConfirm(true));

  // Fetch current user profile
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('username, is_admin').eq('id', user.id).single()
        .then(({ data }) => setProfile(data));
    }
  }, [user]);

  // Pass necessary info down to the game engine
  const { board, currentPlayer, winner, claimHexagon, resetGame, localPlayerNum, p1Score, p2Score, p1Combo, p2Combo, gameData } = useGameState({
    userId: user?.id,
    gameMode,
    gameRules,
    activeGameId,
    manualExitRef
  });

  const getRandomQuestionForConfig = useCallback(async () => {
    let cats = Array.isArray(localCategory) ? localCategory : [];
    let diff = localDifficulty;

    if (gameMode === '1v1_online' && gameData) {
      try {
        const parsed = typeof gameData.category === 'string' ? JSON.parse(gameData.category) : gameData.category;
        cats = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        cats = [];
      }
      diff = gameData.difficulty || 1;
    }

    let query = supabase.from('questions').select('*');
    if (cats.length > 0) {
      // Pick *one* random category to query. This guarantees perfect randomization 
      // across checked categories rather than pulling sequentially sorted buckets.
      const randomCat = cats[Math.floor(Math.random() * cats.length)];
      query = query.eq('category', randomCat);
    }
    query = query.eq('difficulty', diff);

    if (usedQuestionIdsRef.current.size > 0) {
      query = query.not('id', 'in', `(${Array.from(usedQuestionIdsRef.current).join(',')})`);
    }

    const { data: pool, error } = await query.limit(100);

    if (error || !pool || pool.length === 0) {
      console.warn("No questions match config or all used! Falling back...");

      // Fallback 1: Just the categories without difficulty constraint
      let fallbackQuery = supabase.from('questions').select('*');
      if (cats.length > 0) {
        fallbackQuery = fallbackQuery.in('category', cats);
      }
      if (usedQuestionIdsRef.current.size > 0) {
        fallbackQuery = fallbackQuery.not('id', 'in', `(${Array.from(usedQuestionIdsRef.current).join(',')})`);
      }
      let { data: fallbackPool } = await fallbackQuery.limit(50);

      // Fallback 2: Any question at all from DB
      if (!fallbackPool || fallbackPool.length === 0) {
        let globalQuery = supabase.from('questions').select('*');
        if (usedQuestionIdsRef.current.size > 0) {
          globalQuery = globalQuery.not('id', 'in', `(${Array.from(usedQuestionIdsRef.current).join(',')})`);
        }
        const { data: globalFallback } = await globalQuery.limit(50);
        fallbackPool = globalFallback;
      }

      if (fallbackPool && fallbackPool.length > 0) {
        return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      }

      return { id: 1, question_text: "Otázky pre túto kombináciu sa nenašli...", answer: "Žiadna" };
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }, [localCategory, localDifficulty, gameMode, gameData]);

  const handleStartGame = useCallback((mode, rules = 'hex', gameId = null, cat = [], diff = 1) => {
    usedQuestionIdsRef.current.clear(); // Reset used questions each new game
    setGameMode(mode);
    setGameRules(rules);
    setActiveGameId(gameId);
    setLocalCategory(cat);
    setLocalDifficulty(diff);

    if (['1v1_quick', '1v1_private_create', '1v1_private_join'].includes(mode)) {
      setAppState(APP_STATES.MATCHMAKING);
      addDebugLog(`Matchmaking spustený (${mode})`);
      return;
    }

    setAppState(APP_STATES.IN_GAME);
    setShowVersus(true); // Trigger animation
    setTimeout(() => setShowVersus(false), 4800); // 4.8s to allow full epic fade out

    addDebugLog(`Hra začala (${mode} - ${rules})`);

    if (mode === '1v1_online' && gameId) {
      manualExitRef.current = false; // Reset exit flag on new game
      supabase.from('profiles').update({ online_status: 'playing' }).eq('id', user.id).then();
    } else {
      resetGame();
    }
  }, [user, resetGame, setGameMode, setGameRules, setActiveGameId, setAppState, addDebugLog]);

  // Resume active game if we have one
  useEffect(() => {
    if (user?.id && !activeGameId && !manualExitRef.current) {
      supabase.from('games').select('*')
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .eq('status', 'active')
        .single()
        .then(({ data }) => {
          if (data && !activeGameId && !manualExitRef.current) {
            handleStartGame('1v1_online', data.game_type || 'hex', data.id);
          }
        });
    }
  }, [user, activeGameId, handleStartGame]);

  // Logic extractions
  useGameInvites({ user, activeGameId, handleStartGame, setIncomingInvite });
  useBotTurn({ gameMode, currentPlayer, winner, activeModal, showExitConfirm, board, getRandomQuestionForConfig, setActiveModal });
  const { handleSyncModal } = useModalSync({
    gameMode, activeGameId, gameData, currentPlayer, localPlayerNum, playSound, activeModal, setActiveModal
  });

  // Fetch opponent name
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
    const { error } = await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
    if (!error) {
      setIncomingInvite(null);
      handleStartGame('1v1_online', rules, gameId);
    }
  };

  const handleDeclineInvite = async (gameId) => {
    manualExitRef.current = true;
    await supabase.from('games').delete().eq('id', gameId);
    setIncomingInvite(null);
  };

  const handleHexClick = async (hexId) => {
    // Okamžite zamerať globálny vstup, predtým než asynchrónna logika a stavové zmeny zablokujú focus (iOS restriction)
    const mobileInput = document.getElementById('global-mobile-input');
    if (mobileInput) {
      mobileInput.value = ''; // Vymaž všetky staré hodnoty
      mobileInput.focus();
    }

    if (gameMode === '1vbot' && currentPlayer === 2) return;
    if (gameMode === '1v1_online' && gameData?.paused_by) return;
    if (gameMode === '1v1_online' && currentPlayer !== localPlayerNum) {
      alert("Teraz je na ťahu súper!");
      return;
    }

    const hex = board.find(h => h.id === hexId);
    if (hex.owner === 'player1' || hex.owner === 'player2') return;

    const q = await getRandomQuestionForConfig();
    const newModal = { hexId, question: q, phase: 'reveal' };
    setActiveModal(newModal);

    if (gameMode === '1v1_online' && activeGameId) {
      addDebugLog(`Hexagon ${hexId} otvorený, beží online synchronizácia...`);
      await supabase.from('games').update({ active_modal: newModal }).eq('id', activeGameId);
    } else {
      addDebugLog(`Hexagon ${hexId} otvorený.`);
    }
  };

  const handleResolveQuestion = (targetOwner, pointsEarned = 0, breakCombo = false) => {
    if (activeModal) {
      claimHexagon(activeModal.hexId, targetOwner, pointsEarned, breakCombo);
      setActiveModal(null);
    }
  };

  useEffect(() => {
    if (winner) playSound('winner');
  }, [winner, playSound]);

  // Centralized "Click" sound when any modal opens (Local, Bot, or Online) + track used question
  useEffect(() => {
    if (activeModal && !prevActiveModalRef.current) {
      playSound('click');
    }
    if (activeModal?.question?.id) {
      usedQuestionIdsRef.current.add(activeModal.question.id);
    }
    prevActiveModalRef.current = activeModal;
  }, [activeModal, playSound]);

  const handleTogglePause = async () => {
    if (gameMode !== '1v1_online' || !activeGameId) return;
    const isCurrentlyPaused = !!gameData?.paused_by;
    if (isCurrentlyPaused && gameData.paused_by !== user.id) return;
    const newPausedBy = isCurrentlyPaused ? null : user.id;
    addDebugLog(isCurrentlyPaused ? "Hra odpauzovaná." : "Hra pozastavená.");
    await supabase.from('games').update({ paused_by: newPausedBy }).eq('id', activeGameId);
  };

  const handleRestart = async () => {
    if (activeGameId) {
      manualExitRef.current = true;
      // Use both status update AND delete for maximum cross-client reliability
      await supabase.from('games').update({ status: 'finished' }).eq('id', activeGameId);
      await supabase.from('games').delete().eq('id', activeGameId);
      supabase.from('profiles').update({ online_status: 'online' }).eq('id', user?.id).then();
    }
    resetToLobby();
    setShowExitConfirm(false);
    resetGame();
    addDebugLog("Hra ukončená (Odoslaný reset do Lobby)");
  };

  if (showAdmin && profile?.is_admin) {
    return <Admin onBack={() => setShowAdmin(false)} />;
  }

  if (appState === APP_STATES.HOME || appState === APP_STATES.LOBBY) {
    return (
      <>
        <Lobby
          onStart1vBot={(rules, cat, diff) => handleStartGame('1vbot', rules, null, cat, diff)}
          onStartMatchmaking={(mode, rules, cat, diff) => handleStartGame(mode, rules, null, cat, diff)}
          onShowAdmin={() => setShowAdmin(true)}
          onBackToPortal={onBackToPortal}
        />
        <GameInviteModal
          invite={incomingInvite}
          onAccept={(gameId) => handleAcceptInvite(gameId, incomingInvite?.gameRules)}
          onDecline={handleDeclineInvite}
        />
      </>
    );
  }

  if (appState === APP_STATES.MATCHMAKING) {
    return <Matchmaking
      user={user}
      gameRules={gameRules}
      categories={localCategory}
      difficulty={localDifficulty}
      onMatchFound={(gameId, rules, cat, diff) => handleStartGame('1v1_online', rules, gameId, cat, diff)}
    />;
  }

  if (appState === APP_STATES.IN_GAME) {
    return (
      <>
        {showVersus && (
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
        )}

        {showVersus && <audio src="/game-start.mp3" autoPlay ref={el => { if (el) el.volume = 0.15; }} />}

        <div className="game-container game-entrance">
          {gameMode === '1v1_online' && gameData?.paused_by && (
            <div className="versus-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>
              <div className="versus-content" style={{ flexDirection: 'column', gap: '2rem' }}>
                <h2 style={{ color: '#facc15', fontSize: '2.5rem' }}>HRA JE POZASTAVENÁ</h2>
                <p style={{ fontSize: '1.2rem', color: 'white', textAlign: 'center' }}>
                  {gameData.paused_by === user.id ? "Vy ste pozastavili hru." : "Súper pozastavil hru. Čaká sa..."}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  {gameData.paused_by === user.id && (
                    <button className="primary" onClick={handleTogglePause} style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}>
                      Pokračovať v hre
                    </button>
                  )}
                  <button className="neutral" onClick={() => setShowExitConfirm(true)} style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}>
                    Opustiť hru
                  </button>
                </div>
              </div>
            </div>
          )}

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

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {gameMode === '1v1_online' && !activeModal && !winner && (
                <button className="secondary" onClick={handleTogglePause}>Pauza</button>
              )}
              <button className="neutral" onClick={() => setShowExitConfirm(true)}>Opustiť Hru</button>
            </div>

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

          {/* 
            Globálny neviditeľný input, ktorý musí byť už vyrenderovaný v DOM strome.
            Tým pádom naň vieme zavolať .focus() počas "onClick" v hexagóne 
            a klávesnica nám stabilne ostane vysunutá, kým QuestionModal nevyčíta jeho hodnoty.
          */}
          <input
            id="global-mobile-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            style={{
              position: 'absolute',
              top: '-9999px',
              left: '-9999px',
              opacity: 0,
              width: '1px',
              height: '1px',
              color: 'transparent',
              caretColor: 'transparent',
              background: 'transparent',
              border: 'none',
              padding: 0,
              pointerEvents: 'none'
            }}
          />

          {activeModal && (
            <QuestionModal
              modalData={activeModal}
              hexId={activeModal.hexId}
              question={activeModal.question}
              currentPlayer={currentPlayer}
              gameMode={gameMode}
              gameRules={gameRules}
              p1Combo={p1Combo}
              p2Combo={p2Combo}
              onResolve={handleResolveQuestion}
              onClose={() => setActiveModal(null)}
              onSyncModal={handleSyncModal}
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

          <ConfirmExitModal isOpen={showExitConfirm} onConfirm={handleRestart} onCancel={() => setShowExitConfirm(false)} />
          <GameInviteModal invite={incomingInvite} onAccept={(gameId) => handleAcceptInvite(gameId, incomingInvite?.gameRules)} onDecline={handleDeclineInvite} />


        </div>
      </>
    );
  }

  return null;
};

const MainRouter = () => {
  const { user } = useAuth();
  const [currentApp, setCurrentApp] = useState('portal');

  // Load from session storage for smoother reloads
  useEffect(() => {
    const saved = sessionStorage.getItem('ab_quiz_current_app');
    if (saved) setCurrentApp(saved);
  }, []);

  const handleSetApp = (app) => {
    setCurrentApp(app);
    sessionStorage.setItem('ab_quiz_current_app', app);
  };

  if (!user) {
    return (
      <div className="game-container start-screen">
        <h1 className="logo-brutal" style={{ fontSize: '3.5rem', marginBottom: '2rem' }}>PORTÁL HIER</h1>
        <AuthTabs />
      </div>
    );
  }

  if (currentApp === 'portal') {
    return <GamePortal onSelectGame={handleSetApp} />;
  }

  if (currentApp === 'ab_quiz') {
    return <ABQuizApp onBackToPortal={() => handleSetApp('portal')} />;
  }

  return null;
};

function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
