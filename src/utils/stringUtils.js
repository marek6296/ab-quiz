export const removeDiacritics = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

export const levenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // Increment along the first column of each row
    let i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    let j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

export const isAnswerCorrect = (input, expected) => {
    const cleanInput = removeDiacritics(input);
    const cleanExpected = removeDiacritics(expected);

    // Direct match
    if (cleanInput === cleanExpected) return true;

    // For very short words, require exact match (or max 1 typo for 4 letter words)
    if (cleanExpected.length <= 3) {
        return cleanInput === cleanExpected;
    }

    // For 4-letter words, 1 typo is enough to totally change the meaning, so max 1.
    // For longer words (5+), we allow 2 typos.
    const maxTyposAllowed = cleanExpected.length <= 4 ? 1 : 2;

    const distance = levenshteinDistance(cleanInput, cleanExpected);
    return distance <= maxTyposAllowed;
};
