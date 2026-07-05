"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = isDeadChannelError;
const DEAD_CHANNEL_TOKENS = [
    'USERNAME_INVALID',
    'USERNAME_NOT_OCCUPIED',
];
const DEAD_CHANNEL_PHRASES = [
    'no user has',
];
function containsToken(text, token) {
    const haystack = text.toUpperCase();
    const needle = token.toUpperCase();
    let from = 0;
    while (true) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1)
            return false;
        const before = idx === 0 ? '' : haystack[idx - 1];
        const after = idx + needle.length >= haystack.length ? '' : haystack[idx + needle.length];
        const isWordChar = (c) => c !== '' && /[A-Z0-9_]/.test(c);
        if (!isWordChar(before) && !isWordChar(after))
            return true;
        from = idx + 1;
    }
}
function classify(text) {
    if (typeof text !== 'string' || text.trim() === '')
        return false;
    if (DEAD_CHANNEL_TOKENS.some((token) => containsToken(text, token)))
        return true;
    const lower = text.toLowerCase();
    return DEAD_CHANNEL_PHRASES.some((phrase) => lower.includes(phrase));
}
function isDeadChannelError(error) {
    if (error == null)
        return false;
    if (typeof error === 'string')
        return classify(error);
    if (typeof error === 'object') {
        const e = error;
        if (classify(typeof e.errorMessage === 'string' ? e.errorMessage : null))
            return true;
        if (classify(typeof e.message === 'string' ? e.message : null))
            return true;
        if (e.error && classify(typeof e.error.errorMessage === 'string' ? e.error.errorMessage : e.error.message))
            return true;
    }
    return classify(String(error));
}
//# sourceMappingURL=isDeadChannelError.js.map