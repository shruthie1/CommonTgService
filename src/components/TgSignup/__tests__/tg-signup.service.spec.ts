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

    test('handle2FALogin rejects when CheckPassword yields an empty session string', async () => {
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

        await expect(service.verifyCode('+919999000042', '12345', 'pw-42')).rejects.toThrow('Incorrect 2FA password');
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
});
