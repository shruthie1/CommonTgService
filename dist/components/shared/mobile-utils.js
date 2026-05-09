"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_MOBILE_REGEX = void 0;
exports.normalizeMobileInput = normalizeMobileInput;
exports.canonicalizeMobile = canonicalizeMobile;
exports.mobilesEqual = mobilesEqual;
exports.CANONICAL_MOBILE_REGEX = /^[1-9]\d{10,14}$/;
function normalizeMobileInput(value) {
    const trimmed = value.trim();
    return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
}
function canonicalizeMobile(value) {
    const normalized = normalizeMobileInput(value);
    if (!exports.CANONICAL_MOBILE_REGEX.test(normalized)) {
        throw new Error('mobile must include country code and contain 11-15 digits');
    }
    return normalized;
}
function mobilesEqual(a, b) {
    if (!a || !b)
        return false;
    try {
        return canonicalizeMobile(a) === canonicalizeMobile(b);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=mobile-utils.js.map