import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useModalSync = ({
    gameMode, activeGameId, gameData, currentPlayer, localPlayerNum, playSound, activeModal, setActiveModal
}) => {
    const activeModalRef = useRef(activeModal);
    const lastResolvedHexRef = useRef(null);
    const lastResolvedTimeRef = useRef(0);

    useEffect(() => {
        activeModalRef.current = activeModal;
        // If modal becomes null, track what we just closed
        if (!activeModal && prevActiveModalRef.current) {
            lastResolvedHexRef.current = prevActiveModalRef.current.hexId;
            lastResolvedTimeRef.current = Date.now();
        }
        prevActiveModalRef.current = activeModal;
    }, [activeModal]);

    const prevActiveModalRef = useRef(null);

    // Read updates from DB
    useEffect(() => {
        if (gameMode === '1v1_online' && gameData) {
            setActiveModal(prev => {
                const dbModal = gameData.active_modal || null;
                const dbModalStr = JSON.stringify(dbModal);
                const locModalStr = JSON.stringify(prev || null);

                if (dbModalStr !== locModalStr) {
                    // 1. Anti-Echo: Don't re-open a modal we JUST closed locally (within 3s) for the same hex
                    if (!prev && dbModal && lastResolvedHexRef.current === dbModal.hexId) {
                        const elapsed = Date.now() - lastResolvedTimeRef.current;
                        if (elapsed < 3000) return null;
                    }

                    // 2. Logic Check: Don't allow DB to revert local feedback to active input
                    if (prev?.phase?.startsWith('feedback')) {
                        const isDbReverting = dbModal?.phase === 'currentPlayer' || (prev.phase.startsWith('feedbackSecondary') && dbModal?.phase === 'opponent');
                        if (isDbReverting) return prev;
                    }

                    if (!prev && dbModal && currentPlayer !== localPlayerNum) {
                        playSound('click');
                    }
                    return dbModal;
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
