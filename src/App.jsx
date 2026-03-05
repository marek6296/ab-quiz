import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthTabs } from './components/auth/AuthTabs';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { Lobby } from './components/Lobby';
import { Matchmaking } from './components/Matchmaking';
import { QuestionModal } from './components/QuestionModal';
import { GameInviteModal } from './components/GameInviteModal';

import { supabase } from './lib/supabase';
import { Admin } from './components/Admin';
import { useAudio } from './hooks/useAudio';
import { useGameStore, APP_STATES } from './game-engine/store';
import { GamePortal } from './components/GamePortal';
import { PlatformLobby } from './platform/PlatformLobby';
import { BilionarApp } from './bilionar/BilionarApp';
import { HigherLowerApp } from './higher-lower/HigherLowerApp';
import { PlatformSessionProvider, usePlatformSession } from './context/PlatformSessionContext';

// Custom Hooks pre logiku hry
import { useBlockNavigation } from './hooks/useBlockNavigation';
import { useGameInvites } from './hooks/useGameInvites';
import { useModalSync } from './hooks/useModalSync';
import { useBotTurn } from './hooks/useBotTurn';
import { generateInitialBoard } from './game-engine/board';

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

const ReconnectModal = ({ activeModal, activeGameId, presenceCount, user, onCancel }) => {
  const [timeLeft, setTimeLeft] = useState(10);
  const isBothHere = presenceCount >= 2;
  const isReady = activeModal?.ready?.includes(user?.id);

  useEffect(() => {
    if (isBothHere) {
      const t = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(t);
            onCancel();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(t);
    } else {
      setTimeLeft(10);
    }
  }, [isBothHere, onCancel]);

  const handleReady = async () => {
    if (isReady) return;
    const newReady = [...(activeModal?.ready || []), user?.id];
    if (newReady.length >= 2) {
      await supabase.from('games').update({ active_modal: null }).eq('id', activeGameId);
    } else {
      await supabase.from('games').update({ active_modal: { ...activeModal, ready: newReady } }).eq('id', activeGameId);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10002 }}>
      <div className="modal-content glass-panel" style={{ textAlign: 'center', padding: '2.5rem', maxWidth: '450px' }}>
        <h2 style={{ color: isBothHere ? '#4ade80' : '#facc15', marginBottom: '1rem', fontSize: '1.8rem' }}>
          {isBothHere ? "Obaja hráči sú späť!" : "Súper sa odpojil..."}
        </h2>
        <p style={{ fontSize: '1.1rem', margin: '0 0 2rem', color: '#cbd5e1', lineHeight: '1.6' }}>
          {isBothHere
            ? "Máte obmedzený čas na potvrdenie pokračovania v hre."
            : "Čakáme na návrat súpera do hry. Hra je zatiaľ pozastavená."}
        </p>

        {isBothHere && (
          <>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', margin: '1rem 0', color: '#4ade80', textShadow: '0 0 10px rgba(74,222,128,0.5)' }}>
              {timeLeft}s
            </div>
            <button
              className={isReady ? 'neutral' : 'primary'}
              onClick={handleReady}
              disabled={isReady}
              style={{ minWidth: '200px', fontSize: '1.2rem', padding: '1rem 2rem' }}
            >
              {isReady ? 'Čakám na súpera...' : 'Pripravený na hru'}
            </button>
          </>
        )}

        {!isBothHere && (
          <button className="danger" onClick={onCancel} style={{ marginTop: '2rem' }}>
            Zrušiť hru a odísť
          </button>
        )}
      </div>
    </div>
  );
};

const DisconnectedModal = ({ reason, onBackToLobby }) => {
  if (!reason) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 10003 }}>
      <div className="modal-content glass-panel" style={{ textAlign: 'center', padding: '3rem', maxWidth: '450px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🔌</div>
        <h2 style={{ color: '#facc15', marginBottom: '1rem', fontSize: '2rem' }}>Spojenie stratené</h2>
        <p style={{ fontSize: '1.2rem', margin: '0 0 2.5rem', color: '#cbd5e1', lineHeight: '1.6' }}>
          {reason === "Súper opustil hru."
            ? "Váš súper sa rozhodol hru predčasne ukončiť a opustiť zápas."
            : "Hra bola ukončená druhým hráčom. Možno stratil spojenie alebo zavrel okno."}
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={onBackToLobby} style={{ width: '100%', padding: '1.2rem' }}>
            Späť do Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

const TurnAnnouncement = ({ announcement }) => {
  if (!announcement) return null;
  const { text, color } = announcement;

  return (
    <div className="turn-announcement-overlay">
      <div className="turn-announcement-content" style={{ '--turn-color': color }}>
        <div className="turn-announcement-glow" style={{ background: color }} />
        <h2 className="turn-announcement-text">{text}</h2>
      </div>
    </div>
  );
};

// Wrapper component to use the Auth context
const ABQuizApp = ({ onBackToPortal, onTerminateLobby, initialPendingGame, onClearPending, onlineUserIds }) => {
  const { user } = useAuth();
  const { match, myMatchState, isHost, members, leaveGame } = usePlatformSession();
  const {
    appState, setAppState,
    gameMode, setGameMode,
    gameRules, setGameRules,
    activeGameId, setActiveGameId,
    resetToLobby, addDebugLog
  } = useGameStore();

  const [activeModal, setActiveModal] = useState(() => {
    if (gameMode !== '1v1_online') {
      try {
        const saved = localStorage.getItem('ab_quiz_local_modal');
        if (saved) return JSON.parse(saved);
      } catch (e) { }
    }
    return null;
  });

  useEffect(() => {
    if (gameMode !== '1v1_online') {
      if (activeModal && activeModal.type !== 'reconnect_wait') {
        localStorage.setItem('ab_quiz_local_modal', JSON.stringify(activeModal));
      } else {
        localStorage.removeItem('ab_quiz_local_modal');
      }
    }
  }, [activeModal, gameMode]);
  const [profile, setProfile] = useState(null);
  const [opponentName, setOpponentName] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showAdmin, setShowAdmin] = useState(() => localStorage.getItem('ab_quiz_show_admin') === 'true');

  useEffect(() => {
    localStorage.setItem('ab_quiz_show_admin', showAdmin);
  }, [showAdmin]);

  // States pre lokálne spustenie
  const [localCategory, setLocalCategory] = useState([]); // Empty array means "All"
  const [localDifficulty, setLocalDifficulty] = useState([1]);
  const [localBotDifficulty, setLocalBotDifficulty] = useState(2);
  const [showVersus, setShowVersus] = useState(false);
  const manualExitRef = useRef(false);
  const prevActiveModalRef = useRef(null);
  const usedQuestionIdsRef = useRef(new Set());
  const [turnNotice, setTurnNotice] = useState(false);
  const [turnAnnouncement, setTurnAnnouncement] = useState(null);
  const [isInteractionLocked, setIsInteractionLocked] = useState(false);
  const lastAnnouncedTurnRef = useRef(0);

  const { playSound } = useAudio();

  // Blokovanie navigácie späť počas aktívnej hry
  useBlockNavigation(appState === APP_STATES.IN_GAME, () => setShowExitConfirm(true));

  // Zakázanie scrollovania na celom body počas hry (najmä pre mobile)
  useEffect(() => {
    if (appState === APP_STATES.IN_GAME) {
      document.body.classList.add('game-active');
    } else {
      document.body.classList.remove('game-active');
    }
    // Cleanup pri unmount
    return () => document.body.classList.remove('game-active');
  }, [appState]);

  // Fetch current user profile
  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('username, is_admin, avatar_url').eq('id', user.id).single()
        .then(({ data }) => setProfile(data));
    }
  }, [user]);



  // Platform Match Synchronization & DB Game Initialization
  useEffect(() => {
    if (!match || match.game_type !== 'quiz' || myMatchState?.state === 'left') return;

    const initQuizMatch = async () => {
      try {
        const { data: existingGame, error: singleErr } = await supabase.from('games').select('*').eq('id', match.id).maybeSingle();
        if (singleErr) throw singleErr;

        const rules = match.snapshot_settings?.rules || 'hex';
        const cats = match.snapshot_settings?.cat || [];
        const diffs = match.snapshot_settings?.diff || [1];

        // Ensure we know if we are playing against a real opponent or a bot
        // RACE CONDITION PREVENCION: The realtime listener that sets `match` is usually faster than the one 
        // updating member status to 'in_game'. So we consider both 'in_lobby' and 'in_game' members valid for start!
        const realMembers = members.filter(m => m.state === 'in_lobby' || m.state === 'in_game');
        const botMember = realMembers.find(m => m.role === 'bot');
        const isBotGame = !!botMember;
        const actualMode = isBotGame ? '1vbot' : '1v1_online';

        if (existingGame) {
          if (activeGameId !== match.id) {
            handleStartGame(actualMode, rules, match.id, cats, diffs, match.snapshot_settings?.botDiff || 2);
          }
        } else if (isHost) {
          // Initialize DB game
          let p1_id = user.id;
          let p2_id = null;

          if (!isBotGame) {
            const opponent = realMembers.find(m => m.user_id !== user.id);
            if (opponent) p2_id = opponent.user_id;
          }

          // CLEANUP: If the host forcefully refreshed the lobby without finishing the previous game, 
          // there might be a dangling 'active' public.games row that violates a potential DB unique constraint!
          await supabase.from('games').delete().eq('player1_id', p1_id).eq('status', 'active');

          const { data: newGame, error: err } = await supabase.from('games').insert([{
            id: match.id,
            player1_id: p1_id,
            player2_id: p2_id,
            game_type: rules,
            status: 'active',
            board_state: generateInitialBoard(rules),
            current_turn: p1_id,
            category: JSON.stringify({ cats, diffs }),
            difficulty: diffs[0] || 1
          }]).select().single();

          if (err) {
            console.error("FATAL: Failed to insert new public.games row!", err);
            alert("Nastal problém pri zakladaní hry na serveri: " + err.message);
          }

          if (!err && newGame) {
            handleStartGame(actualMode, rules, match.id, cats, diffs, match.snapshot_settings?.botDiff || 2);
            await supabase.from('platform_matches').update({ status: 'playing' }).eq('id', match.id);
          }
        } else {
          // Non-host: Game row doesn't exist yet (host is creating it), so we poll every 1s
          if (appState !== APP_STATES.IN_GAME) {
            setTimeout(initQuizMatch, 1000);
          }
        }
      } catch (err) {
        console.error("Failed to initialize match:", err);
      }
    };

    if (match.id && appState !== APP_STATES.IN_GAME) {
      initQuizMatch();
    }
  }, [match?.id, isHost, appState]);

  // Pass necessary info down to the game engine
  const {
    board, currentPlayer, winner, claimHexagon, resetGame,
    localPlayerNum, p1Score, p2Score, p1Combo, p2Combo,
    gameData, presenceCount, seenIds, markQuestionAsSeen,
    disconnectReason, setDisconnectReason,
    channel
  } = useGameState({
    userId: user?.id,
    gameMode,
    gameRules,
    activeGameId,
    manualExitRef
  });

  // Central DB Match Watcher to Force Extraneous Clients out of Dead Games
  useEffect(() => {
    // If we were playing an online game and someone killed the match DB row (e.g. host left)
    if (appState === APP_STATES.IN_GAME && gameMode === '1v1_online' && !match) {
      resetToLobby();
      onBackToPortal();
      resetGame();
    }
  }, [match, appState, gameMode, resetToLobby, onBackToPortal, resetGame]);

  // Turn Announcement Sync for Online Games
  useEffect(() => {
    if (!channel || gameMode !== '1v1_online') return;
    channel.on('broadcast', { event: 'turn_announcement' }, (msg) => {
      setTurnAnnouncement(msg.payload);
      if (msg.payload === null) return;
      // Safety auto-clear
      setTimeout(() => {
        setTurnAnnouncement(prev => (prev?.text === msg.payload.text ? null : prev));
      }, 3000);
    });
    // Poznámka: Supabase v2 nemá `.off()`. Kanál sa spoľahlivo zničí z useGameState cez `removeChannel()`.
  }, [channel, gameMode]);

  const getRandomQuestionForConfig = useCallback(async () => {
    let cats = Array.isArray(localCategory) ? localCategory : [];
    let diffs = Array.isArray(localDifficulty) ? localDifficulty : [localDifficulty];

    if (gameMode === '1v1_online' && gameData) {
      try {
        const parsed = typeof gameData.category === 'string' ? JSON.parse(gameData.category) : gameData.category;

        // Handle extended JSON logic where category obj contains both diffs and cats
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.cats) {
          cats = parsed.cats || [];
          diffs = parsed.diffs || [gameData.difficulty || 1];
        } else {
          cats = Array.isArray(parsed) ? parsed : [];
          diffs = [gameData.difficulty || 1];
        }
      } catch (e) {
        cats = [];
      }
    }

    let query = supabase.from('questions').select('*');
    if (cats.length > 0) {
      const randomCat = cats[Math.floor(Math.random() * cats.length)];
      query = query.eq('category', randomCat);
    }
    if (diffs.length === 1) {
      query = query.eq('difficulty', diffs[0]);
    } else if (diffs.length > 1) {
      query = query.in('difficulty', diffs);
    }

    // Combine session-used questions and DB-seen questions (history)
    const sessionUsed = Array.from(usedQuestionIdsRef.current);
    const historySeen = Array.isArray(seenIds) ? seenIds : [];
    const allExclusions = [...new Set([...sessionUsed, ...historySeen])];

    if (allExclusions.length > 0) {
      // Use shorter filter first (session used) if history is too large, but for now try all
      query = query.not('id', 'in', `(${allExclusions.join(',')})`);
    }

    const { data: pool, error } = await query.limit(100);

    if (error || !pool || pool.length === 0) {
      console.warn("No UNSEEN questions match config. Falling back to repeating...");

      // Fallback 1: Only avoid session duplicates (allow repeating history)
      let fallbackQuery = supabase.from('questions').select('*');
      if (cats.length > 0) {
        fallbackQuery = fallbackQuery.eq('category', cats[Math.floor(Math.random() * cats.length)]);
      }
      if (diffs.length === 1) {
        fallbackQuery = fallbackQuery.eq('difficulty', diffs[0]);
      } else if (diffs.length > 1) {
        fallbackQuery = fallbackQuery.in('difficulty', diffs);
      }

      if (sessionUsed.length > 0) {
        fallbackQuery = fallbackQuery.not('id', 'in', `(${sessionUsed.join(',')})`);
      }

      const { data: fallbackPool } = await fallbackQuery.limit(50);

      if (fallbackPool && fallbackPool.length > 0) {
        return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      }

      // Fallback 2: Pure random from category/difficulty (ignore session too if needed)
      const { data: panicPool } = await supabase.from('questions').select('*').in('category', cats).limit(50);
      if (panicPool && panicPool.length > 0) return panicPool[Math.floor(Math.random() * panicPool.length)];

      return { id: 'dummy', question_text: "Otázky sa nenašli...", answer: "Žiadna" };
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }, [localCategory, localDifficulty, gameMode, gameData, seenIds]);

  const handleStartGame = useCallback((mode, rules = 'hex', gameId = null, cat = [], diff = [1], botDiff = 2) => {
    usedQuestionIdsRef.current.clear(); // Reset used questions each new game
    setGameMode(mode);
    setGameRules(rules);
    setActiveGameId(gameId);
    setLocalCategory(cat);
    setLocalDifficulty(diff);
    setLocalBotDifficulty(botDiff);

    if (['1v1_quick', '1v1_private_create', '1v1_private_join'].includes(mode)) {
      setAppState(APP_STATES.MATCHMAKING);
      addDebugLog(`Matchmaking spustený (${mode})`);
      return;
    }

    setAppState(APP_STATES.IN_GAME);
    setShowVersus(true); // Trigger animation
    setIsInteractionLocked(true); // Lock board during VS

    setTimeout(() => {
      setShowVersus(false);
      // Wait another 0.5s for VS to fade completely, then show Start Announcement
      setTimeout(() => {
        const p1Name = gameMode === '1v1_online'
          ? (localPlayerNum === 1 ? (profile?.username || 'Hráč 1') : (opponentName || 'Súper'))
          : (profile?.username || 'Hráč 1');
        setTurnAnnouncement({
          text: `Začína ${p1Name}`,
          color: 'var(--player1-color)'
        });

        // Final release after 2 seconds
        setTimeout(() => {
          setTurnAnnouncement(null);
          setIsInteractionLocked(false);
          lastAnnouncedTurnRef.current = 1; // Mark first turn as announced
        }, 2200);
      }, 500);
    }, 4800);

    addDebugLog(`Hra začala (${mode} - ${rules})`);

    if (mode === '1v1_online' && gameId) {
      manualExitRef.current = false; // Reset exit flag on new game
      supabase.from('profiles').update({ online_status: 'playing' }).eq('id', user.id).then();
    } else {
      resetGame(rules);
    }
    setActiveModal(null);
  }, [user, resetGame, setGameMode, setGameRules, setActiveGameId, setAppState, addDebugLog]);

  const [reconnectCheckEnabled, setReconnectCheckEnabled] = useState(false);

  // Enable reconnect checking slightly after game starts to give players time to join
  useEffect(() => {
    if (appState === APP_STATES.IN_GAME && gameMode === '1v1_online') {
      const t = setTimeout(() => setReconnectCheckEnabled(true), 6000);
      return () => clearTimeout(t);
    } else {
      setReconnectCheckEnabled(false);
    }
  }, [appState, gameMode]);

  // Handle reconnect waits
  useEffect(() => {
    if (appState === APP_STATES.IN_GAME && gameMode === '1v1_online' && activeGameId && reconnectCheckEnabled) {
      if (presenceCount < 2 && !activeModal && gameData?.status === 'active') {
        supabase.from('games').update({ active_modal: { type: 'reconnect_wait', ready: [] } }).eq('id', activeGameId).then();
      }
    }
  }, [appState, gameMode, activeGameId, presenceCount, activeModal, gameData?.status, reconnectCheckEnabled]);

  const [opponentAvatar, setOpponentAvatar] = useState(null);

  // Fetch opponent's avatar for online games
  useEffect(() => {
    if (gameMode === '1v1_online' && gameData) {
      const opponentId = localPlayerNum === 1 ? gameData.player2_id : gameData.player1_id;
      if (opponentId) {
        supabase.from('profiles').select('avatar_url').eq('id', opponentId).single()
          .then(({ data }) => {
            if (data) setOpponentAvatar(data.avatar_url);
          });
      }
    } else {
      setOpponentAvatar(null);
    }
  }, [gameMode, gameData, localPlayerNum]);

  const getAvatar = (playerNum) => {
    if (playerNum === 1) {
      const url = localPlayerNum === 1 ? profile?.avatar_url : opponentAvatar;
      return url || null;
    } else {
      if (gameMode === '1vbot') return 'https://api.dicebear.com/7.x/bottts/svg?seed=bot';
      const url = localPlayerNum === 2 ? profile?.avatar_url : opponentAvatar;
      return url || null;
    }
  };

  const renderAvatar = (playerNum, size = '40px', borderColor = 'white') => {
    const url = getAvatar(playerNum);
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${borderColor}`,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `calc(${size} * 0.5)`,
        flexShrink: 0,
        overflow: 'hidden'
      }}>
        {url ? (
          <img
            src={`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerText = playerNum === 2 && gameMode === '1vbot' ? '🤖' : '👤';
            }}
          />
        ) : (
          playerNum === 2 && gameMode === '1vbot' ? '🤖' : '👤'
        )}
      </div>
    );
  };
  useEffect(() => {
    if (appState !== APP_STATES.IN_GAME || winner || activeModal) return;
    const pName = currentPlayer === 1
      ? (gameMode === '1v1_online' ? (localPlayerNum === 1 ? (profile?.username || 'Hráč 1') : (opponentName || 'Súper')) : (profile?.username || 'Hráč 1'))
      : (gameMode === '1vbot' ? 'BOT' : (gameMode === '1v1_online' ? (localPlayerNum === 2 ? (profile?.username || 'Hráč 2') : (opponentName || 'Súper')) : 'Hráč 2'));

    const pColor = currentPlayer === 1 ? 'var(--player1-color)' : 'var(--player2-color)';

    setTurnAnnouncement({ text: `Vyberá ${pName}`, color: pColor });
    setIsInteractionLocked(true);

    lastAnnouncedTurnRef.current = currentPlayer;

    const timeout = setTimeout(() => {
      setTurnAnnouncement(null);
      setIsInteractionLocked(false);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [currentPlayer, appState, profile, opponentName, winner, gameMode, activeModal]);

  // Logic extractions
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

  // initialPendingGame effect
  useEffect(() => {
    if (initialPendingGame && (appState === APP_STATES.HOME || appState === APP_STATES.LOBBY)) {
      handleStartGame(
        initialPendingGame.mode,
        initialPendingGame.rules || 'hex',
        initialPendingGame.gameId,
        initialPendingGame.cat || [],
        initialPendingGame.diff || [1],
        initialPendingGame.botDiff || 2
      );
      onClearPending();
    }
  }, [initialPendingGame, appState, handleStartGame, onClearPending]);

  const handleHexClick = async (hexId) => {
    // Okamžite zamerať globálny vstup, predtým než asynchrónna logika a stavové zmeny zablokujú focus (iOS restriction)
    const mobileInput = document.getElementById('global-mobile-input');
    if (mobileInput) {
      mobileInput.value = ''; // Vymaž všetky staré hodnoty
      mobileInput.focus();
    }

    if (isInteractionLocked) return;
    if (gameMode === '1vbot' && currentPlayer === 2) return;
    if (gameMode === '1v1_online' && gameData?.paused_by) return;
    if (gameMode === '1v1_online' && currentPlayer !== localPlayerNum) {
      setTurnNotice(true);
      setTimeout(() => setTurnNotice(false), 2500);
      return;
    }

    const hex = board.find(h => h.id === hexId);
    if (hex.owner === 'player1' || hex.owner === 'player2') return;

    // Turn Announcement: Answering...
    const pName = currentPlayer === 1
      ? (gameMode === '1v1_online' ? (localPlayerNum === 1 ? (profile?.username || 'Hráč 1') : (opponentName || 'Súper')) : (profile?.username || 'Hráč 1'))
      : (gameMode === '1vbot' ? 'BOT' : (gameMode === '1v1_online' ? (localPlayerNum === 2 ? (profile?.username || 'Hráč 2') : (opponentName || 'Súper')) : 'Hráč 2'));

    const pColor = currentPlayer === 1 ? 'var(--player1-color)' : 'var(--player2-color)';

    setTurnAnnouncement({ text: `Odpovedá ${pName}`, color: pColor });
    if (gameMode === '1v1_online' && channel) {
      channel.send({
        type: 'broadcast',
        event: 'turn_announcement',
        payload: { text: `Odpovedá ${pName}`, color: pColor }
      });
    }
    setIsInteractionLocked(true);

    // Fetch question in background while animation plays
    const qPromise = getRandomQuestionForConfig();

    setTimeout(async () => {
      const q = await qPromise;
      // Sync modal to DB immediately so opponent sees it
      const newModal = { type: 'question', question: q, hexId };
      setActiveModal(newModal);
      if (gameMode === '1v1_online' && activeGameId) {
        supabase.from('games').update({ active_modal: newModal }).eq('id', activeGameId).then();
        if (channel) channel.send({ type: 'broadcast', event: 'turn_announcement', payload: null });
      }

      setTurnAnnouncement(null);
      setIsInteractionLocked(false);
    }, 1500);
    return;
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
      // Reset turn announcement ref so it triggers again when this modal closes
      lastAnnouncedTurnRef.current = 0;
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

  const handleRestart = () => {
    // 1. Instantly clear local UI and navigate player to portal
    manualExitRef.current = true;
    resetToLobby();
    onBackToPortal();
    setShowExitConfirm(false);
    setActiveModal(null);
    resetGame();
    addDebugLog("Hra ukončená (Odoslaný reset do Menu)");

    // 2. Perform DB logic detached in the background
    setTimeout(async () => {
      if (activeGameId) {
        // Use both status update AND delete for maximum cross-client reliability
        await supabase.from('games').update({ status: 'finished' }).eq('id', activeGameId);
        await supabase.from('games').delete().eq('id', activeGameId);
        supabase.from('profiles').update({ online_status: 'online' }).eq('id', user?.id).then();
      }

      if (match) {
        await leaveGame();
      }

      // Explicitly terminate platform lobby if we were in one
      if (onTerminateLobby && !match) {
        await onTerminateLobby();
      }
    }, 50);
  };

  if (showAdmin && profile?.is_admin) {
    return <Admin onBack={() => setShowAdmin(false)} />;
  }

  // If match exists and we haven't left it, we bypass the local lobby for a seamless start
  if (appState === APP_STATES.HOME || appState === APP_STATES.LOBBY) {
    if (match && myMatchState?.state !== 'left') {
      return (
        <div style={{ minHeight: '100vh', background: '#0f172a' }}></div>
      );
    }

    return (
      <>
        <Lobby
          onStart1vBot={(rules, cat, diff, botDiff) => handleStartGame('1vbot', rules, null, cat, diff, botDiff)}
          onStartMatchmaking={(mode, rules, cat, diff) => handleStartGame(mode, rules, null, cat, diff)}
          onShowAdmin={() => setShowAdmin(true)}
          onBackToPortal={onBackToPortal}
          onlineUserIds={onlineUserIds}
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
                {renderAvatar(1, '80px', 'var(--player1-color)')}
                <span style={{ fontWeight: 700, marginTop: '0.5rem' }}>
                  {gameMode === '1v1_online'
                    ? (localPlayerNum === 1 ? profile?.username || 'Vy' : opponentName || 'Súper')
                    : profile?.username || 'Vy'
                  }
                </span>
              </div>
              <div className="vs-text">VS</div>
              <div className="vs-player">
                {renderAvatar(2, '80px', 'var(--player2-color)')}
                <span style={{ fontWeight: 700, marginTop: '0.5rem' }}>
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

        <div className="game-container game-entrance" style={{ display: showVersus ? 'none' : 'flex', width: '100%' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', overflow: 'hidden' }}>
              <span style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                '--name-len': (profile?.username || (localPlayerNum === 1 ? 'Vy' : 'Súper')).length
              }}>
                {profile?.username || (localPlayerNum === 1 ? 'Vy' : 'Súper')}
              </span>
              {renderAvatar(1, '42px', 'var(--player1-color)')}
            </div>
            <span className="vs">VS</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.75rem', overflow: 'hidden' }}>
              {renderAvatar(2, '42px', 'var(--player2-color)')}
              <span style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                '--name-len': (gameMode === '1vbot' ? 'CPU' : (opponentName || (localPlayerNum === 2 ? 'Vy' : 'Súper'))).length
              }}>
                {gameMode === '1vbot' ? 'CPU' : (opponentName || (localPlayerNum === 2 ? 'Vy' : 'Súper'))}
              </span>
            </div>
          </h1>

          {winner && (
            <div className="winner-banner">
              {winner === 1
                ? `${(localPlayerNum === 1 ? profile?.username : opponentName) || 'Hráč 1'} Vyhráva!`
                : `${(localPlayerNum === 2 ? profile?.username : (gameMode === '1vbot' ? 'BOT' : opponentName)) || 'Hráč 2'} Vyhráva!`
              }
            </div>
          )}

          <div className="status-board">
            <div className={`player-status ${currentPlayer === 1 ? 'active' : ''}`} style={{ paddingLeft: '0.8rem' }}>
              <div className="dot player1-bg"></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                <span className="player1-text" style={{ lineHeight: '1.2' }}>
                  {gameMode === '1v1_online'
                    ? (localPlayerNum === 1 ? (profile?.username || 'Hráč 1') : (opponentName || 'Súper'))
                    : (profile?.username || 'Hráč 1')
                  }
                </span>
                {gameRules === 'points' && (
                  <span className="player1-text" style={{ fontSize: '0.85rem', opacity: 0.85, lineHeight: '1.2' }}>
                    {p1Score} bodov {p1Combo >= 5 ? '🔥 2x' : p1Combo >= 3 ? '🔥 1.5x' : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="status-board-actions">
              {gameMode === '1v1_online' && !activeModal && !winner && (
                <button className="secondary" onClick={handleTogglePause}>Pauza</button>
              )}
              <button className="neutral" onClick={() => setShowExitConfirm(true)}>Opustiť Hru</button>
            </div>

            <div className={`player-status ${currentPlayer === 2 ? 'active' : ''}`} style={{ paddingRight: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                <span className="player2-text" style={{ lineHeight: '1.2' }}>
                  {gameMode === '1vbot'
                    ? 'BOT'
                    : (gameMode === '1v1_online'
                      ? (localPlayerNum === 2 ? (profile?.username || 'Hráč 2') : (opponentName || 'Súper'))
                      : 'Hráč 2')
                  }
                </span>
                {gameRules === 'points' && (
                  <span className="player2-text" style={{ fontSize: '0.85rem', opacity: 0.85, lineHeight: '1.2' }}>
                    {p2Score} bodov {p2Combo >= 5 ? '🔥 2x' : p2Combo >= 3 ? '🔥 1.5x' : ''}
                  </span>
                )}
              </div>
              <div className="dot player2-bg"></div>
            </div>
          </div>

          <GameBoard board={board} onHexClick={handleHexClick} />

          <TurnAnnouncement announcement={turnAnnouncement} />

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

          {activeModal?.type === 'reconnect_wait' && (
            <ReconnectModal
              activeModal={activeModal}
              activeGameId={activeGameId}
              presenceCount={presenceCount}
              user={user}
              onCancel={handleRestart}
            />
          )}

          {activeModal && activeModal.type !== 'reconnect_wait' && (
            <QuestionModal
              modalData={activeModal}
              hexId={activeModal.hexId}
              question={activeModal.question}
              currentPlayer={currentPlayer}
              gameMode={gameMode}
              gameRules={gameRules}
              botDifficulty={localBotDifficulty}
              p1Combo={p1Combo}
              p2Combo={p2Combo}
              onResolve={handleResolveQuestion}
              onClose={() => setActiveModal(null)}
              onSyncModal={handleSyncModal}
              localPlayerNum={localPlayerNum}
              presenceCount={presenceCount}
              markQuestionAsSeen={markQuestionAsSeen}
              playerNames={{
                player1: gameMode === '1v1_online'
                  ? (localPlayerNum === 1 ? (profile?.username || 'Hráč 1') : (opponentName || 'Súper'))
                  : (profile?.username || 'Hráč 1'),
                player2: gameMode === '1vbot'
                  ? 'BOT'
                  : (gameMode === '1v1_online'
                    ? (localPlayerNum === 2 ? (profile?.username || 'Hráč 2') : (opponentName || 'Súper'))
                    : 'Hráč 2')
              }}
            />
          )}

          {turnNotice && (
            <div className="turn-notice-overlay">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff' }}>Teraz je na ťahu súper!</h2>
              <p style={{ margin: '0.5rem 0 0', opacity: 0.7 }}>Počkajte, kým dokončí svoj ťah.</p>
            </div>
          )}

          {disconnectReason && (
            <DisconnectedModal
              reason={disconnectReason}
              onBackToLobby={() => {
                setDisconnectReason(null);
                handleRestart();
              }}
            />
          )}

          <ConfirmExitModal isOpen={showExitConfirm} onConfirm={handleRestart} onCancel={() => setShowExitConfirm(false)} />
        </div>
      </>
    );
  }

  return null;
};

const MainRouter = () => {
  const { user, signOut } = useAuth();
  const { lobby, match, leaveLobby, createLobby, joinLobbyById, isLoading } = usePlatformSession();

  const [currentApp, setCurrentApp] = useState('portal');
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [pendingGame, setPendingGame] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  // Derive lobby UI state from DB context instead of local state
  const activeLobbyId = lobby?.id || null;
  const actualLobbyModal = !!lobby && !match;
  const [renderLobby, setRenderLobby] = useState(false);
  const [lobbyIsClosing, setLobbyIsClosing] = useState(false);

  useEffect(() => {
    if (actualLobbyModal && !renderLobby) {
      setRenderLobby(true);
      setLobbyIsClosing(false);
    } else if (!actualLobbyModal && renderLobby) {
      setLobbyIsClosing(true);
      const timer = setTimeout(() => {
        setRenderLobby(false);
        setLobbyIsClosing(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [actualLobbyModal, renderLobby]);

  // Auto-route to the active game when match starts
  useEffect(() => {
    if (match?.id) {
      setCurrentApp(prev => {
        if (match.game_type === 'quiz' && prev !== 'ab_quiz') return 'ab_quiz';
        if (match.game_type === 'bilionar' && prev !== 'bilionar_battle') return 'bilionar_battle';
        if (match.game_type === 'higher_lower' && prev !== 'higher_lower') return 'higher_lower';
        return prev;
      });
    }
  }, [match?.id]);

  // Global Presence Tracking across the whole application
  useEffect(() => {
    if (user?.id) {
      const channel = supabase.channel('global-presence', {
        config: { presence: { key: user.id } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const onlineIds = new Set(Object.keys(state));
          setOnlineUserIds(onlineIds);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // Load from session storage for smoother reloads
  useEffect(() => {
    const savedApp = sessionStorage.getItem('ab_quiz_current_app');
    const savedPending = sessionStorage.getItem('ab_quiz_pending_game');

    if (savedApp) {
      if (savedPending) {
        try {
          setPendingGame(JSON.parse(savedPending));
        } catch (e) { }
      }

      // Prechod zo stareho routovania na portal (vycisti bug zaseknuteho UI)
      if (savedApp === 'portal_menu' || savedApp === 'portal_lobby') {
        setCurrentApp('portal');
        sessionStorage.setItem('ab_quiz_current_app', 'portal'); // premaz stare state
      } else {
        setCurrentApp(savedApp);
      }
    }
  }, []);

  useEffect(() => {
    if (pendingGame) sessionStorage.setItem('ab_quiz_pending_game', JSON.stringify(pendingGame));
    else sessionStorage.removeItem('ab_quiz_pending_game');
  }, [pendingGame]);

  const handleSetApp = (app) => {
    setCurrentApp(app);
    sessionStorage.setItem('ab_quiz_current_app', app);
  };

  // Global Invitations
  useGameInvites({
    user,
    activeGameId: null, // Global listener doesn't have an active game filter
    handleStartGame: (mode, rules, gameId) => {
      // Auto-start for AB Quiz if already active or something? 
      // Usually we rely on the invite modal.
    },
    setIncomingInvite
  });

  const handleAcceptInvite = async (gameId, rules) => {
    if (incomingInvite?.gameType === 'platform_lobby') {
      await joinLobbyById(gameId);
      setIncomingInvite(null);
      return;
    }

    if (incomingInvite?.gameType === 'bilionar') {
      setIncomingInvite(null);
      setPendingGame({ mode: 'bilionar', gameId });
      handleSetApp('bilionar_battle');
      // BilionarApp will pick up the pending game
    } else if (incomingInvite?.gameType === 'higher_lower') {
      setIncomingInvite(null);
      setPendingGame({ mode: 'higher_lower', gameId });
      handleSetApp('higher_lower');
      // HigherLowerApp will pick up the pending game
    } else {
      const { error } = await supabase.from('games').update({ status: 'active' }).eq('id', gameId);
      if (!error) {
        setIncomingInvite(null);
        setPendingGame({ mode: '1v1_online', rules, gameId });
        handleSetApp('ab_quiz');
      }
    }
  };

  const handleTerminateLobby = async () => {
    if (leaveLobby) {
      await leaveLobby();
    }
  };

  const handleDeclineInvite = async (gameId) => {
    if (incomingInvite?.gameType === 'platform_lobby') {
      await supabase.from('lobby_members').delete().eq('lobby_id', gameId).eq('user_id', user.id);
    } else if (incomingInvite?.gameType === 'bilionar') {
      await supabase.from('bilionar_players').delete().eq('game_id', gameId).eq('user_id', user.id);
    } else if (incomingInvite?.gameType === 'higher_lower') {
      await supabase.from('higher_lower_players').delete().eq('game_id', gameId).eq('user_id', user.id);
    } else {
      await supabase.from('games').delete().eq('id', gameId);
    }
    setIncomingInvite(null);
  };

  if (!user) {
    return (
      <div className="game-container start-screen">
        <h1 className="logo-brutal" style={{ marginBottom: '2rem' }}>Quizovník</h1>
        <AuthTabs />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="game-container start-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* CSS workaround to only show the loading text if it takes longer than 600ms */}
        <h2 style={{
          animation: 'pulse 1.5s infinite',
          opacity: 0,
          animationName: 'fadeInAndPulse',
          animationDuration: '1.5s',
          animationDelay: '0.6s',
          animationFillMode: 'forwards'
        }}>
          Obnovujem reláciu...
        </h2>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes fadeInAndPulse {
            0% { opacity: 0; transform: scale(0.98); }
            50% { opacity: 0.8; transform: scale(1); }
            100% { opacity: 0.4; transform: scale(0.98); }
          }
        `}} />
      </div>
    );
  }

  return (
    <>
      <div key={currentApp} className="app-transition-wrapper">
        {currentApp === 'portal' && (
          <GamePortal
            onSelectGame={(gameId) => {
              // Direct game launch without forced platform lobby (1vCPU, or direct matchmaking)
              if (gameId === 'ab_quiz') { handleSetApp('ab_quiz'); }
              if (gameId === 'bilionar_battle') { handleSetApp('bilionar_battle'); }
              if (gameId === 'higher_lower') { handleSetApp('higher_lower'); }
            }}
            onOpenLobby={async () => {
              if (!lobby) {
                if (createLobby) await createLobby('quiz');
              } else {
                // Derived showLobbyModal will take over
              }
            }}
          />
        )}

        {currentApp === 'ab_quiz' && (
          <ABQuizApp
            onBackToPortal={() => { handleSetApp('portal'); }}
            onTerminateLobby={handleTerminateLobby}
            initialPendingGame={pendingGame?.mode !== 'bilionar' ? pendingGame : null}
            onClearPending={() => setPendingGame(null)}
            onlineUserIds={onlineUserIds}
          />
        )}

        {currentApp === 'bilionar_battle' && (
          <BilionarApp
            activePlatformLobbyId={activeLobbyId}
            onBackToPortal={() => { handleSetApp('portal'); }}
            onTerminateLobby={handleTerminateLobby}
            onlineUserIds={onlineUserIds}
            pendingGameId={pendingGame?.mode === 'bilionar' ? pendingGame.gameId : null}
            onClearPending={() => setPendingGame(null)}
          />
        )}

        {currentApp === 'higher_lower' && (
          <HigherLowerApp
            onBackToPortal={() => { handleSetApp('portal'); }}
            onTerminateLobby={handleTerminateLobby}
            onlineUserIds={onlineUserIds}
            pendingGameId={pendingGame?.mode === 'higher_lower' ? pendingGame.gameId : null}
            onClearPending={() => setPendingGame(null)}
          />
        )}
      </div>

      {renderLobby && (
        <div className={`modal-overlay ${lobbyIsClosing ? 'lobby-closing-overlay' : 'lobby-opening-overlay'}`} style={{
          zIndex: 9999, background: 'rgba(5, 10, 20, 0.85)', backdropFilter: 'blur(8px)', padding: 0, alignItems: 'stretch'
        }}>
          <div className={lobbyIsClosing ? 'lobby-closing-content' : 'lobby-opening-content'} style={{
            position: 'relative', width: '100%', height: '100%', overflow: 'hidden'
          }}>

            <PlatformLobby
              initialLobbyId={activeLobbyId}
              onlineUserIds={onlineUserIds}
              onLeaveLobby={() => leaveLobby()}
              onStartGameFlow={(gameType, gameId, subMode, extra = {}) => {
                const { rules = 'hex', cat = [], diff = [1], botDiff = 2 } = extra;

                if (gameType === 'quiz') {
                  setPendingGame({
                    mode: subMode || '1v1_online',
                    rules: rules,
                    gameId: gameId,
                    cat: cat,
                    diff: diff,
                    botDiff: botDiff
                  });
                  handleSetApp('ab_quiz');
                }
                else if (gameType === 'bilionar') {
                  setPendingGame({ mode: 'bilionar', gameId: gameId });
                  handleSetApp('bilionar_battle');
                }
                else if (gameType === 'higher_lower') {
                  setPendingGame({ mode: 'higher_lower', gameId: gameId });
                  handleSetApp('higher_lower');
                }
              }}
            />
          </div>
        </div>
      )}

      <GameInviteModal
        invite={incomingInvite}
        onAccept={(gameId, rules) => handleAcceptInvite(gameId, rules)}
        onDecline={handleDeclineInvite}
      />
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <PlatformSessionProvider>
        <MainRouter />
      </PlatformSessionProvider>
    </AuthProvider>
  );
};

export default App;
