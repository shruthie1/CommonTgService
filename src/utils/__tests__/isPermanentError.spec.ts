import isPermanentError from '../isPermanentError';

describe('isPermanentError', () => {
    test.each([
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
    ])('treats %s as permanent when present in the parsed message', (message) => {
        expect(isPermanentError({ message })).toBe(true);
    });

    test('treats permanent raw error messages as permanent too', () => {
        expect(isPermanentError({
            message: 'temporary wrapper',
            error: { errorMessage: 'PHONE_NUMBER_BANNED' },
        })).toBe(true);
    });

    test('treats nested error.message values as permanent too', () => {
        expect(isPermanentError({
            message: 'temporary wrapper',
            error: { message: 'AUTH_KEY_DUPLICATED' },
        })).toBe(true);
    });

    test('does not treat INPUT_USER_DEACTIVATED as permanent', () => {
        expect(isPermanentError({ message: 'INPUT_USER_DEACTIVATED' })).toBe(false);
    });

    test('does not treat unknown errors as permanent', () => {
        expect(isPermanentError({ message: 'NETWORK_ERROR' })).toBe(false);
    });

    test('does not treat retryable flood waits as permanent', () => {
        expect(isPermanentError({ message: 'FLOOD_WAIT_120' })).toBe(false);
    });

    // ── Regression: raw-branch recoverable-override bug ──
    // Previously the raw-error branch matched permanent tokens against the RAW
    // message but checked the INPUT_USER_DEACTIVATED exclusion against the WRAPPER
    // message — so a recoverable raw error with an unrelated wrapper was wrongly
    // classified permanent.
    test('does not treat raw INPUT_USER_DEACTIVATED as permanent even with an unrelated wrapper', () => {
        expect(isPermanentError({
            message: 'some unrelated wrapper text',
            error: { errorMessage: 'INPUT_USER_DEACTIVATED' },
        })).toBe(false);
    });

    test('does not treat raw INPUT_USER_DEACTIVATED (error.message form) as permanent', () => {
        expect(isPermanentError({
            message: 'wrapper',
            error: { message: 'INPUT_USER_DEACTIVATED' },
        })).toBe(false);
    });

    // ── Regression: token-boundary matching (no loose substring) ──
    test('does not match a permanent token embedded in a longer identifier', () => {
        // USER_DEACTIVATED is a substring of CUSTOM_USER_DEACTIVATEDX but not a whole token.
        expect(isPermanentError({ message: 'CUSTOM_USER_DEACTIVATEDX happened' })).toBe(false);
    });

    test('matches a permanent token surrounded by non-word characters', () => {
        expect(isPermanentError({ message: 'RPCError 401: USER_DEACTIVATED (the account is gone)' })).toBe(true);
    });

    test('is case-insensitive', () => {
        expect(isPermanentError({ message: 'rpc error: session_revoked' })).toBe(true);
    });

    test('handles missing/empty message safely', () => {
        expect(isPermanentError({ message: '' })).toBe(false);
        expect(isPermanentError({ message: undefined as unknown as string })).toBe(false);
    });
});
