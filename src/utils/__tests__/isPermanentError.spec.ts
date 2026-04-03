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
});
