jest.mock('../../../../utils/withTimeout', () => ({
    withTimeout: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));
jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) };
});
const mockSendByCategory = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../utils', () => {
    const actual = jest.requireActual('../../../../utils');
    return {
        ...actual,
        getBotsServiceInstance: jest.fn(() => ({ sendMessageByCategory: mockSendByCategory })),
    };
});

const managerInstances: any[] = [];
jest.mock('../../TelegramManager', () => {
    return jest.fn().mockImplementation((session: string, mobile: string) => {
        const inst: any = {
            session, phoneNumber: mobile,
            client: { connected: true, getMe: jest.fn().mockResolvedValue({ id: 1 }) },
            createClient: jest.fn().mockResolvedValue(undefined),
            connected: jest.fn().mockReturnValue(true),
            destroy: jest.fn().mockResolvedValue(undefined),
        };
        managerInstances.push(inst);
        return inst;
    });
});

import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { connectionManager, unregisterClient as unregisterClientFn } from '../connection-manager';

function makeUsersService(overrides: Partial<Record<string, any>> = {}) {
    return {
        search: jest.fn().mockResolvedValue([{ mobile: '900', session: 'sess' }]),
        expireAccount: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any;
}

async function clearAllClients() {
    for (const m of connectionManager.getClientList()) {
        await connectionManager.unregisterClient(m);
    }
}

describe('ConnectionManager', () => {
    beforeEach(() => {
        managerInstances.length = 0;
        connectionManager.setUsersService(makeUsersService());
        (connectionManager as any).isShuttingDown = false;
    });
    afterEach(async () => { await clearAllClients(); jest.clearAllMocks(); });

    test('getClient throws without mobile', async () => {
        await expect(connectionManager.getClient('')).rejects.toBeInstanceOf(BadRequestException);
    });

    test('getClient throws when shutting down', async () => {
        (connectionManager as any).isShuttingDown = true;
        await expect(connectionManager.getClient('900')).rejects.toBeInstanceOf(InternalServerErrorException);
        (connectionManager as any).isShuttingDown = false;
    });

    test('creates and registers a new client, then reuses it (fast path)', async () => {
        const client = await connectionManager.getClient('900');
        expect(client).toBe(managerInstances[0]);
        expect(connectionManager.hasClient('900')).toBe(true);

        const again = await connectionManager.getClient('900');
        expect(again).toBe(client);
        // only one manager constructed (reused)
        expect(managerInstances).toHaveLength(1);
    });

    test('throws NotFound when user is missing', async () => {
        connectionManager.setUsersService(makeUsersService({ search: jest.fn().mockResolvedValue([]) }));
        await expect(connectionManager.getClient('901')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('throws when usersService not set', async () => {
        (connectionManager as any).usersService = null;
        await expect(connectionManager.getClient('902')).rejects.toBeInstanceOf(InternalServerErrorException);
        connectionManager.setUsersService(makeUsersService());
    });

    test('concurrent getClient calls share one in-flight build', async () => {
        const [a, b] = await Promise.all([
            connectionManager.getClient('903'),
            connectionManager.getClient('903'),
        ]);
        expect(a).toBe(b);
        expect(managerInstances).toHaveLength(1);
    });

    test('handles connection error and marks permanent failures expired', async () => {
        const usersService = makeUsersService();
        connectionManager.setUsersService(usersService);
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: { connected: true, getMe: jest.fn() },
                createClient: jest.fn().mockRejectedValue(new Error('USER_DEACTIVATED')),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('904')).rejects.toThrow('USER_DEACTIVATED');
        expect(usersService.expireAccount).toHaveBeenCalledWith('904', expect.stringContaining('Permanent connection error'));
        expect(mockSendByCategory).toHaveBeenCalled();
    });

    test('validateConnection failure throws and unregisters', async () => {
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: null, // becomes null -> "Client creation failed - client is null"
                createClient: jest.fn().mockResolvedValue(undefined),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('905')).rejects.toThrow(/client is null/);
        expect(connectionManager.hasClient('905')).toBe(false);
    });

    test('getClient cleans up an existing unhealthy client before recreating', async () => {
        await connectionManager.getClient('906');
        // Mark the existing client unhealthy
        managerInstances[0].connected = jest.fn().mockReturnValue(false);
        const state = connectionManager.getClientState('906')!;
        state.lastError = undefined;
        // Force a fresh build by making it stale
        (connectionManager as any).clients.get('906').lastUsed = 0;
        const again = await connectionManager.getClient('906');
        expect(managerInstances.length).toBeGreaterThanOrEqual(2);
        expect(again).toBe(managerInstances[managerInstances.length - 1]);
    });

    test('unregisterClient is a no-op for unknown mobile', async () => {
        await expect(connectionManager.unregisterClient('nope')).resolves.toBeUndefined();
    });

    test('getClientState returns undefined for unknown mobile', () => {
        expect(connectionManager.getClientState('nope')).toBeUndefined();
    });

    test('getConnectionStats reflects registered clients', async () => {
        await connectionManager.getClient('907');
        const stats = connectionManager.getConnectionStats();
        expect(stats.total).toBeGreaterThanOrEqual(1);
        expect(stats.connected).toBeGreaterThanOrEqual(1);
    });

    test('getActiveConnectionCount and getClientList', async () => {
        await connectionManager.getClient('908');
        expect(connectionManager.getActiveConnectionCount()).toBeGreaterThanOrEqual(1);
        expect(connectionManager.getClientList()).toContain('908');
    });

    test('getHealthReport classifies healthy vs unhealthy', async () => {
        await connectionManager.getClient('909');
        managerInstances[managerInstances.length - 1].connected = jest.fn().mockReturnValue(false);
        const report = connectionManager.getHealthReport();
        expect(report.totalClients).toBeGreaterThanOrEqual(1);
        expect(report.unhealthyClients).toContain('909');
    });

    test('getHealthReport counts a still-connected client as healthy', async () => {
        // a freshly built, connected client must be reported as healthy (healthyCount++ branch).
        await connectionManager.getClient('9091');
        const report = connectionManager.getHealthReport();
        expect(report.healthyClients).toBeGreaterThanOrEqual(1);
        expect(report.unhealthyClients).not.toContain('9091');
        await connectionManager.unregisterClient('9091');
    });

    test('startCleanup is idempotent and does not stack interval timers', async () => {
        // calling startCleanup while a timer already exists must early-return.
        const cm: any = connectionManager;
        if (!cm.cleanupTimer) cm.startCleanup();
        const existingTimer = cm.cleanupTimer;
        cm.startCleanup(); // should be a no-op
        expect(cm.cleanupTimer).toBe(existingTimer);
    });

    test('forceReconnect unregisters then rebuilds', async () => {
        await connectionManager.getClient('910');
        const firstCount = managerInstances.length;
        const reconnected = await connectionManager.forceReconnect('910');
        expect(managerInstances.length).toBe(firstCount + 1);
        expect(reconnected).toBe(managerInstances[managerInstances.length - 1]);
    });

    test('connection limit triggers force cleanup then throws if still full', async () => {
        const cm: any = connectionManager;
        // Fill the registry to the cap with dummy infos
        for (let i = 0; i < cm.MAX_CONNECTIONS; i++) {
            cm.clients.set(`fill-${i}`, {
                client: { destroy: jest.fn().mockResolvedValue(undefined), connected: () => true },
                lastUsed: Date.now(), autoDisconnect: false, state: 'connected', connectionAttempts: 1,
            });
        }
        // forceCleanup will remove ~20%, allowing a new client; but if it can't, it throws.
        // Make destroy resolve so cleanup succeeds and a slot frees up.
        const client = await connectionManager.getClient('911');
        expect(client).toBeDefined();
        await clearAllClients();
    });

    test('forceCleanup prefers evicting auto-disconnect/idle clients over in-use ones', async () => {
        // Force-eviction ranked purely by lastUsed would evict the BUSIEST clients (their lastUsed
        // is stale because it isn't refreshed during long ops). Prefer disposable candidates
        // (autoDisconnect:true / errored) so an in-use autoDisconnect:false client survives.
        const cm: any = connectionManager;
        cm.clients.clear();
        const destroyHeld = jest.fn().mockResolvedValue(undefined);
        // The in-use client: oldest lastUsed, but explicitly keep-alive + connected.
        cm.clients.set('inuse', {
            client: { destroy: destroyHeld, connected: () => true },
            lastUsed: 1, autoDisconnect: false, state: 'connected', connectionAttempts: 1,
        });
        // Plenty of disposable auto-disconnect clients (newer lastUsed, but safe to drop).
        for (let i = 0; i < cm.MAX_CONNECTIONS; i++) {
            cm.clients.set(`disp-${i}`, {
                client: { destroy: jest.fn().mockResolvedValue(undefined), connected: () => true },
                lastUsed: Date.now(), autoDisconnect: true, state: 'connected', connectionAttempts: 1,
            });
        }
        await cm.forceCleanup();
        // The in-use keep-alive client must NOT have been evicted while disposable ones existed.
        expect(destroyHeld).not.toHaveBeenCalled();
        expect(connectionManager.hasClient('inuse')).toBe(true);
        cm.clients.clear();
    });

    test('disconnectAll and shutdown clear all clients', async () => {
        await connectionManager.getClient('912');
        await connectionManager.disconnectAll();
        expect(connectionManager.getClientList()).not.toContain('912');
    });

    test('exported unregisterClient helper delegates to singleton', async () => {
        await connectionManager.getClient('913');
        await unregisterClientFn('913');
        expect(connectionManager.hasClient('913')).toBe(false);
    });

    test('joins an in-flight build instead of starting a second', async () => {
        const cm: any = connectionManager;
        // seed an in-flight promise for this mobile
        const sentinel = Promise.resolve(managerInstances[0] ?? ({} as any));
        cm.inFlight.set('914', sentinel);
        const joined = await connectionManager.getClient('914');
        await expect(joined).toBeDefined();
        cm.inFlight.delete('914');
    });

    test('validateConnection throws when client not connected', async () => {
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: { connected: false, getMe: jest.fn() },
                createClient: jest.fn().mockResolvedValue(undefined),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('915')).rejects.toThrow(/not connected/);
    });

    test('handleConnectionError swallows notification failures', async () => {
        const usersService = makeUsersService();
        connectionManager.setUsersService(usersService);
        mockSendByCategory.mockRejectedValueOnce(new Error('notify fail'));
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: { connected: true, getMe: jest.fn() },
                createClient: jest.fn().mockRejectedValue(new Error('USER_DEACTIVATED')),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('916')).rejects.toThrow('USER_DEACTIVATED');
        // expireAccount failure is also swallowed
        expect(usersService.expireAccount).toHaveBeenCalled();
    });

    test('handleConnectionError swallows expireAccount failures', async () => {
        const usersService = makeUsersService({ expireAccount: jest.fn().mockRejectedValue(new Error('db down')) });
        connectionManager.setUsersService(usersService);
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: { connected: true, getMe: jest.fn() },
                createClient: jest.fn().mockRejectedValue(new Error('SESSION_REVOKED')),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('917')).rejects.toThrow('SESSION_REVOKED');
    });

    test('unregisterClient logs but completes when destroy throws', async () => {
        await connectionManager.getClient('918');
        managerInstances[managerInstances.length - 1].destroy = jest.fn().mockRejectedValue(new Error('destroy fail'));
        await connectionManager.unregisterClient('918');
        expect(connectionManager.hasClient('918')).toBe(false);
    });

    test('cleanup removes idle/errored/stale clients', async () => {
        const cm: any = connectionManager;
        const destroy = jest.fn().mockResolvedValue(undefined);
        cm.clients.set('idle', {
            client: { destroy, connected: () => false },
            lastUsed: 0, autoDisconnect: true, state: 'connected', connectionAttempts: 1,
        });
        cm.clients.set('errored', {
            client: { destroy, connected: () => false },
            lastUsed: Date.now(), autoDisconnect: false, state: 'error', connectionAttempts: 1,
        });
        cm.clients.set('toomany', {
            client: { destroy, connected: () => false },
            lastUsed: Date.now(), autoDisconnect: false, state: 'connected', connectionAttempts: 5,
        });
        await cm.cleanup();
        expect(connectionManager.hasClient('idle')).toBe(false);
        expect(connectionManager.hasClient('errored')).toBe(false);
        expect(connectionManager.hasClient('toomany')).toBe(false);
    });

    test('updateLastUsed silently ignores an unknown mobile', () => {
        // defensive: touching the last-used timestamp for a mobile that is not
        // registered must not throw (the `if (clientInfo)` guard is false).
        const cm: any = connectionManager;
        expect(() => cm.updateLastUsed('not-registered')).not.toThrow();
    });

    test('cleanup does NOT destroy a STALE but healthy autoDisconnect:false client (long-held op)', async () => {
        // A client acquired with autoDisconnect:false is explicitly "keep alive — I'm using it".
        // lastUsed is only stamped at acquisition, so a warmup op held >10min (organic activity)
        // looks stale. Destroying it mid-operation breaks 2FA/removeOtherAuths and can trip a
        // false permanent account expiry. autoDisconnect:false must opt out of idle/stale cleanup.
        const cm: any = connectionManager;
        const destroy = jest.fn().mockResolvedValue(undefined);
        cm.clients.set('held', {
            client: { destroy, connected: () => true },
            lastUsed: Date.now() - 30 * 60 * 1000, // 30 min ago (well past 2*IDLE_TIMEOUT)
            autoDisconnect: false,
            state: 'connected',
            connectionAttempts: 1,
        });
        await cm.cleanup();
        expect(connectionManager.hasClient('held')).toBe(true);
        expect(destroy).not.toHaveBeenCalled();
        cm.clients.delete('held');
    });

    test('cleanup reaps a DEAD-SOCKET keep-alive client (connected()===false) so it does not leak', async () => {
        // The autoDisconnect:false exemption must not let a client whose MTProto socket has
        // silently died linger forever (state stays 'connected', so isErrored is false). A dead
        // socket is not "in use" — it must be reaped regardless of autoDisconnect.
        const cm: any = connectionManager;
        const destroy = jest.fn().mockResolvedValue(undefined);
        cm.clients.set('deadkeep', {
            client: { destroy, connected: () => false }, // socket dropped
            lastUsed: Date.now() - 30 * 60 * 1000,
            autoDisconnect: false,
            state: 'connected', // never flipped to 'error' (the bug)
            connectionAttempts: 1,
        });
        await cm.cleanup();
        expect(connectionManager.hasClient('deadkeep')).toBe(false);
        cm.clients.delete('deadkeep');
    });

    test('cleanup keeps a fresh, healthy, non-auto-disconnect client', async () => {
        // a recently-used, connected, no-auto-disconnect client must survive cleanup
        // (the removal condition is false for it).
        const cm: any = connectionManager;
        const destroy = jest.fn().mockResolvedValue(undefined);
        cm.clients.set('keepme', {
            client: { destroy, connected: () => true },
            lastUsed: Date.now(), autoDisconnect: false, state: 'connected', connectionAttempts: 1,
        });
        await cm.cleanup();
        expect(connectionManager.hasClient('keepme')).toBe(true);
        expect(destroy).not.toHaveBeenCalled();
        await connectionManager.unregisterClient('keepme');
    });

    test('cleanup with an empty registry performs no removals', async () => {
        // no clients => removePromises is empty, so the post-removal branch is skipped.
        const cm: any = connectionManager;
        await clearAllClients();
        await expect(cm.cleanup()).resolves.toBeUndefined();
    });

    test('stopCleanup is safe to call when no timer is running', async () => {
        const cm: any = connectionManager;
        cm.stopCleanup(); // ensure no timer
        expect(() => cm.stopCleanup()).not.toThrow();
        expect(cm.cleanupTimer).toBeNull();
        // restore the background timer for later tests
        cm.startCleanup();
    });

    test('connection-error notification is skipped when no bots service is available', async () => {
        // getBotsServiceInstance returns undefined -> the notification block is bypassed.
        const utils = require('../../../../utils');
        (utils.getBotsServiceInstance as jest.Mock).mockReturnValueOnce(undefined);
        const usersService = makeUsersService();
        connectionManager.setUsersService(usersService);
        const TelegramManager = require('../../TelegramManager');
        TelegramManager.mockImplementationOnce((session: string, mobile: string) => {
            const inst: any = {
                session, phoneNumber: mobile,
                client: { connected: true, getMe: jest.fn() },
                createClient: jest.fn().mockRejectedValue(new Error('USER_DEACTIVATED')),
                connected: jest.fn().mockReturnValue(false),
                destroy: jest.fn().mockResolvedValue(undefined),
            };
            managerInstances.push(inst);
            return inst;
        });
        await expect(connectionManager.getClient('920')).rejects.toThrow('USER_DEACTIVATED');
        expect(usersService.expireAccount).toHaveBeenCalled();
    });

    test('cleanup is a no-op while shutting down', async () => {
        const cm: any = connectionManager;
        cm.isShuttingDown = true;
        await expect(cm.cleanup()).resolves.toBeUndefined();
        cm.isShuttingDown = false;
    });

    test('shutdown stops cleanup and disconnects everything', async () => {
        const cm: any = connectionManager;
        await connectionManager.getClient('919');
        await connectionManager.shutdown();
        expect(connectionManager.getClientList()).toHaveLength(0);
        // restore for any later tests
        cm.isShuttingDown = false;
        cm.cleanupTimer = null;
        cm.startCleanup();
    });
});
