export const generateInitialBoard = (rules) => {
    return Array.from({ length: 28 }, (_, i) => {
        let special = 'normal';
        if (rules === 'points') {
            const rand = Math.random();
            if (rand > 0.85) special = 'double';
            else if (rand > 0.70) special = 'risk';
        }
        return { id: i + 1, owner: 'unowned', special };
    });
};

export const updateBoardWithClaim = (board, hexId, targetOwner) => {
    return board.map(hex =>
        (hex.id === hexId && (hex.owner === 'unowned' || hex.owner === 'black'))
            ? { ...hex, owner: targetOwner }
            : hex
    );
};

export const isBoardFull = (board) => {
    return board.every(h => h.owner !== 'unowned' && h.owner !== 'black');
};

export const getPlayerNodes = (board, player) => {
    return board.filter(h => h.owner === `player${player}`).map(h => h.id);
};
