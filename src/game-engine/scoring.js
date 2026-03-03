/**
 * Vypočíta nové skóre a kombá po zabraní políčka (alebo zlyhaní)
 * Prijíma doterajší stav a vracia úplne nový stav bodov
 */
export const calculateClaimResults = ({
    targetOwner,
    pointsEarned,
    breakCombo,
    currentPlayer,
    hexSpecialInfo,
    currentScoresAndCombos
}) => {
    let { p1Score, p2Score, p1Combo, p2Combo } = currentScoresAndCombos;

    if (targetOwner === 'player1') {
        const actualPoints = hexSpecialInfo === 'double' ? pointsEarned * 2 : pointsEarned;
        p1Score += actualPoints;
        p1Combo += 1;
    } else if (targetOwner === 'player2') {
        const actualPoints = hexSpecialInfo === 'double' ? pointsEarned * 2 : pointsEarned;
        p2Score += actualPoints;
        p2Combo += 1;
    } else if (targetOwner === 'unowned' && breakCombo) {
        if (currentPlayer === 1) {
            p1Combo = 0;
            if (hexSpecialInfo === 'risk') p1Score = Math.max(0, p1Score - 15);
        } else if (currentPlayer === 2) {
            p2Combo = 0;
            if (hexSpecialInfo === 'risk') p2Score = Math.max(0, p2Score - 15);
        }
    }

    return {
        newP1Score: p1Score,
        newP2Score: p2Score,
        newP1Combo: p1Combo,
        newP2Combo: p2Combo
    };
};
