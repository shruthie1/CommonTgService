import { attemptReverseFuzzy } from "./obfuscateText";

const normalize = (str: string | null | undefined): string =>
    (str || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}@\s]/gu, "")
        .normalize("NFC")
        .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
// Safely attempt reverse fuzzy operation
export const safeAttemptReverse = (val: string | null | undefined): string => {
    try {
        return attemptReverseFuzzy(val ?? "") || "";
    } catch {
        return "";
    }
};

// Check if strings are similar enough (lenient matching)
const isSimilarEnough = (actual: string, expected: string): boolean => {
    const normalizedActual = normalize(actual);
    const normalizedExpected = normalize(expected);

    // If exact match after normalization
    if (normalizedActual === normalizedExpected) return true;

    // If one contains the other (lenient)
    if (normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)) return true;

    // Calculate simple similarity ratio
    const longer = normalizedActual.length > normalizedExpected.length ? normalizedActual : normalizedExpected;
    const shorter = normalizedActual.length > normalizedExpected.length ? normalizedExpected : normalizedActual;

    if (longer.length === 0) return true; // Both empty

    // Allow 30% difference
    const editDistance = levenshteinDistance(normalizedActual, normalizedExpected);
    const similarity = 1 - editDistance / longer.length;

    return similarity >= 0.7; // 70% similar is good enough
};

const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }

    return matrix[str2.length][str1.length];
};
export const isIncludedWithTolerance = (actual: string, expected: string, maxDiff = 2): boolean => {
    if (!expected) return true;
    if (!actual) return false;

    const normActual = normalize(actual);
    const normExpected = normalize(expected);

    if (normActual.includes(normExpected)) return true;

    // Sliding window with flexible length (expected ± maxDiff)
    const minLen = Math.max(normExpected.length - maxDiff, 1);
    const maxLen = normExpected.length + maxDiff;

    for (let len = minLen; len <= maxLen; len++) {
        for (let i = 0; i <= normActual.length - len; i++) {
            const substring = normActual.slice(i, i + len);
            if (levenshteinDistance(substring, normExpected) <= maxDiff) {
                return true;
            }
        }
    }

    return false;
};