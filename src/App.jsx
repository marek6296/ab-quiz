import React, { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { QuestionModal } from './components/QuestionModal';
import { getRandomQuestion } from './data/questions';

function App() {
  const { board, currentPlayer, winner, claimHexagon, resetGame } = useGameState();
  const [activeModal, setActiveModal] = useState(null); // { hexId: number, question: object }

  const handleHexClick = (hexId) => {
    // Cannot click already owned hexagon by players, but black can be clicked again in AZ-kviz
    const hex = board.find(h => h.id === hexId);
    if (hex.owner === 'player1' || hex.owner === 'player2') {
      return;
    }

    // Launch a new random question
    const q = getRandomQuestion();
    setActiveModal({ hexId, question: q });
  };

  const handleResolveQuestion = (targetOwner) => {
    if (activeModal) {
      claimHexagon(activeModal.hexId, targetOwner);
      setActiveModal(null);
    }
  };

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

        <button className="neutral" onClick={resetGame}>Reštart Hry</button>

        <div className={`player-status ${currentPlayer === 2 ? 'active' : ''}`}>
          <span className="player2-text">Hráč 2</span>
          <div className="dot player2-bg" />
        </div>
      </div>

      <GameBoard board={board} onHexClick={handleHexClick} />

      {activeModal && (
        <QuestionModal
          hexId={activeModal.hexId}
          question={activeModal.question}
          currentPlayer={currentPlayer}
          onResolve={handleResolveQuestion}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

export default App;
