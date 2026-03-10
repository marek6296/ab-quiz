import { useEffect, useRef, useState } from 'react';
import { HigherLowerGame } from './HigherLowerGame';
import { supabase } from './lib/supabase';

function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out

  // Auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Start game only when user is resolved (logged in OR guest)
  useEffect(() => {
    if (user === undefined) return; // Still loading
    const canvas = canvasRef.current;
    if (!canvas || gameRef.current) return;

    const game = new HigherLowerGame(canvas, user);
    gameRef.current = game;
    game.start();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
      }
    };
  }, [user]);

  // When user logs in/out, restart the game
  useEffect(() => {
    if (user === undefined) return;
    if (gameRef.current) {
      gameRef.current.setUser(user);
    }
  }, [user]);

  if (user === undefined) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18
      }}>
        Načítavám...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh' }}
    />
  );
}

export default App;
