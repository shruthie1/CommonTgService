import Redis from "ioredis";
import { Logger } from "./logger";

const logger = new Logger(__filename);

const DEFAULT_REDIS_URI = "redis://127.0.0.1:6379";
// The managed Valkey (Aiven) drops idle connections every 5-15 min. TCP keepalive does not reset a
// server-side idle timeout (only commands do), so an idle client also sends a PING once a minute.
const KEEPALIVE_MS = 30_000;
const PING_INTERVAL_MS = 60_000;

/** protocol//hostname:port only; never credentials. */
function describeRedisUri(uri: string): string {
    try {
        const u = new URL(uri);
        return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
    } catch {
        return "REDIS_URI(unparseable)";
    }
}

/**
 * Singleton Redis client with strong typing and extended utility methods.
 */
export class RedisClient {
    private static instance: Redis | null = null;
    private static pingTimer: NodeJS.Timeout | null = null;

    private constructor() {
        // Private constructor to enforce singleton pattern
    }

    /**
     * Gets the singleton Redis client instance.
     * @returns Redis client instance.
     * @throws Error if connection cannot be established.
     */
    static getClient(): Redis {
        if (!RedisClient.instance) {
            // REDIS_URI is the only config source (e.g. rediss://user:pass@host:port for the managed
            // TLS Valkey); ioredis enables TLS for rediss://. Local-dev default otherwise.
            const uri = process.env.REDIS_URI?.trim() || DEFAULT_REDIS_URI;
            const target = describeRedisUri(uri);
            const retryStrategy = (times: number) => {
                const delay = Math.min(times * 100, 3000); // Exponential backoff, max 3s
                logger.debug(`Retrying Redis connection (${times}) after ${delay}ms`);
                return delay;
            };

            try {
                RedisClient.instance = new Redis(uri, { retryStrategy, keepAlive: KEEPALIVE_MS });
                const client = RedisClient.instance;
                // Only while ready: a PING issued while reconnecting would sit in the offline queue.
                // Failures are reported by the error/close handlers, so the PING result is ignored.
                RedisClient.pingTimer = setInterval(() => {
                    if (client.status === "ready") client.ping().catch(() => undefined);
                }, PING_INTERVAL_MS);
                RedisClient.pingTimer.unref();

                RedisClient.instance.on("connect", () => {
                    logger.log(`Connected to Redis at ${target}`);
                });

                RedisClient.instance.on("error", (err) => {
                    logger.error("Redis connection error:", err.message);
                });

                RedisClient.instance.on("close", () => {
                    logger.debug("Redis connection closed"); // routine idle close; ioredis reconnects
                });
            } catch (error: any) {
                logger.error("Failed to initialize Redis client:", error);
                throw new Error(`Redis initialization failed: ${error.message}`);
            }
        }

        return RedisClient.instance;
    }

    /**
     * Gracefully disconnects the Redis client.
     */
    /** Stops the idle PING (shutdown). The connection itself is left to disconnect(). */
    static stopPing(): void {
        if (RedisClient.pingTimer) {
            clearInterval(RedisClient.pingTimer);
            RedisClient.pingTimer = null;
        }
    }

    static async disconnect(): Promise<void> {
        RedisClient.stopPing();
        if (RedisClient.instance) {
            try {
                await RedisClient.instance.quit();
                logger.log("Redis client disconnected successfully");
            } catch (error) {
                logger.error("Error during Redis disconnection:", error);
            } finally {
                RedisClient.instance = null;
            }
        }
    }

    // -------------------- STRING / OBJECT --------------------

    /**
     * Sets a key-value pair with an optional expiration time.
     */
    static async set<T extends object | string | number>(
        key: string,
        value: T,
        ttl?: number
    ): Promise<"OK"> {
        const client = RedisClient.getClient();
        try {
            const finalValue =
                typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : JSON.stringify(value);

            if (ttl) {
                return await client.set(key, finalValue, "EX", ttl);
            }
            return await client.set(key, finalValue);
        } catch (error) {
            logger.error(`Error setting key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Gets a value by key (raw string).
     */
    static async get(key: string): Promise<string | null> {
        const client = RedisClient.getClient();
        try {
            return await client.get(key);
        } catch (error) {
            logger.error(`Error getting key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Gets and parses a JSON value by key.
     */
    static async getObject<T>(key: string): Promise<T | null> {
        const value = await RedisClient.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            logger.warn(`Failed to parse JSON for key ${key}`);
            return null;
        }
    }

    // -------------------- NUMERIC HELPERS --------------------

    /**
     * Increments a numeric value by step (default 1).
     */
    static async incr(key: string, step = 1): Promise<number> {
        const client = RedisClient.getClient();
        try {
            return step === 1
                ? await client.incr(key)
                : await client.incrby(key, step);
        } catch (error) {
            logger.error(`Error incrementing key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Decrements a numeric value by step (default 1).
     */
    static async decr(key: string, step = 1): Promise<number> {
        const client = RedisClient.getClient();
        try {
            return step === 1
                ? await client.decr(key)
                : await client.decrby(key, step);
        } catch (error) {
            logger.error(`Error decrementing key ${key}:`, error);
            throw error;
        }
    }

    // -------------------- LISTS --------------------

    static async rpush(key: string, values: string | string[]): Promise<number> {
        const client = RedisClient.getClient();
        try {
            return Array.isArray(values)
                ? await client.rpush(key, ...values)
                : await client.rpush(key, values);
        } catch (error) {
            logger.error(`Error pushing to list ${key}:`, error);
            throw error;
        }
    }

    static async lrange(
        key: string,
        start: number,
        end: number
    ): Promise<string[]> {
        const client = RedisClient.getClient();
        return client.lrange(key, start, end);
    }

    // -------------------- HASHES --------------------

    static async hset(
        key: string,
        field: string,
        value: string | number | object
    ): Promise<number> {
        const client = RedisClient.getClient();
        const val =
            typeof value === "string" || typeof value === "number"
                ? String(value)
                : JSON.stringify(value);
        return client.hset(key, field, val);
    }

    static async hget(key: string, field: string): Promise<string | null> {
        return RedisClient.getClient().hget(key, field);
    }

    static async hgetObject<T>(
        key: string,
        field: string
    ): Promise<T | null> {
        const val = await RedisClient.hget(key, field);
        if (!val) return null;
        try {
            return JSON.parse(val) as T;
        } catch {
            return null;
        }
    }

    static async hgetall(
        key: string
    ): Promise<Record<string, string>> {
        return RedisClient.getClient().hgetall(key);
    }

    // -------------------- SETS --------------------

    static async sadd(key: string, members: string | string[]): Promise<number> {
        return Array.isArray(members)
            ? RedisClient.getClient().sadd(key, ...members)
            : RedisClient.getClient().sadd(key, members);
    }

    static async smembers(key: string): Promise<string[]> {
        return RedisClient.getClient().smembers(key);
    }

    // -------------------- KEYS / TTL --------------------

    static async del(keys: string | string[]): Promise<number> {
        return Array.isArray(keys)
            ? RedisClient.getClient().del(...keys)
            : RedisClient.getClient().del(keys);
    }

    static async exists(key: string): Promise<boolean> {
        return (await RedisClient.getClient().exists(key)) === 1;
    }

    static async expire(key: string, seconds: number): Promise<number> {
        return RedisClient.getClient().expire(key, seconds);
    }

    static async ttl(key: string): Promise<number> {
        return RedisClient.getClient().ttl(key);
    }
}