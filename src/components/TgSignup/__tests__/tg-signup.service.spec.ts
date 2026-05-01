import { BadRequestException } from '@nestjs/common';

const invokeQueue: any[] = [];
const connectQueue: Array<Error | null> = [];
const clientInstances: FakeTelegramClient[] = [];

class SentCodeSuccess {}
class SentCodeTypeApp {}
class AuthorizationSignUpRequired {}
class SendCode { constructor(public readonly args: any) {} }
class ResendCode { constructor(public readonly args: any) {} }
class SignIn { constructor(public readonly args: any) {} }
class SignUp { constructor(public readonly args: any) {} }
class CheckPassword { constructor(public readonly args: any) {} }
class GetPassword {}
class CodeSettings { constructor(public readonly args: any) {} }

class StringSession {
    constructor(public readonly value: string) {}
}

class FakeTelegramClient {
    public connected = false;
    public readonly session: { save: jest.Mock<string, []> };
    public readonly invoke: jest.Mock<Promise<any>, [any]>;
    public readonly connect: jest.Mock<Promise<void>, []>;
    public readonly destroy: jest.Mock<Promise<void>, []>;
    public readonly setLogLevel: jest.Mock<Promise<void>, [any]>;

    constructor(
        public readonly stringSession: StringSession,
        public readonly apiId: number,
        public readonly apiHash: string,
        public readonly params: any,
    ) {
        const defaultSnapshot = stringSession.value || `signup-session-${clientInstances.length + 1}`;
        this.session = {
            save: jest.fn(() => defaultSnapshot),
        };
        this.invoke = jest.fn(async (_req: any) => {
            const next = invokeQueue.shift();
            if (next instanceof Error) throw next;
            if (next?.__throw) throw next.__throw;
            return next;
        });
        this.connect = jest.fn(async () => {
            const next = connectQueue.shift();
            if (next instanceof Error) throw next;
            this.connected = true;
        });
        this.destroy = jest.fn(async () => {
            this.connected = false;
        });
        this.setLogLevel = jest.fn(async (_level: any) => undefined);
        clientInstances.push(this);
    }
}

// Stub classes needed by profile-operations.ts ACTIVE_PRIVACY / DEACTIVATE_PRIVACY at import time
class StubPrivacyKey {}

const sharedApi = {
    auth: {
        SendCode,
        ResendCode,
        SignIn,
        SignUp,
        CheckPassword,
        SentCodeSuccess,
        SentCodeTypeApp,
        AuthorizationSignUpRequired,
    },
    account: {
        GetPassword,
        GetPrivacy: class {},
        SetPrivacy: class {},
        UpdateProfile: class {},
        UpdateUsername: class {},
        CheckUsername: class {},
    },
    CodeSettings,
    InputPrivacyKeyPhoneCall: StubPrivacyKey,
    InputPrivacyKeyProfilePhoto: StubPrivacyKey,
    InputPrivacyKeyForwards: StubPrivacyKey,
    InputPrivacyKeyPhoneNumber: StubPrivacyKey,
    InputPrivacyKeyStatusTimestamp: StubPrivacyKey,
    InputPrivacyKeyChatInvite: StubPrivacyKey,
    InputPrivacyValueAllowAll: StubPrivacyKey,
    InputPrivacyValueAllowContacts: StubPrivacyKey,
    InputPrivacyValueDisallowAll: StubPrivacyKey,
    photos: {
        GetUserPhotos: class {},
        UploadProfilePhoto: class {},
        DeletePhotos: class {},
    },
};

jest.mock('telegram', () => ({
    TelegramClient: FakeTelegramClient,
    Api: sharedApi,
}));

jest.mock('telegram/tl', () => ({
    Api: sharedApi,
}));

jest.mock('telegram/sessions', () => ({
    StringSession,
}));

jest.mock('telegram/extensions/Logger', () => ({
    LogLevel: {
        ERROR: 'error',
    },
}));

const computeCheckMock = jest.fn(async (_passwordSrpResult: any, _password: string) => 'mock-password-check');
jest.mock('telegram/Password', () => ({
    computeCheck: (passwordSrpResult: any, password: string) => computeCheckMock(passwordSrpResult, password),
}));

const generateTGConfigMock = jest.fn();
jest.mock('../../Telegram/utils/generateTGConfig', () => ({
    generateTGConfig: (...args: any[]) => generateTGConfigMock(...args),
}));

import { TgSignupService } from '../tg-signup.service';

function resetQueues() {
    invokeQueue.length = 0;
    connectQueue.length = 0;
    clientInstances.length = 0;
}

function queueConnectSuccess() {
    connectQueue.push(null);
}

function queueConnectFailure(message: string) {
    connectQueue.push(new Error(message));
}

function queueInvokeResult(result: any) {
    invokeQueue.push(result);
}

function queueInvokeError(error: any) {
    invokeQueue.push({ __throw: error });
}

function getActiveSignupSessions(): Map<string, any> {
    return (TgSignupService as any).activeClients;
}

describe('TgSignupService practical flows', () => {
    beforeEach(() => {
        resetQueues();
        generateTGConfigMock.mockReset();
        computeCheckMock.mockReset();
        getActiveSignupSessions().clear();
    });

    afterEach(async () => {
        for (const session of getActiveSignupSessions().values()) {
            clearTimeout(session.timeoutId);
            await session.client.destroy().catch(() => undefined);
        }
        getActiveSignupSessions().clear();
        jest.clearAllMocks();
    });

    function makeService(usersServiceOverrides: any = {}) {
        return new TgSignupService({
            create: jest.fn().mockResolvedValue(undefined),
            ...usersServiceOverrides,
        } as any);
    }

    function mockConfig() {
        generateTGConfigMock.mockResolvedValue({
            apiId: 1001,
            apiHash: 'hash-1',
            params: { deviceModel: 'device-a' },
        });
    }

    test('fresh sendCode creates and caches an active signup session', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        const result = await service.sendCode('+919999000001');

        expect(result).toEqual({
            phoneCodeHash: 'hash-a',
            isCodeViaApp: true,
        });
        expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
        expect(clientInstances).toHaveLength(1);
        expect(getActiveSignupSessions().get('919999000001')).toEqual(
            expect.objectContaining({
                phoneCodeHash: 'hash-a',
                apiId: 1001,
                apiHash: 'hash-1',
                sessionSnapshot: 'signup-session-1',
            }),
        );
    });

    test('sendCode resends through the existing active signup session without regenerating config', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000001');

        queueInvokeResult({ phoneCodeHash: 'hash-b', type: new SentCodeTypeApp() });
        const resent = await service.sendCode('+919999000001');

        expect(resent.phoneCodeHash).toBe('hash-b');
        expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
        expect(clientInstances).toHaveLength(1);
        expect(clientInstances[0].invoke).toHaveBeenCalledTimes(2);
        expect(clientInstances[0].invoke.mock.calls[1][0]).toBeInstanceOf(ResendCode);
        expect(getActiveSignupSessions().get('919999000001')?.phoneCodeHash).toBe('hash-b');
    });

    test('sendCode falls back to a fresh session when resend fails', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000003');

        queueInvokeResult(new Error('resend failed'));
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-c', type: new SentCodeTypeApp() });

        const resent = await service.sendCode('+919999000003');

        expect(resent.phoneCodeHash).toBe('hash-c');
        expect(generateTGConfigMock).toHaveBeenCalledTimes(2);
        expect(clientInstances).toHaveLength(2);
    });

    test('sendCode reuses a disconnected signup session by reconnecting and resending', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000009');

        const existingSession = getActiveSignupSessions().get('919999000009');
        existingSession.client.connected = false;

        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-reused', type: new SentCodeTypeApp() });

        const resent = await service.sendCode('+919999000009');

        expect(resent.phoneCodeHash).toBe('hash-reused');
        expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
        expect(clientInstances).toHaveLength(1);
        expect(clientInstances[0].connect).toHaveBeenCalledTimes(2);
        expect(clientInstances[0].invoke.mock.calls[1][0]).toBeInstanceOf(ResendCode);
    });

    test('sendCode validates phone format before touching Telegram config', async () => {
        const service = makeService();
        await expect(service.sendCode('abcd')).rejects.toThrow('Please enter a valid phone number');
        expect(generateTGConfigMock).not.toHaveBeenCalled();
        expect(clientInstances).toHaveLength(0);
    });

    test('sendCode maps banned number errors to a user-facing message', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeError({ errorMessage: 'PHONE_NUMBER_BANNED' });

        const service = makeService();
        await expect(service.sendCode('+919999000010')).rejects.toThrow('This phone number has been banned from Telegram');
    });

    test('sendCode maps flood wait errors to a user-facing message', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeError({ errorMessage: 'FLOOD_WAIT_120' });

        const service = makeService();
        await expect(service.sendCode('+919999000011')).rejects.toThrow('Please wait a few minutes before trying again');
    });

    test('verifyCode rejects when there is no active signup session', async () => {
        const service = makeService();
        await expect(service.verifyCode('+919999000004', '12345')).rejects.toThrow('Session Expired. Please start again');
    });

    test('verifyCode returns requires2FA when Telegram asks for a password and none is provided', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000005');

        queueInvokeResult({ errorMessage: 'SESSION_PASSWORD_NEEDED' });
        clientInstances[0].invoke.mockImplementationOnce(async () => {
            const next = invokeQueue.shift();
            if (next?.errorMessage) throw next;
            return next;
        });

        const result = await service.verifyCode('+919999000005', '12345');

        expect(result).toEqual({
            status: 400,
            message: 'Two-factor authentication required',
            requires2FA: true,
        });
    });

    test('verifyCode completes 2FA login when password is provided', async () => {
        mockConfig();
        computeCheckMock.mockResolvedValue('computed-password-check');
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = {
            create: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService(usersService);
        await service.sendCode('+919999000012');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
            .mockImplementationOnce(async () => ({ srp: 'params' }))
            .mockImplementationOnce(async () => ({
                user: {
                    phone: '919999000012',
                    id: 'tg-12',
                    firstName: 'User12',
                    lastName: '',
                    username: 'user12',
                },
            }));

        const result = await service.verifyCode('+919999000012', '12345', 'pw-12');

        expect(result).toEqual({
            status: 200,
            message: 'Registration successful',
            session: 'signup-session-1',
        });
        expect(computeCheckMock).toHaveBeenCalledWith({ srp: 'params' }, 'pw-12');
        expect(usersService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mobile: '919999000012',
                session: 'signup-session-1',
                twoFA: true,
                password: 'pw-12',
            }),
        );
    });

    test('verifyCode maps incorrect 2FA password to a user-facing bad request', async () => {
        mockConfig();
        computeCheckMock.mockResolvedValue('computed-password-check');
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000013');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
            .mockImplementationOnce(async () => ({ srp: 'params' }))
            .mockImplementationOnce(async () => { throw new Error('bad password'); });

        await expect(service.verifyCode('+919999000013', '12345', 'wrong-password')).rejects.toThrow('Incorrect 2FA password');
    });

    test('verifyCode rebuilds the signup client from cached config and session snapshot when reconnect fails', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = {
            create: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService(usersService);

        await service.sendCode('+919999000002');
        const storedSession = getActiveSignupSessions().get('919999000002');
        storedSession.client.connected = false;

        queueConnectFailure('reconnect failed');
        queueConnectSuccess();
        queueInvokeResult({
            user: {
                phone: '919999000002',
                id: 'tg-2',
                firstName: 'User',
                lastName: '',
                username: 'user2',
            },
        });

        const result = await service.verifyCode('+919999000002', '12345');

        expect(result.status).toBe(200);
        expect(result.session).toBe('signup-session-1');
        expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
        expect(clientInstances).toHaveLength(2);
        expect(clientInstances[1].stringSession.value).toBe('signup-session-1');
        expect(usersService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mobile: '919999000002',
                session: 'signup-session-1',
            }),
        );
    });

    test('verifyCode maps invalid OTP to a user-facing bad request', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000006');

        clientInstances[0].invoke.mockImplementationOnce(async () => {
            throw { errorMessage: 'PHONE_CODE_INVALID' };
        });

        await expect(service.verifyCode('+919999000006', '12345')).rejects.toThrow('Invalid OTP,  Try again!');
    });

    test('verifyCode completes new-user registration when Telegram requires signup', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = {
            create: jest.fn().mockResolvedValue(undefined),
        };
        const service = makeService(usersService);

        await service.sendCode('+919999000007');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => new AuthorizationSignUpRequired())
            .mockImplementationOnce(async () => ({
                user: {
                    phone: '919999000007',
                    id: 'tg-7',
                    firstName: 'User7',
                    lastName: '',
                    username: '',
                },
            }));

        const result = await service.verifyCode('+919999000007', '12345');

        expect(result.status).toBe(200);
        expect(result.message).toBe('Registration successful');
        expect(usersService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mobile: '919999000007',
                tgId: 'tg-7',
            }),
        );
    });

    test('verifyCode validates OTP format before hitting Telegram', async () => {
        const service = makeService();
        await expect(service.verifyCode('+919999000008', '12')).rejects.toThrow(BadRequestException);
        expect(generateTGConfigMock).not.toHaveBeenCalled();
        expect(clientInstances).toHaveLength(0);
    });

    test('cleanupStaleSessions removes stale disconnected signup sessions but keeps connected ones', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-b', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000014');
        await service.sendCode('+919999000015');

        const staleSession = getActiveSignupSessions().get('919999000014');
        staleSession.client.connected = false;
        staleSession.lastActivityAt = Date.now() - 301000;

        const activeSession = getActiveSignupSessions().get('919999000015');
        activeSession.client.connected = true;
        activeSession.lastActivityAt = Date.now() - 301000;

        await (service as any).cleanupStaleSessions();

        expect(getActiveSignupSessions().has('919999000014')).toBe(false);
        expect(getActiveSignupSessions().has('919999000015')).toBe(true);
    });
});
