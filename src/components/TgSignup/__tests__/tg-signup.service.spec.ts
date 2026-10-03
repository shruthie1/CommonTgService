import { BadRequestException } from '@nestjs/common';

const invokeQueue: any[] = [];
const connectQueue: Array<Error | null> = [];
const clientInstances: FakeTelegramClient[] = [];

class SentCodeSuccess {}
class SentCodeTypeApp {}
class SentCodeTypeSms {}
class SentCodeTypeFirebaseSms {}
class SentCodeTypeSetUpEmailRequired {}
class CodeTypeSms {}
class AuthorizationSignUpRequired {}
class SendCode { constructor(public readonly args: any) {} }
class ResendCode { constructor(public readonly args: any) {} }
class SignIn { constructor(public readonly args: any) {} }
class SignUp { constructor(public readonly args: any) {} }
class CheckPassword { constructor(public readonly args: any) {} }
class GetPassword {}
class CodeSettings { constructor(public readonly args: any) {} }

class StringSession {
    public dc?: { dcId: number; ip: string; port: number };
    constructor(public readonly value: string) {}
    setDC(dcId: number, ip: string, port: number) {
        this.dc = { dcId, ip, port };
    }
}
class AcceptTermsOfService { constructor(public readonly args: any) {} }

class FakeTelegramClient {
    public connected = false;
    public readonly session: { save: jest.Mock<string, []>; dcId?: number };
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
            if (typeof next === 'function') return next(this);
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
        SentCodeTypeSms,
        SentCodeTypeFirebaseSms,
        SentCodeTypeSetUpEmailRequired,
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
    help: { AcceptTermsOfService },
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
    const services: TgSignupService[] = [];

    beforeEach(() => {
        services.length = 0;
        resetQueues();
        generateTGConfigMock.mockReset();
        computeCheckMock.mockReset();
        getActiveSignupSessions().clear();
        (TgSignupService as any).rejectCache?.clear();
        (TgSignupService as any).homeDcByPrefix?.clear();
    });

    afterEach(async () => {
        await Promise.all(services.map(service => service.onModuleDestroy()));
        for (const session of getActiveSignupSessions().values()) {
            clearTimeout(session.timeoutId);
            await session.client.destroy().catch(() => undefined);
        }
        getActiveSignupSessions().clear();
        jest.clearAllMocks();
    });

    function makeService(usersServiceOverrides: any = {}) {
        const service = new TgSignupService({
            create: jest.fn().mockResolvedValue(undefined),
            ...usersServiceOverrides,
        } as any);
        services.push(service);
        return service;
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
            codeType: 'app',
            message: 'Code sent to your Telegram App',
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
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp(), nextType: new CodeTypeSms() });

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
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp(), nextType: new CodeTypeSms() });

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

    test('2FA login surfaces a downstream persist failure instead of mislabelling it as a wrong password', async () => {
        // SignIn -> SESSION_PASSWORD_NEEDED, GetPassword + CheckPassword succeed with a valid user,
        // but usersService.create rejects (e.g. E11000 duplicate). The password WAS correct, so the
        // error must NOT be reported as "Incorrect 2FA password".
        mockConfig();
        computeCheckMock.mockResolvedValue('computed-password-check');
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const duplicateError: any = new Error('E11000 duplicate key error collection: users');
        duplicateError.code = 11000;
        const usersService = { create: jest.fn().mockRejectedValue(duplicateError) };
        const service = makeService(usersService);
        await service.sendCode('+919999000048');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
            .mockImplementationOnce(async () => ({ srp: 'params' }))
            .mockImplementationOnce(async () => ({
                user: {
                    phone: '919999000048',
                    id: 'tg-48',
                    firstName: 'User48',
                    lastName: '',
                    username: 'user48',
                },
            }));

        const error = await service.verifyCode('+919999000048', '12345', 'correct-password').catch(e => e);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).not.toContain('Incorrect 2FA password');
        expect(usersService.create).toHaveBeenCalled();
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

    test('cleanupStaleSessions swallows errors thrown while inspecting a session', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000020');

        const session = getActiveSignupSessions().get('919999000020');
        // Make `session.client.connected` getter throw to hit the catch branch.
        Object.defineProperty(session, 'client', {
            get() { throw new Error('inspect boom'); },
            configurable: true,
        });
        session.lastActivityAt = Date.now() - 301000;

        await expect((service as any).cleanupStaleSessions()).resolves.toBeUndefined();
        // Session remains since disconnect never ran (error caught).
        expect(getActiveSignupSessions().has('919999000020')).toBe(true);
        // Restore so afterEach cleanup does not blow up.
        delete (session as any).client;
        getActiveSignupSessions().delete('919999000020');
    });

    test('onModuleDestroy disconnects all active signup sessions', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-b', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000021');
        await service.sendCode('+919999000022');

        const client1 = clientInstances[0];
        const client2 = clientInstances[1];

        await service.onModuleDestroy();

        expect(client1.destroy).toHaveBeenCalled();
        expect(client2.destroy).toHaveBeenCalled();
        expect(getActiveSignupSessions().size).toBe(0);
    });

    test('disconnectClient logs a warning when destroy throws but still removes the session', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000023');

        const session = getActiveSignupSessions().get('919999000023');
        session.client.destroy.mockRejectedValueOnce(new Error('destroy failed'));

        await (service as any).disconnectClient('919999000023');

        expect(getActiveSignupSessions().has('919999000023')).toBe(false);
    });

    test('sendCode maps PHONE_NUMBER_INVALID errors to a user-facing message', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeError({ errorMessage: 'PHONE_NUMBER_INVALID' });

        const service = makeService();
        await expect(service.sendCode('+919999000024')).rejects.toThrow('Please enter a valid phone number');
    });

    test('sendCode falls back to generic OTP error for unknown failures', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeError({ errorMessage: 'SOMETHING_WEIRD' });

        const service = makeService();
        await expect(service.sendCode('+919999000025')).rejects.toThrow('Unable to send OTP. Please try again');
    });

    test('mapSentCodeResult throws when Telegram returns an immediate SentCodeSuccess', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult(new SentCodeSuccess());

        const service = makeService();
        await expect(service.sendCode('+919999000026')).rejects.toThrow('Unexpected immediate login');
    });

    test('verifyCode completes a non-2FA SignIn straight through processLoginResult', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = { create: jest.fn().mockResolvedValue(undefined) };
        const service = makeService(usersService);
        await service.sendCode('+919999000027');

        queueInvokeResult({
            user: {
                phone: '919999000027',
                id: 'tg-27',
                firstName: 'User27',
                lastName: '',
                username: 'user27',
            },
        });

        const result = await service.verifyCode('+919999000027', '12345');

        expect(result).toEqual({
            status: 200,
            message: 'Registration successful',
            session: 'signup-session-1',
        });
        expect(usersService.create).toHaveBeenCalledWith(
            expect.objectContaining({ mobile: '919999000027', tgId: 'tg-27', twoFA: false }),
        );
    });

    test('verifyCode wraps generic SignIn failures as a verification error', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000028');

        clientInstances[0].invoke.mockImplementationOnce(async () => {
            throw { errorMessage: 'SOME_OTHER_ERROR', message: 'weird' };
        });

        await expect(service.verifyCode('+919999000028', '12345')).rejects.toThrow('Verification failed. Please try again.');
    });

    test('handle2FALogin rejects with 2FA-required when CheckPassword response lacks a user (no password edge)', async () => {
        // Exercises the `!signInResult.user` branch in handle2FALogin via empty CheckPassword result.
        mockConfig();
        computeCheckMock.mockResolvedValue('computed');
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000029');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
            .mockImplementationOnce(async () => ({ srp: 'params' }))
            .mockImplementationOnce(async () => ({})); // no user

        await expect(service.verifyCode('+919999000029', '12345', 'pw')).rejects.toThrow('Incorrect 2FA password');
    });

    test('handleNewUserRegistration rejects when SignUp returns no user', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000030');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => new AuthorizationSignUpRequired())
            .mockImplementationOnce(async () => ({})); // SignUp result without user

        await expect(service.verifyCode('+919999000030', '12345')).rejects.toThrow(BadRequestException);
    });

    test('processLoginResult rejects outright when handed an empty session string', async () => {
        // Direct unit-level guard: a present user but blank session string is invalid input,
        // surfacing as a server-side failure without ever calling the users service.
        const usersService = { create: jest.fn().mockResolvedValue(undefined) };
        const service = makeService(usersService);

        await expect((service as any).processLoginResult({ phone: '919999000047', id: 'tg-47' }, ''))
            .rejects.toThrow('Failed to complete registration');
        expect(usersService.create).not.toHaveBeenCalled();
    });

    test('processLoginResult rejects when registered user is missing mobile/tgId', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = { create: jest.fn().mockResolvedValue(undefined) };
        const service = makeService(usersService);
        await service.sendCode('+919999000031');

        // SignIn succeeds but user has no phone/id -> processLoginResult validation fails.
        queueInvokeResult({ user: { firstName: 'NoIds' } });

        await expect(service.verifyCode('+919999000031', '12345')).rejects.toThrow(BadRequestException);
        expect(usersService.create).not.toHaveBeenCalled();
    });

    test('processLoginResult propagates downstream create failures as a server-side error', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = { create: jest.fn().mockRejectedValue(new Error('db down')) };
        const service = makeService(usersService);
        await service.sendCode('+919999000032');

        queueInvokeResult({
            user: { phone: '919999000032', id: 'tg-32', firstName: 'U', lastName: '', username: '' },
        });

        // processLoginResult wraps the create failure as InternalServerErrorException, which
        // bubbles into verifyCode's inner catch and surfaces as the generic verification error.
        await expect(service.verifyCode('+919999000032', '12345')).rejects.toThrow('Verification failed. Please try again.');
        expect(usersService.create).toHaveBeenCalled();
    });

    test('verifyCode rejects when SignIn returns a falsy authorization', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000040');

        // SignIn resolves to null -> `!signInResult` guard trips, wrapped as verification error.
        queueInvokeResult(null);

        await expect(service.verifyCode('+919999000040', '12345')).rejects.toThrow('Verification failed. Please try again.');
    });

    test('verifyCode wraps a SignIn that yields an empty session string as a verification error', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = { create: jest.fn().mockResolvedValue(undefined) };
        const service = makeService(usersService);
        await service.sendCode('+919999000041');

        // Telegram returns a valid user, but session.save() yields '' -> sessionString guard trips.
        clientInstances[0].session.save.mockReturnValue('');
        queueInvokeResult({
            user: { phone: '919999000041', id: 'tg-41', firstName: 'U', lastName: '', username: '' },
        });

        await expect(service.verifyCode('+919999000041', '12345')).rejects.toThrow('Verification failed. Please try again.');
        expect(usersService.create).not.toHaveBeenCalled();
    });

    test('handle2FALogin surfaces a post-auth empty-session-string failure as a generic verification error, not a wrong password', async () => {
        // CheckPassword SUCCEEDS (password was correct) but session.save() yields '' afterwards.
        // This is a downstream failure, so it must NOT be reported as "Incorrect 2FA password".
        mockConfig();
        computeCheckMock.mockResolvedValue('computed');
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000042');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
            .mockImplementationOnce(async () => ({ srp: 'params' }))
            .mockImplementationOnce(async () => ({ user: { phone: '919999000042', id: 'tg-42' } }));
        // session.save() returns '' after a successful CheckPassword -> sessionString guard trips.
        clientInstances[0].session.save.mockReturnValue('');

        const error = await service.verifyCode('+919999000042', '12345', 'pw-42').catch(e => e);
        expect(error.message).not.toContain('Incorrect 2FA password');
        // The real downstream cause surfaces instead of a bogus password error.
        expect(error.message).toBe('Failed to generate session string');
    });

    test('handle2FALogin surfaces "2FA password required" when invoked without a password', async () => {
        // Direct unit-level scenario: handle2FALogin is reached with an empty password,
        // so the catch branch maps the failure to the password-required message.
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000043');
        const session = getActiveSignupSessions().get('919999000043');

        // GetPassword invoke throws -> caught with falsy password -> "2FA password required".
        session.client.invoke.mockRejectedValueOnce(new Error('srp failed'));

        await expect((service as any).handle2FALogin('919999000043', session.client, ''))
            .rejects.toThrow('2FA password required');
    });

    test('handleNewUserRegistration rejects when SignUp yields an empty session string', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000044');

        clientInstances[0].invoke
            .mockImplementationOnce(async () => new AuthorizationSignUpRequired())
            .mockImplementationOnce(async () => ({ user: { phone: '919999000044', id: 'tg-44' } }));
        // session.save() returns '' so the new-user sessionString guard trips.
        clientInstances[0].session.save.mockReturnValue('');

        await expect(service.verifyCode('+919999000044', '12345')).rejects.toThrow(BadRequestException);
    });

    test('verifyCode disconnects the session when the outer catch sees a "Connection failed" error', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const service = makeService();
        await service.sendCode('+919999000045');

        const session = getActiveSignupSessions().get('919999000045');
        session.client.connected = false;
        // ensureConnectedClient reconnect throws with a "Connection failed" message; rebuild also fails,
        // so the error escapes to verifyCode's outer catch which then disconnects the session.
        queueConnectFailure('Connection failed');
        queueConnectFailure('Connection failed');

        await expect(service.verifyCode('+919999000045', '12345')).rejects.toThrow('Connection failed');
        expect(getActiveSignupSessions().has('919999000045')).toBe(false);
    });

    test('processLoginResult rethrows a BadRequestException raised by the users service create', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        // usersService.create throws a BadRequestException -> processLoginResult rethrows it as-is.
        const usersService = { create: jest.fn().mockRejectedValue(new BadRequestException('duplicate user')) };
        const service = makeService(usersService);
        await service.sendCode('+919999000046');

        queueInvokeResult({
            user: { phone: '919999000046', id: 'tg-46', firstName: 'U', lastName: '', username: '' },
        });

        // The BadRequestException bubbles through processLoginResult; verifyCode's inner catch then
        // re-wraps non-OTP/2FA failures as the generic verification error.
        await expect(service.verifyCode('+919999000046', '12345')).rejects.toThrow('Verification failed. Please try again.');
        expect(usersService.create).toHaveBeenCalled();
    });

    test('ensureConnectedClient takes the already-connected fast path on verify', async () => {
        mockConfig();
        queueConnectSuccess();
        queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        const usersService = { create: jest.fn().mockResolvedValue(undefined) };
        const service = makeService(usersService);
        await service.sendCode('+919999000033');

        const session = getActiveSignupSessions().get('919999000033');
        session.client.connected = true;
        const connectCallsBefore = clientInstances[0].connect.mock.calls.length;

        queueInvokeResult({
            user: { phone: '919999000033', id: 'tg-33', firstName: 'U', lastName: '', username: '' },
        });

        const result = await service.verifyCode('+919999000033', '12345');
        expect(result.status).toBe(200);
        // No additional connect call because client was already connected.
        expect(clientInstances[0].connect.mock.calls.length).toBe(connectCallsBefore);
    });
    describe('scenario coverage', () => {
        test('resend with no alternative channel re-requests on the same client instead of rebuilding', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000101');

            queueInvokeResult({ phoneCodeHash: 'hash-b', type: new SentCodeTypeApp() });
            const resent = await service.sendCode('+919999000101');

            expect(resent.phoneCodeHash).toBe('hash-b');
            expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
            expect(clientInstances).toHaveLength(1);
            expect(clientInstances[0].invoke.mock.calls[1][0]).toBeInstanceOf(SendCode);
        });

        test('resend inside Telegram cooldown returns the existing code without calling Telegram', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp(), nextType: new CodeTypeSms(), timeout: 60 });
            const service = makeService();
            await service.sendCode('+919999000102');

            const again = await service.sendCode('+919999000102');

            expect(again.phoneCodeHash).toBe('hash-a');
            expect(again.resendAfter).toBeGreaterThan(0);
            expect(again.resendAfter).toBeLessThanOrEqual(60);
            expect(clientInstances[0].invoke).toHaveBeenCalledTimes(1);
        });

        test('concurrent send-code for the same phone shares one Telegram request and one session', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();

            const [a, b] = await Promise.all([
                service.sendCode('+919999000103'),
                service.sendCode('+919999000103'),
            ]);

            expect(a.phoneCodeHash).toBe('hash-a');
            expect(b.phoneCodeHash).toBe('hash-a');
            expect(clientInstances).toHaveLength(1);
            expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
        });

        test('an old session timer does not tear down a newer session for the same phone', async () => {
            jest.useFakeTimers();
            try {
                mockConfig();
                queueConnectSuccess();
                queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
                const service = makeService();
                await service.sendCode('+919999000104');
                const first = getActiveSignupSessions().get('919999000104');

                const replacement = { ...first, timeoutId: undefined };
                getActiveSignupSessions().set('919999000104', replacement);
                jest.advanceTimersByTime(300001);
                await Promise.resolve();

                expect(getActiveSignupSessions().get('919999000104')).toBe(replacement);
                getActiveSignupSessions().delete('919999000104');
            } finally {
                jest.useRealTimers();
            }
        });

        test('FloodWaitError (errorMessage FLOOD + seconds) maps to a real wait and short-circuits the next send', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'FLOOD', seconds: 7200 });
            const service = makeService();

            await expect(service.sendCode('+919999000105')).rejects.toThrow('Please try again in 2 hours');
            await expect(service.sendCode('+919999000105')).rejects.toThrow('Please try again in 2 hours');
            expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
            expect(clientInstances).toHaveLength(1);
        });

        test('banned numbers are cached so a retry does not open another Telegram connection', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'PHONE_NUMBER_BANNED' });
            const service = makeService();

            await expect(service.sendCode('+919999000106')).rejects.toThrow('banned');
            await expect(service.sendCode('+919999000106')).rejects.toThrow('banned');
            expect(clientInstances).toHaveLength(1);
        });

        test('a failed fresh send destroys its Telegram client', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'SOMETHING_WEIRD' });
            const service = makeService();

            await expect(service.sendCode('+919999000107')).rejects.toThrow('Unable to send OTP');
            expect(clientInstances[0].destroy).toHaveBeenCalled();
            expect(getActiveSignupSessions().has('919999000107')).toBe(false);
        });

        test('PHONE_NUMBER_FLOOD gets its own message', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'PHONE_NUMBER_FLOOD' });
            const service = makeService();
            await expect(service.sendCode('+919999000108')).rejects.toThrow('Too many code requests');
        });

        test('SetUpEmailRequired is rejected with an actionable message', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeSetUpEmailRequired() });
            const service = makeService();
            await expect(service.sendCode('+919999000109')).rejects.toThrow('login email');
        });

        test('firebase_sms delivery is switched to the next channel immediately', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeFirebaseSms(), nextType: new CodeTypeSms() });
            queueInvokeResult({ phoneCodeHash: 'hash-b', type: new SentCodeTypeSms() });
            const service = makeService();

            const result = await service.sendCode('+919999000110');

            expect(result.phoneCodeHash).toBe('hash-b');
            expect(result.codeType).toBe('sms');
            expect(result.message).toBe('Code sent via SMS');
            expect(clientInstances[0].invoke.mock.calls[1][0]).toBeInstanceOf(ResendCode);
        });

        test('phone normalisation accepts spaces, dashes and 00 prefix', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('0091 99990-00111');
            expect(getActiveSignupSessions().has('919999000111')).toBe(true);
        });

        test('code length follows what Telegram reported', async () => {
            mockConfig();
            queueConnectSuccess();
            const sms = Object.assign(new SentCodeTypeSms(), { length: 6 });
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: sms });
            const service = makeService();
            const sent = await service.sendCode('+919999000112');
            expect(sent.codeLength).toBe(6);

            await expect(service.verifyCode('+919999000112', '12345')).rejects.toThrow('Code must be exactly 6 digits');
            expect(clientInstances[0].invoke).toHaveBeenCalledTimes(1);
        });

        test('expired code drops the session and tells the frontend the session expired', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000113');

            clientInstances[0].invoke.mockImplementationOnce(async () => { throw { errorMessage: 'PHONE_CODE_EXPIRED' }; });

            const error = await service.verifyCode('+919999000113', '12345').catch(e => e);
            expect(error.message.toLowerCase()).toContain('session expired');
            expect(getActiveSignupSessions().has('919999000113')).toBe(false);
        });

        test('invalid code keeps the session so the user can retry', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000114');

            clientInstances[0].invoke.mockImplementationOnce(async () => { throw { errorMessage: 'PHONE_CODE_INVALID' }; });
            await expect(service.verifyCode('+919999000114', '12345')).rejects.toThrow('Invalid OTP');
            expect(getActiveSignupSessions().has('919999000114')).toBe(true);
        });

        test('2FA step: returns the hint, then the password retry skips SignIn', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const usersService = { create: jest.fn().mockResolvedValue(undefined) };
            const service = makeService(usersService);
            await service.sendCode('+919999000115');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'p1', hint: 'pet name' }));

            const first = await service.verifyCode('+919999000115', '12345');
            expect(first).toEqual({ status: 400, message: 'Two-factor authentication required', requires2FA: true, passwordHint: 'pet name' });

            clientInstances[0].invoke
                .mockImplementationOnce(async () => ({ srp: 'p2' }))
                .mockImplementationOnce(async () => ({ user: { phone: '919999000115', id: 'tg-115' } }));

            const second = await service.verifyCode('+919999000115', '12345', 'pw');
            expect(second.status).toBe(200);
            const requests = clientInstances[0].invoke.mock.calls.map(c => c[0]);
            expect(requests.filter(r => r instanceof SignIn)).toHaveLength(1);
            expect(computeCheckMock).toHaveBeenCalledWith({ srp: 'p2' }, 'pw');
        });

        test('wrong 2FA password keeps the session for another attempt', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000116');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'p1' }))
                .mockImplementationOnce(async () => { throw { errorMessage: 'PASSWORD_HASH_INVALID' }; });

            await expect(service.verifyCode('+919999000116', '12345', 'bad')).rejects.toThrow('Incorrect 2FA password');
            expect(getActiveSignupSessions().get('919999000116')?.stage).toBe('awaiting_password');
        });

        test('SRP_ID_INVALID refetches password params once and succeeds', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000117');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'stale' }))
                .mockImplementationOnce(async () => { throw { errorMessage: 'SRP_ID_INVALID' }; })
                .mockImplementationOnce(async () => ({ srp: 'fresh' }))
                .mockImplementationOnce(async () => ({ user: { phone: '919999000117', id: 'tg-117' } }));

            const result = await service.verifyCode('+919999000117', '12345', 'pw');
            expect(result.status).toBe(200);
            expect(computeCheckMock).toHaveBeenLastCalledWith({ srp: 'fresh' }, 'pw');
        });

        test('PHONE_PASSWORD_FLOOD is reported as too many attempts, not a wrong password', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000118');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'p1' }))
                .mockImplementationOnce(async () => { throw { errorMessage: 'PHONE_PASSWORD_FLOOD' }; });

            await expect(service.verifyCode('+919999000118', '12345', 'pw')).rejects.toThrow('Too many password attempts');
        });

        test('PHONE_NUMBER_UNOCCUPIED on SignIn falls through to SignUp', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const usersService = { create: jest.fn().mockResolvedValue(undefined) };
            const service = makeService(usersService);
            await service.sendCode('+919999000119');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'PHONE_NUMBER_UNOCCUPIED' }; })
                .mockImplementationOnce(async () => ({ user: { phone: '919999000119', id: 'tg-119' } }));

            const result = await service.verifyCode('+919999000119', '12345');
            expect(result.status).toBe(200);
            expect(clientInstances[0].invoke.mock.calls[2][0]).toBeInstanceOf(SignUp);
        });

        test('FIRSTNAME_INVALID on SignUp retries with a plain name', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000120');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => new AuthorizationSignUpRequired())
                .mockImplementationOnce(async () => { throw { errorMessage: 'FIRSTNAME_INVALID' }; })
                .mockImplementationOnce(async () => ({ user: { phone: '919999000120', id: 'tg-120' } }));

            const result = await service.verifyCode('+919999000120', '12345');
            expect(result.status).toBe(200);
            expect(clientInstances[0].invoke.mock.calls[3][0].args.firstName).toBe('User');
        });

        test('signup clients never sleep through flood waits inside the HTTP request', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });
            const service = makeService();
            await service.sendCode('+919999000121');
            expect(clientInstances[0].params.floodSleepThreshold).toBeLessThanOrEqual(3);
            expect(clientInstances[0].params.deviceModel).toBe('device-a');
        });
    });
    describe('branch coverage', () => {
        const SENT_APP = () => ({ phoneCodeHash: 'hash-a', type: new SentCodeTypeApp() });

        test('learns the home DC from a send and routes the next fresh connect for that prefix there', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult((client: FakeTelegramClient) => { client.session.dcId = 5; return SENT_APP(); });
            const service = makeService();
            await service.sendCode('+919999000201');
            expect((TgSignupService as any).homeDcByPrefix.get('919')).toBe(5);
            expect(clientInstances[0].stringSession.dc).toBeUndefined();

            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            await service.sendCode('+919999000202');
            expect((clientInstances[1].stringSession as StringSession).dc).toEqual({ dcId: 5, ip: '91.108.56.130', port: 80 });
        });

        test('DC routing is off when TG_SIGNUP_DC_ROUTING=false', async () => {
            process.env.TG_SIGNUP_DC_ROUTING = 'false';
            try {
                (TgSignupService as any).homeDcByPrefix.set('919', 5);
                mockConfig();
                queueConnectSuccess();
                queueInvokeResult((client: FakeTelegramClient) => { client.session.dcId = 2; return SENT_APP(); });
                const service = makeService();
                await service.sendCode('+919999000203');
                expect(clientInstances[0].stringSession.dc).toBeUndefined();
                expect((TgSignupService as any).homeDcByPrefix.get('919')).toBe(5);
            } finally {
                delete process.env.TG_SIGNUP_DC_ROUTING;
            }
        });

        test('an unknown DC id is never learned', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult((client: FakeTelegramClient) => { client.session.dcId = 99; return SENT_APP(); });
            const service = makeService();
            await service.sendCode('+919999000204');
            expect((TgSignupService as any).homeDcByPrefix.size).toBe(0);
        });

        test('reject cache entries expire, and cleanup prunes expired ones', async () => {
            const cache: Map<string, any> = (TgSignupService as any).rejectCache;
            cache.set('919999000205', { until: Date.now() - 1, message: 'old' });
            cache.set('919999000206', { until: Date.now() - 1, message: 'old' });
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();

            const sent = await service.sendCode('+919999000205');
            expect(sent.phoneCodeHash).toBe('hash-a');
            expect(cache.has('919999000205')).toBe(false);

            await (service as any).cleanupStaleSessions();
            expect(cache.has('919999000206')).toBe(false);
        });

        test('reject cache evicts the oldest entry when full, and ignores zero TTLs', () => {
            const cache: Map<string, any> = (TgSignupService as any).rejectCache;
            for (let i = 0; i < 5000; i++) cache.set(`p${i}`, { until: Date.now() + 60000, message: 'x' });
            const service = makeService();
            (service as any).rememberRejection('newest', 'msg', 1000);
            expect(cache.size).toBe(5000);
            expect(cache.has('p0')).toBe(false);
            expect(cache.has('newest')).toBe(true);

            (service as any).rememberRejection('zero', 'msg', 0);
            expect(cache.has('zero')).toBe(false);
        });

        test('SentCodePaymentRequired is rejected with an actionable message', async () => {
            class SentCodePaymentRequired { phoneCodeHash = 'hash-a'; }
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(new SentCodePaymentRequired());
            const service = makeService();
            await expect(service.sendCode('+919999000207')).rejects.toThrow('official Telegram app');
            expect(clientInstances[0].destroy).toHaveBeenCalled();
        });

        test('a SentCode without phoneCodeHash is a generic send failure', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ type: new SentCodeTypeApp() });
            const service = makeService();
            await expect(service.sendCode('+919999000208')).rejects.toThrow('Unable to send OTP. Please try again');
            expect(getActiveSignupSessions().has('919999000208')).toBe(false);
        });

        test('SEND_CODE_UNAVAILABLE gets its own message', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'SEND_CODE_UNAVAILABLE' });
            const service = makeService();
            await expect(service.sendCode('+919999000209')).rejects.toThrow('No more ways to resend');
        });

        test('rejected app credentials fall back to the generic message', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'API_ID_INVALID' });
            const service = makeService();
            await expect(service.sendCode('+919999000210')).rejects.toThrow('Unable to send OTP. Please try again');
        });

        test('a terminal error during resend does not open a fresh connection', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ ...SENT_APP(), nextType: new CodeTypeSms() });
            const service = makeService();
            await service.sendCode('+919999000211');

            queueInvokeError({ errorMessage: 'FLOOD', seconds: 30 });
            await expect(service.sendCode('+919999000211')).rejects.toThrow('Please wait a few minutes before trying again');
            expect(generateTGConfigMock).toHaveBeenCalledTimes(1);
            expect(clientInstances).toHaveLength(1);
            // The code already delivered is still valid, so the session survives a flood on resend.
            expect(getActiveSignupSessions().has('919999000211')).toBe(true);
        });

        test('a ban during resend drops the session', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ ...SENT_APP(), nextType: new CodeTypeSms() });
            const service = makeService();
            await service.sendCode('+919999000230');

            queueInvokeError({ errorMessage: 'PHONE_NUMBER_BANNED' });
            await expect(service.sendCode('+919999000230')).rejects.toThrow('banned');
            expect(getActiveSignupSessions().has('919999000230')).toBe(false);
        });

        test('a failed connect on a fresh send destroys the client', async () => {
            mockConfig();
            queueConnectFailure('dc unreachable');
            const service = makeService();
            await expect(service.sendCode('+919999000231')).rejects.toThrow('Unable to send OTP. Please try again');
            expect(clientInstances[0].destroy).toHaveBeenCalled();
            expect(getActiveSignupSessions().has('919999000231')).toBe(false);
        });

        test('DC routing is skipped for IPv6/WSS transports', async () => {
            (TgSignupService as any).homeDcByPrefix.set('919', 5);
            generateTGConfigMock.mockResolvedValue({ apiId: 1001, apiHash: 'hash-1', params: { deviceModel: 'device-a', useWSS: true } });
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000232');
            expect(clientInstances[0].stringSession.dc).toBeUndefined();
        });

        test('flood wait formatting: minutes band', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'FLOOD_WAIT_900' });
            const service = makeService();
            await expect(service.sendCode('+919999000212')).rejects.toThrow('Please try again in 15 minutes');
        });

        test('flood wait formatting: singular hour', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeError({ errorMessage: 'FLOOD', seconds: 3600 });
            const service = makeService();
            await expect(service.sendCode('+919999000213')).rejects.toThrow('Please try again in 1 hour');
        });

        test('send-code while awaiting the 2FA password starts a fresh signup', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000214');
            getActiveSignupSessions().get('919999000214').stage = 'awaiting_password';

            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-new', type: new SentCodeTypeApp() });
            const sent = await service.sendCode('+919999000214');

            expect(sent.phoneCodeHash).toBe('hash-new');
            expect(clientInstances).toHaveLength(2);
            expect(clientInstances[0].destroy).toHaveBeenCalled();
            expect(getActiveSignupSessions().get('919999000214').stage).toBe('code_sent');
        });

        test('firebase_sms stays as-is when switching channels fails', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeFirebaseSms(), nextType: new CodeTypeSms() });
            queueInvokeError({ errorMessage: 'SEND_CODE_UNAVAILABLE' });
            const service = makeService();
            const result = await service.sendCode('+919999000215');
            expect(result.codeType).toBe('firebase_sms');
            expect(result.phoneCodeHash).toBe('hash-a');
        });

        test('password step without a password re-asks for it without calling Telegram', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000216');
            const session = getActiveSignupSessions().get('919999000216');
            session.stage = 'awaiting_password';
            session.passwordHint = 'h';
            session.client.connected = true;

            const result = await service.verifyCode('+919999000216', 'anything');
            expect(result).toEqual({ status: 400, message: 'Two-factor authentication required', requires2FA: true, passwordHint: 'h' });
            expect(clientInstances[0].invoke).toHaveBeenCalledTimes(1);
        });

        test('wrong password message includes the hint when one is set', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000217');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'p1', hint: 'city' }))
                .mockImplementationOnce(async () => { throw { errorMessage: 'PASSWORD_HASH_INVALID' }; });

            await expect(service.verifyCode('+919999000217', '12345', 'bad')).rejects.toThrow('Incorrect 2FA password (hint: city)');
        });

        test('GetPassword failure on the 2FA prompt still asks for the password', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000218');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => { throw new Error('getpassword down'); });

            const result = await service.verifyCode('+919999000218', '12345');
            expect(result.requires2FA).toBe(true);
            expect(result.passwordHint).toBeUndefined();
        });

        test('flood during the password check is a wait message', async () => {
            mockConfig();
            computeCheckMock.mockResolvedValue('computed');
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000219');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => { throw { errorMessage: 'SESSION_PASSWORD_NEEDED' }; })
                .mockImplementationOnce(async () => ({ srp: 'p1' }))
                .mockImplementationOnce(async () => { throw { errorMessage: 'FLOOD', seconds: 10 }; });

            await expect(service.verifyCode('+919999000219', '12345', 'pw')).rejects.toThrow('Please wait a few minutes before trying again');
        });

        test('banned number at SignIn drops the session', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000220');

            clientInstances[0].invoke.mockImplementationOnce(async () => { throw { errorMessage: 'PHONE_NUMBER_BANNED' }; });
            await expect(service.verifyCode('+919999000220', '12345')).rejects.toThrow('banned');
            expect(getActiveSignupSessions().has('919999000220')).toBe(false);
        });

        test('flood at SignIn keeps the session and returns a wait message', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000221');

            clientInstances[0].invoke.mockImplementationOnce(async () => { throw { errorMessage: 'FLOOD', seconds: 86400 }; });
            await expect(service.verifyCode('+919999000221', '12345')).rejects.toThrow('Please try again in 24 hours');
            expect(getActiveSignupSessions().has('919999000221')).toBe(true);
        });

        test('AUTH_RESTART at SignIn is reported as an expired session', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000222');

            clientInstances[0].invoke.mockImplementationOnce(async () => { throw { errorMessage: 'AUTH_RESTART' }; });
            const error = await service.verifyCode('+919999000222', '12345').catch(e => e);
            expect(error.message.toLowerCase()).toContain('session expired');
        });

        test('word codes are passed to SignIn verbatim for SmsWord deliveries', async () => {
            class SentCodeTypeSmsWord {}
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult({ phoneCodeHash: 'hash-a', type: new SentCodeTypeSmsWord() });
            const service = makeService();
            const sent = await service.sendCode('+919999000223');
            expect(sent.codeType).toBe('sms_word');

            queueInvokeResult({ user: { phone: '919999000223', id: 'tg-223' } });
            const result = await service.verifyCode('+919999000223', '  Apple  ');
            expect(result.status).toBe(200);
            expect(clientInstances[0].invoke.mock.calls[1][0].args.phoneCode).toBe('Apple');
        });

        test('a word code is rejected for a digit-code delivery', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000224');
            await expect(service.verifyCode('+919999000224', 'apple')).rejects.toThrow('Code must be exactly 5 digits');
        });

        test('codes typed with spaces or dashes are normalised', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000225');
            queueInvokeResult({ user: { phone: '919999000225', id: 'tg-225' } });
            await service.verifyCode('+919999000225', '12-3 45');
            expect(clientInstances[0].invoke.mock.calls[1][0].args.phoneCode).toBe('12345');
        });

        test('sign-up accepts the terms of service when Telegram presents them', async () => {
            mockConfig();
            queueConnectSuccess();
            queueInvokeResult(SENT_APP());
            const service = makeService();
            await service.sendCode('+919999000226');

            clientInstances[0].invoke
                .mockImplementationOnce(async () => Object.assign(new AuthorizationSignUpRequired(), { termsOfService: { id: { data: 'tos-1' } } }))
                .mockImplementationOnce(async () => ({ user: { phone: '919999000226', id: 'tg-226' } }))
                .mockImplementationOnce(async () => { throw new Error('tos failed'); });

            const result = await service.verifyCode('+919999000226', '12345');
            expect(result.status).toBe(200);
            const tos = clientInstances[0].invoke.mock.calls[3][0];
            expect(tos).toBeInstanceOf(AcceptTermsOfService);
            expect(tos.args.id).toEqual({ data: 'tos-1' });
        });

        test('the expiry timer removes the session it was created for', async () => {
            jest.useFakeTimers();
            try {
                mockConfig();
                queueConnectSuccess();
                queueInvokeResult(SENT_APP());
                const service = makeService();
                await service.sendCode('+919999000227');
                const client = clientInstances[0];

                jest.advanceTimersByTime(300001);
                await Promise.resolve();
                await Promise.resolve();

                expect(getActiveSignupSessions().has('919999000227')).toBe(false);
                expect(client.destroy).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        test('a verify waits for an in-flight send for the same phone', async () => {
            mockConfig();
            queueConnectSuccess();
            let release: (value: unknown) => void = () => undefined;
            const gate = new Promise(resolve => { release = resolve; });
            queueInvokeResult(async () => { await gate; return SENT_APP(); });
            const service = makeService();

            const sending = service.sendCode('+919999000228');
            queueInvokeResult({ user: { phone: '919999000228', id: 'tg-228' } });
            const verifying = service.verifyCode('+919999000228', '12345');
            await Promise.resolve();
            release(undefined);

            await sending;
            const result = await verifying;
            expect(result.status).toBe(200);
        });
    });
});
