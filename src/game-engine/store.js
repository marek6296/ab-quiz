import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const APP_STATES = {
    HOME: 'HOME',               // User authentication or loading
    LOBBY: 'LOBBY',             // Main menu to select game mode
    MATCHMAKING: 'MATCHMAKING', // Waiting in queue or room for an opponent
    IN_GAME: 'IN_GAME',         // Main active GameBoard
    GAME_OVER: 'GAME_OVER'      // Match finished
};

export const useGameStore = create(
    persist(
        (set) => ({
            // Application flow
            appState: APP_STATES.HOME,
            setAppState: (state) => set({ appState: state }),

            // Game Configuration
            gameMode: null, // '1vbot', '1v1_local', '1v1_online'
            setGameMode: (mode) => set({ gameMode: mode }),

            gameRules: 'hex', // 'hex', 'points'
            setGameRules: (rules) => set({ gameRules: rules }),

            // Online specific
            activeGameId: null,      // UUID of Supabase 'games' row
            setActiveGameId: (id) => set({ activeGameId: id }),

            // Reset all game states and return to lobby
            resetToLobby: () => set({
                appState: APP_STATES.LOBBY,
                gameMode: null,
                activeGameId: null
            }),
        }),
        {
            name: 'ab-quiz-game-storage', // key in local storage
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                appState: state.appState,
                gameMode: state.gameMode,
                gameRules: state.gameRules,
                activeGameId: state.activeGameId
            }), // Selectively persist only these fields
        }
    )
);
