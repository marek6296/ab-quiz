import { useEffect } from 'react';

export const useBotTurn = ({
    gameMode, currentPlayer, winner, activeModal, showExitConfirm, board,
    getRandomQuestionForConfig, setActiveModal
}) => {
    useEffect(() => {
        if (gameMode === '1vbot' && currentPlayer === 2 && !winner && !activeModal && !showExitConfirm) {
            const availableHexes = board.filter(h => h.owner !== 'player1' && h.owner !== 'player2');
            if (availableHexes.length > 0) {
                const timeout = setTimeout(() => {
                    const randomHex = availableHexes[Math.floor(Math.random() * availableHexes.length)];
                    getRandomQuestionForConfig().then(q => {
                        setActiveModal({ hexId: randomHex.id, question: q });
                    });
                }, 1500);
                return () => clearTimeout(timeout);
            }
        }
    }, [currentPlayer, gameMode, board, winner, activeModal, showExitConfirm, getRandomQuestionForConfig, setActiveModal]);
};
