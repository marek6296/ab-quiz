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
            default:
                return;
        }

        if (!file) return;

        try {
            // Create or reuse audio instance
            if (!audioCache[soundName]) {
                audioCache[soundName] = new Audio(file);
            }

            const audio = audioCache[soundName];
            audio.volume = volume;

            // Reset playback position if it's already playing (allows rapid clicking)
            audio.currentTime = 0;

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Autoplay was prevented or audio failed to load.
                    console.warn(`Audio playback failed for ${soundName}:`, error);
                });
            }
        } catch (e) {
            console.warn('Audio play error:', e);
        }
    }, []);

    return { playSound };
};
