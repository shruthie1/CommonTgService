import { isForeign2faError } from '../isForeign2faError';

describe('isForeign2faError', () => {
    test.each([
        [{ errorMessage: 'PASSWORD_HASH_INVALID' }, true],
        [new Error('400: PASSWORD_HASH_INVALID (caused by account.GetPasswordSettings)'), true],
        ['password_hash_invalid', true],
        [{ errorMessage: 'FLOOD_WAIT_30' }, false],
        [{ errorMessage: 'SRP_ID_INVALID' }, false],
        [{ errorMessage: 'PASSWORD_HASH_INVALIDATED' }, false],
        [{ errorMessage: 'NEW_PASSWORD_HASH_INVALID_X' }, false],
        [null, false],
        [undefined, false],
    ])('%p -> %p', (input, expected) => {
        expect(isForeign2faError(input)).toBe(expected);
    });
});
