jest.mock('../../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../utils/logbots', () => ({ notifbot: jest.fn().mockReturnValue('http://bot') }));

const mockNewSessionClient = {
    start: jest.fn().mockResolvedValue(undefined),
    session: { save: jest.fn().mockReturnValue('NEW_SESSION') },
    destroy: jest.fn().mockResolvedValue(undefined),
    getMe: jest.fn().mockResolvedValue({ phone: '900' }),
};
jest.mock('telegram', () => {
    const actual = jest.requireActual('telegram');
    return { ...actual, TelegramClient: jest.fn().mockImplementation(() => mockNewSessionClient) };
});
jest.mock('../../utils/generateTGConfig', () => ({
    generateTGConfig: jest.fn().mockResolvedValue({ apiId: 1, apiHash: 'h', params: {} }),
}));

import { Api } from 'telegram';
import { MailReader } from '../../../../IMap/IMap';
import {
    set2fa,
    isOwnAuth,
    removeOtherAuths,
    getAuths,
    getLastActiveTime,
    hasPassword,
    createNewSession,
    waitForOtp,
    getSessionInfo,
    terminateSession,
} from '../auth-operations';
import * as tgConfig from '../../utils/tg-config';

function makeCtx(client: any) {
    return {
        client,
        phoneNumber: '900',
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as any;
}

function makeAuth(props: Record<string, unknown>): Api.Authorization {
    return Object.assign(Object.create(Api.Authorization.prototype), { hash: { toString: () => 'h' }, ...props });
}

describe('set2fa', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('uses the mailbox exclusively and requests a fresh code with the expected length', async () => {
        const fakeMailReader = {
            runExclusive: jest.fn(async (operation: () => Promise<unknown>) => operation()),
            connectToMail: jest.fn().mockResolvedValue(undefined),
            isMailReady: jest.fn().mockResolvedValue(true),
            getCode: jest
                .fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce('12345'),
            disconnectFromMail: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(fakeMailReader as any);

        const invoke = jest.fn().mockResolvedValue({ hasPassword: false });
        const updateTwoFaSettings = jest.fn(async (options: any) => {
            const codePromise = options.emailCodeCallback(5);
            await jest.advanceTimersByTimeAsync(20_000);
            const code = await codePromise;

            expect(code).toBe('12345');
            expect(fakeMailReader.getCode).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    expectedLength: 5,
                    minReceivedAt: expect.any(Date),
                }),
            );
            expect(fakeMailReader.getCode).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    expectedLength: 5,
                    minReceivedAt: expect.any(Date),
                }),
            );
        });

        const ctx = {
            client: {
                invoke,
                updateTwoFaSettings,
            },
            phoneNumber: '9990001234',
            logger: {
                info: jest.fn(),
                error: jest.fn(),
            },
        } as any;

        const resultPromise = set2fa(ctx);
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(fakeMailReader.runExclusive).toHaveBeenCalledTimes(1);
        expect(fakeMailReader.connectToMail).toHaveBeenCalledWith(30_000);
        expect(fakeMailReader.disconnectFromMail).toHaveBeenCalledTimes(1);
        expect(updateTwoFaSettings).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            email: 'storeslaksmi@gmail.com',
            hint: 'password - India143',
            newPassword: 'Ajtdmwajt1@',
        });
    });

    test('disconnects the mailbox if the Telegram 2FA update fails', async () => {
        const fakeMailReader = {
            runExclusive: jest.fn(async (operation: () => Promise<unknown>) => operation()),
            connectToMail: jest.fn().mockResolvedValue(undefined),
            isMailReady: jest.fn().mockResolvedValue(true),
            getCode: jest.fn(),
            disconnectFromMail: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(fakeMailReader as any);

        const ctx = {
            client: {
                invoke: jest.fn().mockResolvedValue({ hasPassword: false }),
                updateTwoFaSettings: jest.fn().mockRejectedValue(new Error('tg failed')),
            },
            phoneNumber: '9990001235',
            logger: {
                info: jest.fn(),
                error: jest.fn(),
            },
        } as any;

        await expect(set2fa(ctx)).rejects.toThrow('tg failed');
        expect(fakeMailReader.disconnectFromMail).toHaveBeenCalledTimes(1);
    });

    test('onEmailCodeError ABORTS instead of submitting a literal bad code', async () => {
        // GramJS submits whatever onEmailCodeError resolves to as the verification code.
        // Returning a non-empty string ('error') would submit garbage and burn a 2FA attempt
        // (risking too-many-attempts/FLOOD on a precious account). It must reject/abort instead.
        const fakeMailReader = {
            runExclusive: jest.fn(async (operation: () => Promise<unknown>) => operation()),
            connectToMail: jest.fn().mockResolvedValue(undefined),
            isMailReady: jest.fn().mockResolvedValue(true),
            getCode: jest.fn(),
            disconnectFromMail: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(fakeMailReader as any);

        let capturedOnError: (e: Error) => Promise<string>;
        const updateTwoFaSettings = jest.fn(async (options: any) => {
            capturedOnError = options.onEmailCodeError;
        });
        const ctx = {
            client: { invoke: jest.fn().mockResolvedValue({ hasPassword: false }), updateTwoFaSettings },
            phoneNumber: '9990001236',
            logger: { info: jest.fn(), error: jest.fn() },
        } as any;

        const resultPromise = set2fa(ctx);
        await jest.runAllTimersAsync();
        await resultPromise;

        // The callback must NOT resolve to a usable code string; it should reject (abort).
        await expect(capturedOnError!(new Error('PHONE_CODE_INVALID'))).rejects.toBeDefined();
    });

    test('does nothing when password already set', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ hasPassword: true }) });
        const result = await set2fa(ctx);
        expect(result).toBeUndefined();
        expect(ctx.logger.info).toHaveBeenCalledWith('900', 'Password already exists');
    });
});

describe('isOwnAuth', () => {
    test('current auth is always own', () => {
        expect(isOwnAuth('900', makeAuth({ current: true }))).toBe(true);
    });
    test('delegates to fingerprint match otherwise', () => {
        const spy = jest.spyOn(tgConfig, 'isAuthFingerprintMatch').mockReturnValue(true);
        expect(isOwnAuth('900', makeAuth({ current: false }))).toBe(true);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('removeOtherAuths', () => {
    afterEach(() => jest.restoreAllMocks());

    test('throws without client', async () => {
        await expect(removeOtherAuths(makeCtx(null))).rejects.toThrow('Client is not initialized');
    });

    test('keeps own auths, revokes others, verifies survival', async () => {
        const own = makeAuth({ current: true, appName: 'mine' });
        const other = makeAuth({ current: false, appName: 'evil', hash: { toString: () => 'h2' } });
        const invoke = jest.fn()
            .mockResolvedValueOnce({ authorizations: [own, other] }) // GetAuthorizations
            .mockResolvedValueOnce(undefined) // ResetAuthorization
            .mockResolvedValueOnce({ authorizations: [own] }); // after-cleanup GetAuthorizations
        const ctx = makeCtx({ invoke, getMe: jest.fn().mockResolvedValue({ phone: '900' }) });
        await removeOtherAuths(ctx);
        // ResetAuthorization invoked for the "other" auth
        expect(invoke.mock.calls[1][0]).toBeInstanceOf(Api.account.ResetAuthorization);
    });

    test('throws when session verification fails (getMe null)', async () => {
        const own = makeAuth({ current: true });
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue({ authorizations: [own] }),
            getMe: jest.fn().mockResolvedValue(null),
        });
        await expect(removeOtherAuths(ctx)).rejects.toThrow(/Session self-check failed/);
    });

    test('throws when revocation fails or others remain', async () => {
        const own = makeAuth({ current: true });
        const other = makeAuth({ current: false, hash: { toString: () => 'h2' } });
        const invoke = jest.fn()
            .mockResolvedValueOnce({ authorizations: [own, other] })
            .mockRejectedValueOnce(new Error('reset failed')) // ResetAuthorization fails -> failedCount++
            .mockResolvedValueOnce({ authorizations: [own, other] }); // still has other
        const ctx = makeCtx({ invoke, getMe: jest.fn().mockResolvedValue({ phone: '900' }) });
        await expect(removeOtherAuths(ctx)).rejects.toThrow(/removeOtherAuths incomplete/);
    });
});

describe('getAuths', () => {
    test('throws without client', async () => {
        await expect(getAuths(makeCtx(null))).rejects.toThrow('Client is not initialized');
    });
    test('returns authorizations', async () => {
        const result = { authorizations: [] };
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(result) });
        expect(await getAuths(ctx)).toBe(result);
    });
});

describe('getLastActiveTime', () => {
    test('throws without client', async () => {
        await expect(getLastActiveTime(makeCtx(null))).rejects.toThrow('Client is not initialized');
    });
    test('returns latest non-own dateActive', async () => {
        jest.spyOn(tgConfig, 'isAuthFingerprintMatch').mockReturnValue(false);
        const a1 = makeAuth({ current: false, dateActive: 1000 });
        const a2 = makeAuth({ current: false, dateActive: 2000 });
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ authorizations: [a1, a2] }) });
        const result = await getLastActiveTime(ctx);
        expect(result).toBe(new Date(2000 * 1000).toISOString().split('T')[0]);
    });
    test('returns today when no other auths', async () => {
        const own = makeAuth({ current: true, dateActive: 5000 });
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ authorizations: [own] }) });
        const result = await getLastActiveTime(ctx);
        expect(result).toBe(new Date().toISOString().split('T')[0]);
    });
    test('returns today on error', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('boom')) });
        const result = await getLastActiveTime(ctx);
        expect(result).toBe(new Date().toISOString().split('T')[0]);
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('hasPassword', () => {
    test('throws without client', async () => {
        await expect(hasPassword(makeCtx(null))).rejects.toThrow('Client is not initialized');
    });
    test('returns true/false from GetPassword', async () => {
        expect(await hasPassword(makeCtx({ invoke: jest.fn().mockResolvedValue({ hasPassword: true }) }))).toBe(true);
        expect(await hasPassword(makeCtx({ invoke: jest.fn().mockResolvedValue({ hasPassword: false }) }))).toBe(false);
    });
    test('returns false on error', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('x')) });
        expect(await hasPassword(ctx)).toBe(false);
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('createNewSession', () => {
    beforeEach(() => {
        mockNewSessionClient.start.mockClear();
        mockNewSessionClient.destroy.mockClear();
    });

    test('creates session via fresh client and destroys it', async () => {
        const ctx = makeCtx({ getMe: jest.fn().mockResolvedValue({ phone: '900' }) });
        const session = await createNewSession(ctx);
        expect(session).toBe('NEW_SESSION');
        expect(mockNewSessionClient.start).toHaveBeenCalled();
        expect(mockNewSessionClient.destroy).toHaveBeenCalled();
    });

    test('start callbacks supply password and otp', async () => {
        const ctx = makeCtx({
            getMe: jest.fn().mockResolvedValue({ phone: '900' }),
            getMessages: jest.fn().mockResolvedValue([{ date: Math.floor(Date.now() / 1000), text: 'Your login code:**55512.', }]),
        });
        mockNewSessionClient.start.mockImplementationOnce(async (opts: any) => {
            expect(await opts.password()).toBe('Ajtdmwajt1@');
            await opts.phoneCode();
            expect(() => opts.onError(new Error('e'))).toThrow('e');
        });
        await createNewSession(ctx);
        expect(ctx.client.getMessages).toHaveBeenCalledWith('777000', { limit: 1 });
    });
});

describe('waitForOtp', () => {
    afterEach(() => jest.useRealTimers());

    test('returns fresh code immediately', async () => {
        const ctx = makeCtx({
            getMessages: jest.fn().mockResolvedValue([{ date: Math.floor(Date.now() / 1000), text: 'Login code:**98765. Do not share.' }]),
        });
        expect(await waitForOtp(ctx)).toBe('98765');
    });

    test('retries when no message then succeeds', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({
            getMessages: jest.fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ date: Math.floor(Date.now() / 1000), text: 'code:**11111.' }]),
        });
        const promise = waitForOtp(ctx);
        await jest.runAllTimersAsync();
        expect(await promise).toBe('11111');
    });

    test('never submits a STALE code — throws instead of returning an expired OTP', async () => {
        // Session-survival: submitting an expired login OTP can fail the login or be the wrong
        // code for a fresh session attempt. A code older than the freshness window must NOT be
        // returned, even on the final attempt — the caller should retry/abort cleanly.
        jest.useFakeTimers();
        const staleDate = Math.floor((Date.now() - 5 * 60_000) / 1000);
        const ctx = makeCtx({
            getMessages: jest.fn().mockResolvedValue([{ date: staleDate, text: 'code:**22222.' }]),
        });
        const promise = waitForOtp(ctx);
        const expectation = expect(promise).rejects.toThrow('Failed to get a fresh OTP after 3 attempts');
        await jest.runAllTimersAsync();
        await expectation;
        expect(ctx.logger.warn).toHaveBeenCalledWith('900', expect.stringContaining('stale'));
    });

    test('returns a fresh code that arrives after an initial stale read', async () => {
        // A stale code on attempt 1, then a fresh one appears — the fresh code is used.
        jest.useFakeTimers();
        const staleDate = Math.floor((Date.now() - 5 * 60_000) / 1000);
        const ctx = makeCtx({
            getMessages: jest.fn()
                .mockResolvedValueOnce([{ date: staleDate, text: 'code:**00000.' }])
                .mockResolvedValue([{ date: Math.floor(Date.now() / 1000), text: 'code:**33333.' }]),
        });
        const promise = waitForOtp(ctx);
        await jest.runAllTimersAsync();
        expect(await promise).toBe('33333');
    });

    test('throws after exhausting attempts on errors', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({ getMessages: jest.fn().mockRejectedValue(new Error('read fail')) });
        const promise = waitForOtp(ctx);
        const expectation = expect(promise).rejects.toThrow('Failed to get a fresh OTP after 3 attempts');
        await jest.runAllTimersAsync();
        await expectation;
    });
});

describe('getSessionInfo', () => {
    test('throws without client', async () => {
        await expect(getSessionInfo(makeCtx(null))).rejects.toThrow('Client not initialized');
    });
    test('maps app and web sessions', async () => {
        const appAuth = {
            hash: { toString: () => 'h1' }, deviceModel: 'D', platform: 'android', systemVersion: 'v',
            appName: 'app', dateCreated: 1000, dateActive: 2000, ip: '1.1.1.1', country: 'IN', region: 'R',
        };
        const webAuth = {
            hash: { toString: () => 'w1' }, domain: 'd', browser: 'b', platform: 'p',
            dateCreated: 1000, dateActive: 2000, ip: '2.2.2.2', region: 'R2',
        };
        const ctx = makeCtx({
            invoke: jest.fn()
                .mockResolvedValueOnce({ authorizations: [appAuth] })
                .mockResolvedValueOnce({ authorizations: [webAuth] }),
        });
        const info = await getSessionInfo(ctx);
        expect(info.sessions[0]).toMatchObject({ hash: 'h1', deviceModel: 'D' });
        expect(info.webSessions[0]).toMatchObject({ hash: 'w1', domain: 'd' });
    });
});

describe('terminateSession', () => {
    test('throws without client', async () => {
        await expect(terminateSession(makeCtx(null), { hash: 'h', type: 'app' })).rejects.toThrow('Client not initialized');
    });
    test('resets all app authorizations when exceptCurrent', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(undefined) });
        expect(await terminateSession(ctx, { hash: 'h', type: 'app', exceptCurrent: true })).toBe(true);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.auth.ResetAuthorizations);
    });
    test('resets all web authorizations when exceptCurrent', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(undefined) });
        await terminateSession(ctx, { hash: 'h', type: 'web', exceptCurrent: true });
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.account.ResetWebAuthorizations);
    });
    test('resets single app authorization', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(undefined) });
        await terminateSession(ctx, { hash: '123', type: 'app' });
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.account.ResetAuthorization);
    });
    test('resets single web authorization', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(undefined) });
        await terminateSession(ctx, { hash: '123', type: 'web' });
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.account.ResetWebAuthorization);
    });
});
