/**
 * Unit tests for InitModule lifecycle logic.
 *
 * The @Module decorator metadata (Mongoose/Config imports) is declarative wiring and
 * not exercised here; this suite targets the class's real behavior: connection
 * validation + retry, event-handler registration, health-check timer, startup/shutdown
 * notifications, and the static initialization-status state machine.
 *
 * Only true externals are mocked: fetchWithTimeout/notifbot (network) and the timer.
 * The Mongoose Connection is a thin fake exposing the fields the class actually touches.
 */
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/bot?chat_id=1'),
}));

import { InitModule } from '../init.module';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';

const mockedFetch = fetchWithTimeout as jest.Mock;

// Reset the private static state machine between tests so each test starts clean.
function resetStaticStatus() {
    (InitModule as any).initializationStatus = {
        isInitialized: false,
        isInitializing: false,
        isDestroying: false,
    };
}

interface FakeConnection {
    readyState: number;
    db: { admin: () => { ping: jest.Mock } };
    on: jest.Mock;
    close: jest.Mock;
    handlers: Record<string, (...args: any[]) => void>;
}

function makeConnection(overrides: Partial<{ readyState: number; ping: jest.Mock; close: jest.Mock }> = {}): FakeConnection {
    const ping = overrides.ping ?? jest.fn().mockResolvedValue(undefined);
    const handlers: Record<string, (...args: any[]) => void> = {};
    return {
        readyState: overrides.readyState ?? 1,
        db: { admin: () => ({ ping }) },
        on: jest.fn((event: string, cb: (...args: any[]) => void) => { handlers[event] = cb; }),
        close: overrides.close ?? jest.fn().mockResolvedValue(undefined),
        handlers,
    };
}

function makeModule(conn: FakeConnection) {
    const configService = { get: jest.fn() } as any;
    return new InitModule(conn as any, configService);
}

describe('InitModule', () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        resetStaticStatus();
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockedFetch.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    describe('onModuleInit', () => {
        it('initializes successfully: validates, registers handlers, starts health check, notifies', async () => {
            const conn = makeConnection({ readyState: 1 });
            const mod = makeModule(conn);

            await mod.onModuleInit();

            expect(InitModule.getInitializationStatus()).toEqual({
                isInitialized: true,
                isInitializing: false,
                isDestroying: false,
            });
            // Connection event handlers registered
            expect(conn.on).toHaveBeenCalledWith('connected', expect.any(Function));
            expect(conn.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(conn.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
            expect(conn.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
            expect(conn.on).toHaveBeenCalledWith('close', expect.any(Function));
            // Startup notification sent
            expect(mockedFetch).toHaveBeenCalledTimes(1);
            expect(InitModule.isReady()).toBe(true);

            await mod.onModuleDestroy();
        });

        it('is idempotent — second call returns early while already initialized', async () => {
            const conn = makeConnection();
            const mod = makeModule(conn);
            await mod.onModuleInit();
            mockedFetch.mockClear();

            await mod.onModuleInit(); // already initialized → early return

            expect(mockedFetch).not.toHaveBeenCalled();
            await mod.onModuleDestroy();
        });

        it('returns early when initialization is already in progress', async () => {
            const conn = makeConnection();
            const mod = makeModule(conn);
            (InitModule as any).initializationStatus.isInitializing = true;

            await mod.onModuleInit();

            // No handlers registered because it short-circuited
            expect(conn.on).not.toHaveBeenCalled();
        });

        it('rethrows and clears isInitializing when validation ultimately fails', async () => {
            const ping = jest.fn().mockRejectedValue(new Error('ping boom'));
            const conn = makeConnection({ readyState: 1, ping });
            const mod = makeModule(conn);

            const promise = mod.onModuleInit();
            const assertion = expect(promise).rejects.toThrow(/Failed to validate MongoDB connection/);
            // validateConnection retries: attempt1 fail → wait 2000, attempt2 fail → wait 4000, attempt3 throws
            await jest.advanceTimersByTimeAsync(2000 + 4000);

            await assertion;
            expect(InitModule.getInitializationStatus().isInitializing).toBe(false);
            expect(InitModule.getInitializationStatus().isInitialized).toBe(false);
        });
    });

    describe('validateConnection retry behavior', () => {
        it('retries when readyState is not connected, then succeeds once ready', async () => {
            const ping = jest.fn().mockResolvedValue(undefined);
            const conn = makeConnection({ readyState: 0, ping });
            const mod = makeModule(conn);

            const promise = mod.onModuleInit();
            // First attempt fails (readyState 0) → waits 2000ms. Flip to ready before retry.
            conn.readyState = 1;
            await jest.advanceTimersByTimeAsync(2000);
            await promise;

            expect(ping).toHaveBeenCalledTimes(1);
            expect(InitModule.isReady()).toBe(true);
            await mod.onModuleDestroy();
        });
    });

    describe('connection event handlers', () => {
        it('each registered handler runs without throwing', async () => {
            const conn = makeConnection();
            const mod = makeModule(conn);
            await mod.onModuleInit();

            expect(() => conn.handlers['connected']()).not.toThrow();
            expect(() => conn.handlers['error'](new Error('x'))).not.toThrow();
            expect(() => conn.handlers['disconnected']()).not.toThrow();
            expect(() => conn.handlers['reconnected']()).not.toThrow();
            expect(() => conn.handlers['close']()).not.toThrow();

            await mod.onModuleDestroy();
        });
    });

    describe('health check timer', () => {
        it('pings while connected on each interval', async () => {
            const ping = jest.fn().mockResolvedValue(undefined);
            const conn = makeConnection({ readyState: 1, ping });
            const mod = makeModule(conn);
            await mod.onModuleInit();
            ping.mockClear();

            await jest.advanceTimersByTimeAsync(30000);
            expect(ping).toHaveBeenCalledTimes(1);

            await mod.onModuleDestroy();
        });

        it('logs but does not crash when a health-check ping fails', async () => {
            const ping = jest.fn().mockResolvedValueOnce(undefined); // init validate ok
            const conn = makeConnection({ readyState: 1, ping });
            const mod = makeModule(conn);
            await mod.onModuleInit();

            ping.mockRejectedValue(new Error('hc fail'));
            await jest.advanceTimersByTimeAsync(30000);

            expect(errorSpy).toHaveBeenCalledWith('MongoDB health check failed:', expect.any(Error));
            await mod.onModuleDestroy();
        });

        it('skips ping when connection is not in connected state', async () => {
            const ping = jest.fn().mockResolvedValue(undefined);
            const conn = makeConnection({ readyState: 1, ping });
            const mod = makeModule(conn);
            await mod.onModuleInit();
            ping.mockClear();

            conn.readyState = 0; // disconnected
            await jest.advanceTimersByTimeAsync(30000);
            expect(ping).not.toHaveBeenCalled();

            await mod.onModuleDestroy();
        });
    });

    describe('sendNotification', () => {
        it('swallows network failures without throwing', async () => {
            mockedFetch.mockRejectedValueOnce(new Error('network down'));
            const conn = makeConnection();
            const mod = makeModule(conn);

            // Startup notification fails but init still completes
            await expect(mod.onModuleInit()).resolves.toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith('Failed to send notification:', expect.any(Error));
            await mod.onModuleDestroy();
        });
    });

    describe('onModuleDestroy', () => {
        it('stops health check, notifies, and closes an open connection', async () => {
            const close = jest.fn().mockResolvedValue(undefined);
            const conn = makeConnection({ readyState: 1, close });
            const mod = makeModule(conn);
            await mod.onModuleInit();
            mockedFetch.mockClear();

            await mod.onModuleDestroy();

            expect(mockedFetch).toHaveBeenCalledTimes(1); // shutdown notification
            expect(close).toHaveBeenCalledWith(true);
            // status reset in finally
            expect(InitModule.getInitializationStatus()).toEqual({
                isInitialized: false,
                isInitializing: false,
                isDestroying: false,
            });
        });

        it('returns early if already destroying', async () => {
            const conn = makeConnection();
            const mod = makeModule(conn);
            (InitModule as any).initializationStatus.isDestroying = true;

            await mod.onModuleDestroy();
            expect(conn.close).not.toHaveBeenCalled();
        });

        it('does not close an already-closed connection (readyState 0)', async () => {
            const close = jest.fn().mockResolvedValue(undefined);
            const conn = makeConnection({ readyState: 0, close });
            const mod = makeModule(conn);

            await mod.onModuleDestroy();
            expect(close).not.toHaveBeenCalled();
        });

        it('logs and still resets status when close throws', async () => {
            const close = jest.fn().mockRejectedValue(new Error('close boom'));
            const conn = makeConnection({ readyState: 1, close });
            const mod = makeModule(conn);

            await mod.onModuleDestroy();

            expect(errorSpy).toHaveBeenCalledWith('Error during module destruction:', expect.any(Error));
            expect(InitModule.getInitializationStatus().isDestroying).toBe(false);
        });
    });

    describe('static status helpers', () => {
        it('getInitializationStatus returns a copy, not the live object', () => {
            const a = InitModule.getInitializationStatus();
            a.isInitialized = true;
            expect(InitModule.getInitializationStatus().isInitialized).toBe(false);
        });

        it('isReady is false while destroying even if initialized', () => {
            (InitModule as any).initializationStatus = {
                isInitialized: true,
                isInitializing: false,
                isDestroying: true,
            };
            expect(InitModule.isReady()).toBe(false);
        });
    });
});
