import { Api } from 'telegram';
import {
    stableHash,
    getTelegramCredentialsForMobile,
    getTelegramCredentialPool,
    generateTGConfig,
    generateTGConfigWithProxy,
    getAvailablePlatforms,
    getPlatformConfig,
    getExpectedAuthFingerprint,
    getAuthProtectionReason,
    isAuthAllowlisted,
    isAuthFingerprintMatch,
} from '../tg-config';

function makeAuth(props: Record<string, unknown>): Api.Authorization {
    return Object.assign(Object.create(Api.Authorization.prototype), props) as Api.Authorization;
}

describe('stableHash', () => {
    test('deterministic and order-sensitive', () => {
        expect(stableHash('abc')).toBe(stableHash('abc'));
        expect(stableHash('abc')).not.toBe(stableHash('cba'));
    });
    test('empty string', () => {
        expect(typeof stableHash('')).toBe('number');
    });
});

describe('credentials', () => {
    test('pool has entries and stable selection per mobile', () => {
        const pool = getTelegramCredentialPool();
        expect(pool.length).toBeGreaterThan(0);
        const a = getTelegramCredentialsForMobile('911111');
        const b = getTelegramCredentialsForMobile('911111');
        expect(a).toEqual(b);
        expect(pool).toContainEqual(a);
    });
});

describe('generateTGConfig', () => {
    test('produces deterministic config for android default', () => {
        const c1 = generateTGConfig('918888');
        const c2 = generateTGConfig('918888');
        expect(c1).toEqual(c2);
        expect(c1.langPack).toBe('android');
        expect(c1.deviceModel).toContain('PGA-');
        expect(c1.connectionRetries).toBe(5);
        expect(c1.timeout).toBe(30);
        expect(c1.proxy).toBeUndefined();
    });
    test('throws for unknown platform', () => {
        expect(() => generateTGConfig('9', undefined, { platform: 'symbian' })).toThrow(/Unknown platform/);
    });
    test('honors overrides and proxy', () => {
        const proxy = { ip: '1.2.3.4', port: 1080, socksType: 5 as const };
        const c = generateTGConfig('9', proxy, {
            platform: 'IOS', apiId: 1, apiHash: 'h', langCode: 'fr',
            systemLangCode: 'fr-FR', connectionRetries: 9, requestRetries: 8,
            retryDelay: 7, timeout: 6,
        });
        expect(c.apiId).toBe(1);
        expect(c.apiHash).toBe('h');
        expect(c.langCode).toBe('fr');
        expect(c.systemLangCode).toBe('fr-FR');
        expect(c.connectionRetries).toBe(9);
        expect(c.requestRetries).toBe(8);
        expect(c.retryDelay).toBe(7);
        expect(c.timeout).toBe(6);
        expect(c.langPack).toBe('ios');
        expect(c.proxy).toEqual(proxy);
    });
    test.each(['android', 'ios', 'desktop', 'web', 'macos'])('builds for platform %s', (platform) => {
        const c = generateTGConfig('917777', undefined, { platform });
        expect(c.deviceModel).toBeTruthy();
        expect(c.appVersion).toBeTruthy();
    });
});

describe('generateTGConfigWithProxy', () => {
    test('null proxy yields no proxy', () => {
        const c = generateTGConfigWithProxy('9', null);
        expect(c.proxy).toBeUndefined();
    });
    test('maps proxy config and converts timeout to seconds', () => {
        const c = generateTGConfigWithProxy('9', { host: 'h', port: 9, username: 'u', password: 'p', timeout: 20000 });
        expect(c.proxy).toEqual({ ip: 'h', port: 9, socksType: 5, username: 'u', password: 'p', timeout: 20 });
    });
    test('defaults timeout when not provided', () => {
        const c = generateTGConfigWithProxy('9', { host: 'h', port: 9 });
        expect(c.proxy!.timeout).toBe(10);
    });
});

describe('platform utils', () => {
    test('getAvailablePlatforms', () => {
        expect(getAvailablePlatforms()).toEqual(expect.arrayContaining(['android', 'ios', 'desktop', 'web', 'macos']));
    });
    test('getPlatformConfig', () => {
        expect(getPlatformConfig('ANDROID')?.langPack).toBe('android');
        expect(getPlatformConfig('nope')).toBeUndefined();
    });
    test('getExpectedAuthFingerprint', () => {
        const fp = getExpectedAuthFingerprint('919999');
        const cfg = generateTGConfig('919999');
        expect(fp).toMatchObject({ apiId: cfg.apiId, deviceModel: cfg.deviceModel, platform: 'android' });
    });
});

describe('getAuthProtectionReason', () => {
    test('protects our apiId', () => {
        const ourId = getTelegramCredentialPool()[0].apiId;
        expect(getAuthProtectionReason(makeAuth({ apiId: ourId }))).toBe(`apiId:${ourId}`);
    });
    test('protects allowlisted country', () => {
        expect(getAuthProtectionReason(makeAuth({ country: 'Singapore' }))).toBe('country:singapore');
    });
    test('protects device substring', () => {
        expect(getAuthProtectionReason(makeAuth({ deviceModel: 'My OnePlus 11 Pro' }))).toBe('device_contains:oneplus 11');
    });
    test('protects device suffix', () => {
        expect(getAuthProtectionReason(makeAuth({ deviceModel: 'somephone-ssk' }))).toBe('device_suffix:-ssk');
    });
    test('protects app prefix', () => {
        expect(getAuthProtectionReason(makeAuth({ appName: 'likki app' }))).toBe('app_prefix:lik');
    });
    test('returns null for unprotected', () => {
        expect(getAuthProtectionReason(makeAuth({ appName: 'random', deviceModel: 'foo', country: 'India' }))).toBeNull();
    });
});

describe('isAuthAllowlisted', () => {
    test('true/false', () => {
        expect(isAuthAllowlisted(makeAuth({ country: 'Singapore' }))).toBe(true);
        expect(isAuthAllowlisted(makeAuth({ country: 'India' }))).toBe(false);
    });
});

describe('isAuthFingerprintMatch', () => {
    test('current auth is always a match', () => {
        expect(isAuthFingerprintMatch('9', makeAuth({ current: true }))).toBe(true);
    });
    test('allowlisted auth is a match', () => {
        expect(isAuthFingerprintMatch('9', makeAuth({ current: false, country: 'Singapore' }))).toBe(true);
    });
    test('matches expected device + system version', () => {
        const fp = getExpectedAuthFingerprint('912222');
        expect(isAuthFingerprintMatch('912222', makeAuth({ current: false, deviceModel: fp.deviceModel, systemVersion: fp.systemVersion }))).toBe(true);
    });
    test('non-matching fingerprint returns false', () => {
        expect(isAuthFingerprintMatch('912222', makeAuth({ current: false, deviceModel: 'Other', systemVersion: 'X' }))).toBe(false);
    });
});
