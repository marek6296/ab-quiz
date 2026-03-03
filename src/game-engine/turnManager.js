import { checkWin } from '../utils/pathfinding';

/**
 * Zistí, či prišlo k výhre po zabraní políčka a vracia nového víťaza (1 alebo 2) alebo null.
 */
export const evaluateWinCondition = ({
    board,
    gameRules,
    p1Score,
    p2Score,
    targetOwner
}) => {
    if (gameRules === 'points') {
        if (p1Score >= 150) return 1;
        if (p2Score >= 150) return 2;

        // Check if board is full for tiebreaker
        const isFull = board.every(h => h.owner !== 'unowned' && h.owner !== 'black');
        if (isFull) {
            return p1Score >= p2Score ? 1 : 2;
        }
    } else {
        // Hex logic
        if (targetOwner === 'player1' || targetOwner === 'player2') {
            const playerNum = targetOwner === 'player1' ? 1 : 2;
            const targetNodes = board.filter(h => h.owner === targetOwner).map(h => h.id);
            if (checkWin(targetNodes, playerNum)) {
                return playerNum;
            }
        }
    }
    return null;
};

/**
 * Vráti ID hráča, ktorý je na rade (1 alebo 2)
 */
export const getNextTurnPlayer = (currentPlayer) => {
    return currentPlayer === 1 ? 2 : 1;
};

/**
 * Vracia relačné databázové ID ďalšieho hráča (na poslanie do Supabase tabuľky games.current_turn)
 */
export const getNextTurnDbId = (currentPlayer, gameData) => {
    if (!gameData) return null;
    return currentPlayer === 1 ? gameData.player2_id : gameData.player1_id;
};
