import { getAcceptedApiKeys, getApiKey, isAcceptedApiKey, LEGACY_API_KEY } from '../apiKey';

describe('apiKey', () => {
    const saved = { ...process.env };
    afterEach(() => {
        for (const k of ['X_API_KEY', 'API_KEY', 'X_API_KEYS']) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });
    const clear = () => { delete process.env.X_API_KEY; delete process.env.API_KEY; delete process.env.X_API_KEYS; };

    describe('getApiKey (outbound)', () => {
        it('falls back to the legacy key when nothing is configured (today\'s behaviour)', () => {
            clear();
            expect(getApiKey()).toBe(LEGACY_API_KEY);
            expect(LEGACY_API_KEY).toBe('santoor');
        });
        it('prefers X_API_KEY, then API_KEY', () => {
            clear(); process.env.API_KEY = 'b';
            expect(getApiKey()).toBe('b');
            process.env.X_API_KEY = 'a';
            expect(getApiKey()).toBe('a');
        });
    });

    describe('isAcceptedApiKey (inbound)', () => {
        it('accepts the legacy key when nothing is configured', () => {
            clear();
            expect(isAcceptedApiKey('santoor')).toBe(true);
        });
        it('is case-insensitive, as the original guard was', () => {
            clear();
            expect(isAcceptedApiKey('SANTOOR')).toBe(true);
        });
        it('rejects a wrong, empty or missing key', () => {
            clear();
            expect(isAcceptedApiKey('wrong')).toBe(false);
            expect(isAcceptedApiKey('')).toBe(false);
            expect(isAcceptedApiKey(undefined)).toBe(false);
            expect(isAcceptedApiKey(null)).toBe(false);
        });

        // THE LOCKOUT GUARD. CMS copies the configuration collection into process.env LIVE
        // (ConfigurationInit init.service.ts updateConfiguration). If changing X_API_KEY there
        // dropped the legacy key, every fleet process — still sending the old key, and booting
        // with it before it can fetch config — would be rejected at once.
        it('changing X_API_KEY alone NEVER drops the legacy key (no fleet lockout)', () => {
            clear(); process.env.X_API_KEY = 'new-key';
            expect(isAcceptedApiKey('new-key')).toBe(true);
            expect(isAcceptedApiKey('santoor')).toBe(true);
        });

        it('an explicit X_API_KEYS list is authoritative — the only way to retire the legacy key', () => {
            clear(); process.env.X_API_KEY = 'ignored-when-list-set'; process.env.X_API_KEYS = 'k1, K2 ,,';
            expect(isAcceptedApiKey('k1')).toBe(true);
            expect(isAcceptedApiKey('k2')).toBe(true);
            expect(isAcceptedApiKey('santoor')).toBe(false);
            expect(isAcceptedApiKey('ignored-when-list-set')).toBe(false);
        });

        it('a blank X_API_KEYS is treated as unset, never as "accept nothing"', () => {
            clear(); process.env.X_API_KEYS = ' , ';
            expect(getAcceptedApiKeys()).toEqual(['santoor']);
            expect(isAcceptedApiKey('santoor')).toBe(true);
        });
    });
});
