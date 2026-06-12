"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = isPermanentError;
const RECOVERABLE_OVERRIDES = [
    'INPUT_USER_DEACTIVATED',
];
const PERMANENT_ERRORS = [
    'SESSION_REVOKED',
    'AUTH_KEY_UNREGISTERED',
    'AUTH_KEY_DUPLICATED',
    'SESSION_EXPIRED',
    'USER_DEACTIVATED',
    'USER_DEACTIVATED_BAN',
    'PHONE_NUMBER_BANNED',
    'PHONE_NUMBER_INVALID',
    'FROZEN_METHOD_INVALID',
    'FROZEN_PARTICIPANT_MISSING',
];
function containsToken(text, token) {
    if (typeof text !== 'string' || !token)
        return false;
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
    if (RECOVERABLE_OVERRIDES.some(token => containsToken(text, token)))
        return false;
    return PERMANENT_ERRORS.some(token => containsToken(text, token));
}
function isPermanentError(errorDetails) {
    if (classify(errorDetails.message))
        return true;
    const rawMessage = errorDetails.error?.message || errorDetails.error?.errorMessage;
    if (classify(rawMessage))
        return true;
    return false;
}
//# sourceMappingURL=isPermanentError.js.map