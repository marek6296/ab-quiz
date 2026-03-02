import { useState, useCallback, useEffect } from 'react';
import { checkWin } from '../utils/pathfinding';

export const useGameState = () => {
    const [board, setBoard] = useState(
        Array.from({ length: 28 }, (_, i) => ({ id: i + 1, owner: 'unowned' }))
    );

    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [winner, setWinner] = useState(null);

    // Checks for win condition whenever board changes
    useEffect(() => {
        if (winner) return; // Game over

        const player1Nodes = board.filter(h => h.owner === 'player1').map(h => h.id);
        const player2Nodes = board.filter(h => h.owner === 'player2').map(h => h.id);

        if (checkWin(player1Nodes)) setWinner(1);
        else if (checkWin(player2Nodes)) setWinner(2);
    }, [board, winner]);

    const claimHexagon = useCallback((hexId, targetOwner) => {
        if (winner) return;

        setBoard(prev =>
            prev.map(hex => hex.id === hexId ? { ...hex, owner: targetOwner } : hex)
        );

        // Switch turns
        setCurrentPlayer(prev => prev === 1 ? 2 : 1);
    }, [winner]);

    const resetGame = useCallback(() => {
        setBoard(Array.from({ length: 28 }, (_, i) => ({ id: i + 1, owner: 'unowned' })));
        setCurrentPlayer(1);
        setWinner(null);
    }, []);

    return {
        board,
        currentPlayer,
        winner,
        claimHexagon,
        resetGame
    };
};
