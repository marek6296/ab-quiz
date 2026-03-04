import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Real-time synchronization store for Bilionár Battle
export const useBilionarStore = create((set, get) => ({
    // State mirroring Supabase bilionar_games 'state' jsonb column
    gameState: {
        phase: 'intermission', // 'intermission' -> 'question' -> 'reveal' -> 'scores' -> 'finished'
        current_question_index: 0,
        start_time: null, // For syncing timers
        current_question: null,
    },
    
    // Server-Authoritative Methods
    syncGameState: (newState) => set({ gameState: newState }),

    advanceToNextQuestion: async (gameId, newQuestion, newIndex) => {
        // Calculate the future start time (e.g., 5 seconds from now for intermission)
        const startTime = Date.now() + 5000;
        
        const newState = {
            phase: 'intermission',
            current_question_index: newIndex,
            current_question: newQuestion,
            start_time: startTime, // Server clock simulation
        };
        
        const { error } = await supabase.from('bilionar_games').update({ state: newState }).eq('id', gameId);
        if (error) console.error("Advance error:", error);
    },

    triggerRevealPhase: async (gameId) => {
        // Keeps current question/index but advances phase
        const current = get().gameState;
        const revealTime = Date.now() + 2000; // 2 seconds dramatic pause before ticking
        const newState = { ...current, phase: 'reveal', start_time: revealTime };
        await supabase.from('bilionar_games').update({ state: newState }).eq('id', gameId);
    },

    triggerIntermission: async (gameId) => {
        // Switch to showing the scoreboard/standings briefly before the next question drops
        const current = get().gameState;
        const scoreTime = Date.now() + 5000; 
        const newState = { ...current, phase: 'scores', start_time: scoreTime };
        await supabase.from('bilionar_games').update({ state: newState }).eq('id', gameId);
    }
}));
