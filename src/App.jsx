import { useEffect, useRef, useState, useCallback } from 'react';
import { GameHub } from './GameHub';
import { HigherLowerGame } from './HigherLowerGame';
import { QuizDuelGame } from './QuizDuelGame';
import { MillionaireGame } from './MillionaireGame';
import { AdminPanel } from './AdminPanel';
import { supabase } from './lib/supabase';

function App() {
  const canvasRef = useRef(null);
  const instanceRef = useRef(null);
  const [user, setUser] = useState(undefined);
  const [currentGame, setCurrentGame] = useState(null); // null = hub

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const destroyCurrent = useCallback(() => {
    if (instanceRef.current) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
  }, []);

  const goToHub = useCallback(() => {
    destroyCurrent();
    setCurrentGame(null);
  }, [destroyCurrent]);

  const selectGame = useCallback((gameId, extra) => {
    destroyCurrent();
    setCurrentGame({ id: gameId, extra });
  }, [destroyCurrent]);

  // Create instances
  useEffect(() => {
    if (user === undefined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destroy previous
    destroyCurrent();

    if (!currentGame) {
      // Show hub
      const hub = new GameHub(canvas, user, {
        onSelectGame: (gameId, extra) => selectGame(gameId, extra),
      });
      instanceRef.current = hub;
      hub.start();
    } else if (currentGame.id === 'higher-lower') {
      const game = new HigherLowerGame(canvas, user, {
        onBack: goToHub,
        duel: currentGame.extra?.duel,
        isHost: currentGame.extra?.isHost,
        invite: currentGame.extra?.invite,
      });
      instanceRef.current = game;
      game.start();
    } else if (currentGame.id === 'quiz-duel') {
      const game = new QuizDuelGame(canvas, user, {
        onBack: goToHub,
      });
      instanceRef.current = game;
      game.start();
    } else if (currentGame.id === 'millionaire') {
      const game = new MillionaireGame(canvas, user, {
        onBack: goToHub,
      });
      instanceRef.current = game;
      game.start();
    }

    return () => destroyCurrent();
  }, [user, currentGame]);

  // User change
  useEffect(() => {
    if (user === undefined) return;
    if (instanceRef.current?.setUser) {
      instanceRef.current.setUser(user);
    }
  }, [user]);

  if (user === undefined) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#050505',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18
      }}>
        Načítavám...
      </div>
    );
  }

  // Admin panel is a React component, not canvas
  if (currentGame?.id === 'admin') {
    return <AdminPanel user={user} onBack={goToHub} />;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh' }}
    />
  );
}

export default App;
