jest.mock('telegram', () => ({ TelegramClient: jest.fn() }));

import { ClientRegistry } from '../client-registry';

function makeClient(overrides: any = {}): any {
    return {
        destroy: jest.fn().mockResolvedValue(undefined),
        _eventBuilders: [],
        _destroyed: false,
        _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
        ...overrides,
    };
}

// Reset singleton so each test starts clean (and so constructor setInterval runs under fake timers)
function freshRegistry(): ClientRegistry {
    (ClientRegistry as any).instance = null;
    return ClientRegistry.getInstance();
}

describe('ClientRegistry', () => {
    let registry: ClientRegistry;

    beforeEach(() => {
        jest.useFakeTimers();
        registry = freshRegistry();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('getInstance returns the same singleton', () => {
        const a = ClientRegistry.getInstance();
        const b = ClientRegistry.getInstance();
        expect(a).toBe(b);
    });

    describe('acquireLock / releaseLock', () => {
        it('acquires a lock when none exists', async () => {
            const id = await registry.acquireLock('111');
            expect(id).toMatch(/^111_/);
        });

        it('returns null when a non-expired lock already exists', async () => {
            await registry.acquireLock('111');
            const second = await registry.acquireLock('111');
            expect(second).toBeNull();
        });

        it('removes expired lock and acquires fresh one', async () => {
            await registry.acquireLock('111');
            // advance past LOCK_EXPIRY (120000ms)
            jest.setSystemTime(Date.now() + 130000);
            const id = await registry.acquireLock('111');
            expect(id).not.toBeNull();
        });

        it('releaseLock returns true for matching lock id', async () => {
            const id = await registry.acquireLock('111');
            expect(registry.releaseLock('111', id!)).toBe(true);
        });

        it('releaseLock returns false for wrong lock id', async () => {
            await registry.acquireLock('111');
            expect(registry.releaseLock('111', 'wrong')).toBe(false);
        });

        it('releaseLock returns false when no lock exists', () => {
            expect(registry.releaseLock('999', 'x')).toBe(false);
        });
    });

    describe('waitForLock', () => {
        it('returns a lock id immediately when available', async () => {
            const id = await registry.waitForLock('222');
            expect(id).not.toBeNull();
        });

        it('throws on timeout when lock is held', async () => {
            await registry.acquireLock('333');
            const p = registry.waitForLock('333');
            const assertion = expect(p).rejects.toThrow(/Lock acquisition timeout for 333/);
            // drive the retry loop + LOCK_TIMEOUT (30000ms)
            await jest.advanceTimersByTimeAsync(31000);
            await assertion;
        });
    });

    describe('registerClient', () => {
        it('throws when lock is invalid', async () => {
            await expect(registry.registerClient('444', makeClient(), 'sess', 'bad-lock'))
                .rejects.toThrow(/Invalid lock for registering client/);
        });

        it('registers successfully with valid lock', async () => {
            const id = await registry.acquireLock('444');
            const ok = await registry.registerClient('444', makeClient(), 'sess', id!);
            expect(ok).toBe(true);
            expect(registry.hasClient('444')).toBe(true);
        });

        it('returns false when client already exists', async () => {
            const id = await registry.acquireLock('444');
            await registry.registerClient('444', makeClient(), 'sess', id!);
            const ok = await registry.registerClient('444', makeClient(), 'sess', id!);
            expect(ok).toBe(false);
        });
    });

    describe('markClientCreating', () => {
        it('returns false when lock invalid', async () => {
            expect(registry.markClientCreating('555', 'bad')).toBe(false);
        });

        it('creates placeholder when no existing client', async () => {
            const id = await registry.acquireLock('555');
            expect(registry.markClientCreating('555', id!)).toBe(true);
            expect(registry.getClientInfo('555')?.isCreating).toBe(true);
        });

        it('updates existing client to creating', async () => {
            const id = await registry.acquireLock('555');
            await registry.registerClient('555', makeClient(), 'sess', id!);
            expect(registry.markClientCreating('555', id!)).toBe(true);
            expect(registry.getClientInfo('555')?.isCreating).toBe(true);
        });
    });

    describe('updateActivity', () => {
        it('updates lastActivity when client exists', async () => {
            const id = await registry.acquireLock('666');
            await registry.registerClient('666', makeClient(), 'sess', id!);
            const before = registry.getClientInfo('666')!.lastActivity.getTime();
            jest.setSystemTime(Date.now() + 5000);
            registry.updateActivity('666');
            expect(registry.getClientInfo('666')!.lastActivity.getTime()).toBeGreaterThan(before);
        });

        it('no-op when client missing', () => {
            expect(() => registry.updateActivity('nope')).not.toThrow();
        });
    });

    describe('removeClient', () => {
        it('returns false when client does not exist', async () => {
            expect(await registry.removeClient('none')).toBe(false);
        });

        it('returns false with wrong lockId', async () => {
            const id = await registry.acquireLock('777');
            await registry.registerClient('777', makeClient(), 'sess', id!);
            expect(await registry.removeClient('777', 'wrong')).toBe(false);
        });

        it('removes client and destroys it with valid lock', async () => {
            const id = await registry.acquireLock('777');
            const client = makeClient();
            await registry.registerClient('777', client, 'sess', id!);
            const ok = await registry.removeClient('777', id!);
            expect(ok).toBe(true);
            expect(client.destroy).toHaveBeenCalled();
            expect(client._sender.disconnect).toHaveBeenCalled();
            expect(registry.hasClient('777')).toBe(false);
        });

        it('handles destroy errors gracefully', async () => {
            const id = await registry.acquireLock('778');
            const client = makeClient({ destroy: jest.fn().mockRejectedValue(new Error('destroy fail')) });
            await registry.registerClient('778', client, 'sess', id!);
            const ok = await registry.removeClient('778', id!);
            expect(ok).toBe(true);
        });

        it('removes placeholder client with null client (no destroy)', async () => {
            const id = await registry.acquireLock('779');
            registry.markClientCreating('779', id!); // client is null
            const ok = await registry.removeClient('779', id!);
            expect(ok).toBe(true);
        });

        it('skips _sender.disconnect when not a function', async () => {
            const id = await registry.acquireLock('780');
            const client = makeClient({ _sender: {} });
            await registry.registerClient('780', client, 'sess', id!);
            const ok = await registry.removeClient('780', id!);
            expect(ok).toBe(true);
        });
    });

    describe('stats / counts / mobiles', () => {
        it('reports counts and mobiles', async () => {
            const id = await registry.acquireLock('888');
            await registry.registerClient('888', makeClient(), 'sess', id!);
            expect(registry.getActiveClientCount()).toBe(1);
            expect(registry.getActivemobiles()).toEqual(['888']);
            const stats = registry.getStats();
            expect(stats.activeClients).toBe(1);
            expect(stats.activeLocks).toBe(1);
            expect(stats.mobiles).toEqual(['888']);
        });
    });

    describe('forceCleanup', () => {
        it('removes lock and client and counts them', async () => {
            const id = await registry.acquireLock('999');
            await registry.registerClient('999', makeClient(), 'sess', id!);
            const count = await registry.forceCleanup('999');
            expect(count).toBe(2);
        });

        it('returns 0 when nothing to clean', async () => {
            const count = await registry.forceCleanup('absent');
            expect(count).toBe(0);
        });

        it('counts only lock when no client', async () => {
            await registry.acquireLock('1000');
            const count = await registry.forceCleanup('1000');
            expect(count).toBe(1);
        });
    });

    describe('cleanupInactiveClients (interval)', () => {
        it('removes clients inactive beyond CLIENT_TIMEOUT', async () => {
            const id = await registry.acquireLock('1234');
            const client = makeClient();
            await registry.registerClient('1234', client, 'sess', id!);

            // advance past CLIENT_TIMEOUT (300000ms) so the 60s interval finds it inactive
            jest.setSystemTime(Date.now() + 400000);
            await jest.advanceTimersByTimeAsync(60000);

            expect(registry.hasClient('1234')).toBe(false);
            expect(client.destroy).toHaveBeenCalled();
        });

        it('leaves active clients untouched', async () => {
            const id = await registry.acquireLock('1235');
            await registry.registerClient('1235', makeClient(), 'sess', id!);
            await jest.advanceTimersByTimeAsync(60000);
            expect(registry.hasClient('1235')).toBe(true);
        });
    });

    describe('cleanupExpiredLocks (interval)', () => {
        it('removes expired locks', async () => {
            await registry.acquireLock('5678');
            expect(registry.getStats().activeLocks).toBe(1);

            jest.setSystemTime(Date.now() + 130000);
            await jest.advanceTimersByTimeAsync(30000);

            expect(registry.getStats().activeLocks).toBe(0);
        });

        it('leaves fresh locks intact', async () => {
            await registry.acquireLock('5679');
            await jest.advanceTimersByTimeAsync(30000);
            expect(registry.getStats().activeLocks).toBe(1);
        });
    });
});
