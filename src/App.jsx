import React, { useState, useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { QuestionModal } from './components/QuestionModal';
import { getRandomQuestion } from './data/questions';

function App() {
  const { board, currentPlayer, winner, claimHexagon, resetGame } = useGameState();
  const [activeModal, setActiveModal] = useState(null); // { hexId: number, question: object }
  const [gameMode, setGameMode] = useState(null); // '1v1' or '1vcpu'

  const handleStartGame = (mode) => {
    setGameMode(mode);
    resetGame();
  };

  const handleHexClick = (hexId) => {
    // If it's CPU's turn, ignore manual clicks
    if (gameMode === '1vcpu' && currentPlayer === 2) return;

    const hex = board.find(h => h.id === hexId);
    if (hex.owner === 'player1' || hex.owner === 'player2') {
      return;
    }

    const q = getRandomQuestion();
    setActiveModal({ hexId, question: q });
  };

  // CPU Turn automation
  useEffect(() => {
    if (gameMode === '1vcpu' && currentPlayer === 2 && !winner && !activeModal) {
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

  const handleRestart = () => {
    setGameMode(null);
    resetGame();
  };

  if (!gameMode) {
    return (
      <div className="game-container start-screen">
        <h1>AB Kvíz</h1>
        <p>Vitajte v slovenskej vedomostnej hre inšpirovanej AZ-kvízom.</p>
        <div className="modal-actions" style={{ marginTop: '2rem' }}>
          <button className="primary" onClick={() => handleStartGame('1vcpu')}>Hrať proti Počítaču (CPU)</button>
          <button className="secondary" onClick={() => handleStartGame('1v1')}>Hrať proti Hráčovi (1v1)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <h1>AB Kvíz</h1>

      {winner && (
        <div className="winner-banner">
          {winner === 1 ? 'Hráč 1 (Modrý) Vyhráva!' : 'Hráč 2 (Oranžový) Vyhráva!'}
        </div>
      )}

      <div className="status-board">
        <div className={`player-status ${currentPlayer === 1 ? 'active' : ''}`}>
          <span className="player1-text">Hráč 1</span>
          <div className="dot player1-bg" />
        </div>

        <button className="neutral" onClick={handleRestart}>Nová Hra</button>

        <div className={`player-status ${currentPlayer === 2 ? 'active' : ''}`}>
          <span className="player2-text">{gameMode === '1vcpu' ? 'CPU' : 'Hráč 2'}</span>
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
        />
      )}
    </div>
  );
}

export default App;
