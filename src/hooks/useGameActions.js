import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { APP_STATES } from '../game-engine/store';

export const useGameActions = ({
    user,
    gameMode, setGameMode,
    gameRules, setGameRules,
    activeGameId, setActiveGameId,
    setAppState,
    resetGame, resetToLobby,
    board, currentPlayer, localPlayerNum, gameData,
    getRandomQuestionForConfig, setActiveModal,
    claimHexagon, activeModal,
    playSound, setShowExitConfirm
}) => {

    const handleStartGame = useCallback((mode, rules = 'hex', gameId = null, cat = [], diff = 1) => {
        setGameMode(mode);
        setGameRules(rules);
        setActiveGameId(gameId);

        if (['1v1_quick', '1v1_private_create', '1v1_private_join'].includes(mode)) {
            setAppState(APP_STATES.MATCHMAKING);
            return;
        }

        setAppState(APP_STATES.IN_GAME);

        if (mode === '1v1_online' && gameId) {
            supabase.from('profiles').update({ online_status: 'playing' }).eq('id', user.id).then();
        } else {
            resetGame();
        }
    }, [user, resetGame, setGameMode, setGameRules, setActiveGameId, setAppState]);

    const handleHexClick = async (hexId) => {
        if (gameMode === '1vbot' && currentPlayer === 2) return;
        if (gameMode === '1v1_online' && gameData?.paused_by) return;
        if (gameMode === '1v1_online' && currentPlayer !== localPlayerNum) {
            alert("Teraz je na ťahu súper!");
            return;
        }

        const hex = board.find(h => h.id === hexId);
        if (hex.owner === 'player1' || hex.owner === 'player2') return;

        playSound('click');
        const q = await getRandomQuestionForConfig();
        const newModal = { hexId, question: q, phase: 'reveal' };
        setActiveModal(newModal);

        if (gameMode === '1v1_online' && activeGameId) {
            await supabase.from('games').update({ active_modal: newModal }).eq('id', activeGameId);
        }
    };

    const handleResolveQuestion = (targetOwner, pointsEarned = 0, breakCombo = false) => {
        if (activeModal) {
            claimHexagon(activeModal.hexId, targetOwner, pointsEarned, breakCombo);
            setActiveModal(null);
        }
    };

    const handleTogglePause = async () => {
        if (gameMode !== '1v1_online' || !activeGameId) return;
        const isCurrentlyPaused = !!gameData?.paused_by;
        if (isCurrentlyPaused && gameData.paused_by !== user.id) return;
        const newPausedBy = isCurrentlyPaused ? null : user.id;
        await supabase.from('games').update({ paused_by: newPausedBy }).eq('id', activeGameId);
    };

    const handleRestart = async () => {
        if (activeGameId) {
            await supabase.from('games').delete().eq('id', activeGameId);
            supabase.from('profiles').update({ online_status: 'online' }).eq('id', user?.id).then();
        }
        resetToLobby();
        setShowExitConfirm(false);
        resetGame();
    };

    return {
        handleStartGame,
        handleHexClick,
        handleResolveQuestion,
        handleTogglePause,
        handleRestart
    };
};
