import { useCallback } from 'react';

// Create a singleton store for HTMLAudioElements so we don't recreate them on every render
const audioCache = {};

export const useAudio = () => {
    const playSound = useCallback((soundName) => {
        // Determine file and base volume
        let file = '';
        let volume = 1.0;

        switch (soundName) {
            case 'click':
                file = '/button-click.mp3';
                volume = 0.5; // Tone down the click slightly so it isn't jarring
                break;
            case 'correct':
                file = '/good-answer.mp3';
                volume = 0.6;
                break;
            case 'wrong':
                file = '/bad-answer.mp3';
                volume = 0.6;
                break;
            case 'tick':
                file = '/ticking.mp3';
                volume = 0.4;
                break;
            case 'winner':
                file = '/winner.mp3';
                volume = 0.8;
                break;
            default:
                return;
        }

        if (!file) return;

        try {
            // Create base cache instance if it doesn't exist
            if (!audioCache[soundName]) {
                audioCache[soundName] = new Audio(file);
                // Preload to keep memory fast
                audioCache[soundName].load();
            }

            if (soundName === 'tick') {
                // Re-use the same element for ticking so we can stop it later
                const audio = audioCache[soundName];
                audio.volume = volume;
                audio.loop = true; // Odteraz bude tikanie samostatne plynulo loopovať dokola
                audio.play().catch(error => console.warn(`Audio playback failed for ${soundName}:`, error));
            } else {
                // Pre všetky ostatné zvuky (kliknutia, správne, nesprávne) vyklonujeme element.
                // Toto zabezpečí, že sa dajú prehrať okamžite aj viackrát po sebe (cez seba) bez toho, 
                // aby sa prerušil pôvodný prehrávací promise, čo iOS Safari inak vníma ako chybu a zvuk natrvalo odmlčí.
                const clonedAudio = audioCache[soundName].cloneNode(true);
                clonedAudio.volume = volume;
                clonedAudio.play().catch(error => console.warn(`Audio playback failed for ${soundName}:`, error));
            }
        } catch (e) {
            console.warn('Audio play error:', e);
        }
    }, []);
    const stopSound = useCallback((soundName) => {
        try {
            const audio = audioCache[soundName];
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        } catch (e) {
            console.warn('Audio stop error:', e);
        }
    }, []);

    return { playSound, stopSound };
};
