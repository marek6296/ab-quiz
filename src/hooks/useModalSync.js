import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useModalSync = ({
    gameMode, activeGameId, gameData, currentPlayer, localPlayerNum, playSound, activeModal, setActiveModal
}) => {
    const activeModalRef = useRef(activeModal);

    useEffect(() => {
        activeModalRef.current = activeModal;
    }, [activeModal]);

    // Read updates from DB
    useEffect(() => {
        if (gameMode === '1v1_online' && gameData) {
            setActiveModal(prev => {
                const dbModalStr = JSON.stringify(gameData.active_modal || null);
                const locModalStr = JSON.stringify(prev || null);
                if (dbModalStr !== locModalStr) {
                    // Check if local is already in feedback but DB is trailing behind (trying to set currentPlayer again)
                    const isLocalFeedback = prev?.phase?.startsWith('feedback');
                    const isDbReverting = gameData.active_modal?.phase === 'currentPlayer';

                    if (isLocalFeedback && isDbReverting) {
                        return prev; // Keep local feedback, don't let DB revert us back to original question input
                    }

                    if (!prev && gameData.active_modal && currentPlayer !== localPlayerNum) {
                        playSound('click');
                    }
                    return gameData.active_modal || null;
                }
                return prev;
            });
        }
    }, [gameMode, gameData?.active_modal, currentPlayer, localPlayerNum, playSound, setActiveModal]);

    // Sync to DB
    const handleSyncModal = useCallback((updates) => {
        if (gameMode === '1v1_online' && activeGameId && activeModalRef.current) {
            const merged = { ...activeModalRef.current, ...updates };
            setActiveModal(merged);
            supabase.from('games').update({ active_modal: merged }).eq('id', activeGameId).then();
        }
    }, [gameMode, activeGameId, setActiveModal]);

    return { handleSyncModal };
};
