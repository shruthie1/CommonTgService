"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIncludedWithTolerance = exports.safeAttemptReverse = void 0;
const obfuscateText_1 = require("./obfuscateText");
const normalize = (str) => (str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}@\s]/gu, "")
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
const safeAttemptReverse = (val) => {
    try {
        return (0, obfuscateText_1.attemptReverseFuzzy)(val ?? "") || "";
    }
    catch {
        return "";
    }
};
exports.safeAttemptReverse = safeAttemptReverse;
const isSimilarEnough = (actual, expected) => {
    const normalizedActual = normalize(actual);
    const normalizedExpected = normalize(expected);
    if (normalizedActual === normalizedExpected)
        return true;
    if (normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual))
        return true;
    const longer = normalizedActual.length > normalizedExpected.length ? normalizedActual : normalizedExpected;
    const shorter = normalizedActual.length > normalizedExpected.length ? normalizedExpected : normalizedActual;
    if (longer.length === 0)
        return true;
    const editDistance = levenshteinDistance(normalizedActual, normalizedExpected);
    const similarity = 1 - editDistance / longer.length;
    return similarity >= 0.7;
};
const levenshteinDistance = (str1, str2) => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
    for (let i = 0; i <= str1.length; i++)
        matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++)
        matrix[j][0] = j;
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
        }
    }
    return matrix[str2.length][str1.length];
};
const isIncludedWithTolerance = (actual, expected, maxDiff = 2) => {
    if (!expected)
        return true;
    if (!actual)
        return false;
    const normActual = normalize(actual);
    const normExpected = normalize(expected);
    if (normActual.includes(normExpected))
        return true;
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
exports.isIncludedWithTolerance = isIncludedWithTolerance;
//# sourceMappingURL=checkMe.utils.js.map