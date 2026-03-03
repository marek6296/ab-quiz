import { useEffect } from 'react';

export const useBlockNavigation = (isActive, onExitAttempt) => {
    useEffect(() => {
        if (!isActive) return;

        const handleBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = ''; // Chrome vyžaduje tento riadok pre zobrazenie warningu pred opustením okna
        };

        const handlePopState = (e) => {
            // Zabráni reálne vráteniu späť vložením "fake" histórie
            window.history.pushState(null, '', window.location.href);
            if (onExitAttempt) {
                onExitAttempt();
            }
        };

        // Vložíme state pri aktivácii, aby po stlačení 'späť' vznikol popstate namiesto unmountu
        window.history.pushState(null, '', window.location.href);

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isActive, onExitAttempt]);
};
