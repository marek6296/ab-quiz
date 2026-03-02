export const adjacencyList = {
    1: [2, 3],
    2: [1, 3, 4, 5],
    3: [1, 2, 5, 6],
    4: [2, 5, 7, 8],
    5: [2, 3, 4, 6, 8, 9],
    6: [3, 5, 9, 10],
    7: [4, 8, 11, 12],
    8: [4, 5, 7, 9, 12, 13],
    9: [5, 6, 8, 10, 13, 14],
    10: [6, 9, 14, 15],
    11: [7, 12, 16, 17],
    12: [7, 8, 11, 13, 17, 18],
    13: [8, 9, 12, 14, 18, 19],
    14: [9, 10, 13, 15, 19, 20],
    15: [10, 14, 20, 21],
    16: [11, 17, 22, 23],
    17: [11, 12, 16, 18, 23, 24],
    18: [12, 13, 17, 19, 24, 25],
    19: [13, 14, 18, 20, 25, 26],
    20: [14, 15, 19, 21, 26, 27],
    21: [15, 20, 27, 28],
    22: [16, 23],
    23: [16, 17, 22, 24],
    24: [17, 18, 23, 25],
    25: [18, 19, 24, 26],
    26: [19, 20, 25, 27],
    27: [20, 21, 26, 28],
    28: [21, 27]
};

export const SIDES = {
    TOP: [1],
    BOTTOM: [22, 23, 24, 25, 26, 27, 28],
    LEFT: [2, 4, 7, 11, 16, 22],
    RIGHT: [3, 6, 10, 15, 21, 28]
};

// Checks if a given array of nodes (owned by a player) connects their designated sides.
// Player 1 (Top to Bottom)
// Player 2 (Left to Right)
export const checkWin = (ownedNodes, playerId) => {
    if (!ownedNodes || ownedNodes.length < 1) return false;

    const nodeSet = new Set(ownedNodes);
    const visited = new Set();

    const targetA = playerId === 1 ? SIDES.TOP : SIDES.LEFT;
    const targetB = playerId === 1 ? SIDES.BOTTOM : SIDES.RIGHT;

    for (const startNode of ownedNodes) {
        if (visited.has(startNode)) continue;

        // Start a new connected component
        const component = [];
        const queue = [startNode];
        visited.add(startNode);

        let touchesA = false;
        let touchesB = false;

        while (queue.length > 0) {
            const curr = queue.shift();
            component.push(curr);

            if (targetA.includes(curr)) touchesA = true;
            if (targetB.includes(curr)) touchesB = true;

            // If this single component touches both required sides, they win
            if (touchesA && touchesB) {
                return true;
            }

            const neighbors = adjacencyList[curr] || [];
            for (const neighbor of neighbors) {
                if (nodeSet.has(neighbor) && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }

    return false;
};
