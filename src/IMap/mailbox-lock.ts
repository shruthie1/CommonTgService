import { randomUUID } from 'crypto';
import { RedisClient } from '../utils/redisClient';

/**
 * Cross-process lock for the shared 2FA recovery inbox.
 *
 * cms and ums both run set2fa against the same inbox, and Telegram's "Your Code" email does not
 * name the account or phone. Two concurrent attempts cannot tell their codes apart, so only one
 * attempt (in any process) may request and read a code at a time. Both processes already share one
 * Redis (cms pushes the notice digest, ums drains it), so the lock lives there.
 *
 * The lock is an extra guard, not a requirement: when Redis is down the caller proceeds without it
 * (the UID snapshot and the ambiguity check still stop a wrong code).
 */
export interface MailboxLock {
    /** Returns a token when the lock was taken, null when another holder has it. Throws when the lock store is unreachable or not ready. */
    tryAcquire(ttlMs: number): Promise<string | null>;
    /** Releases only if `token` still owns the lock. */
    release(token: string): Promise<void>;
}

export const MAILBOX_LOCK_KEY = 'mailbox-lock::2fa-recovery-inbox';
const REDIS_COMMAND_TIMEOUT_MS = 5_000;
const RELEASE_IF_OWNER_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

async function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${what} timed out after ${REDIS_COMMAND_TIMEOUT_MS}ms`)), REDIS_COMMAND_TIMEOUT_MS);
                timer.unref?.();
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Minimal ioredis surface the lock uses (kept narrow so tests can pass a fake). */
export interface LockRedis {
    /** ioredis connection status; commands are sent only when 'ready' (never parked in the offline queue). */
    status: string;
    set(key: string, value: string, px: 'PX', ttl: number, nx: 'NX'): Promise<'OK' | null>;
    eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

export class RedisMailboxLock implements MailboxLock {
    constructor(private readonly getRedis: () => LockRedis = () => RedisClient.getClient() as unknown as LockRedis) {}

    async tryAcquire(ttlMs: number): Promise<string | null> {
        const redis = this.getRedis();
        if (redis.status !== 'ready') {
            // Not connected: a command now would wait in ioredis' offline queue and could take the
            // lock long after this attempt has given up on it.
            throw new Error(`redis not ready (status=${redis.status})`);
        }
        const token = randomUUID();
        try {
            const result = await withTimeout(redis.set(MAILBOX_LOCK_KEY, token, 'PX', ttlMs, 'NX'), 'mailbox lock acquire');
            return result === 'OK' ? token : null;
        } catch (error) {
            // The SET may still land later (ioredis resends unanswered commands on reconnect, in
            // order). Queue an owner-token release behind it so it cannot hold the key for the TTL.
            redis.eval(RELEASE_IF_OWNER_LUA, 1, MAILBOX_LOCK_KEY, token).catch(() => undefined);
            throw error;
        }
    }

    async release(token: string): Promise<void> {
        await withTimeout(this.getRedis().eval(RELEASE_IF_OWNER_LUA, 1, MAILBOX_LOCK_KEY, token), 'mailbox lock release');
    }
}

/** Same contract in memory. Used by tests; a shared instance stands in for the shared Redis key. */
export class InMemoryMailboxLock implements MailboxLock {
    private holder: { token: string; expiresAt: number } | null = null;

    async tryAcquire(ttlMs: number): Promise<string | null> {
        const now = Date.now();
        if (this.holder && this.holder.expiresAt > now) return null;
        const token = randomUUID();
        this.holder = { token, expiresAt: now + ttlMs };
        return token;
    }

    async release(token: string): Promise<void> {
        if (this.holder?.token === token) this.holder = null;
    }
}
