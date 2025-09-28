"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
const logger = new logger_1.Logger(__filename);
class RedisClient {
    constructor() {
    }
    static getClient() {
        if (!RedisClient.instance) {
            const isRemote = process.env.REDIS_MODE === "remote";
            const config = {
                host: process.env.REDIS_HOST || (isRemote ? "0.0.0.0" : "127.0.0.1"),
                port: Number(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD?.trim() || undefined,
                db: Number(process.env.REDIS_DB) || 0,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 100, 3000);
                    logger.warn(`Retrying Redis connection (${times}) after ${delay}ms`);
                    return delay;
                },
            };
            try {
                RedisClient.instance = new ioredis_1.default(config);
                RedisClient.instance.on("connect", () => {
                    logger.log(`Connected to Redis at ${config.host}:${config.port}, DB: ${config.db}`);
                });
                RedisClient.instance.on("error", (err) => {
                    logger.error("Redis connection error:", err.message);
                });
                RedisClient.instance.on("close", () => {
                    logger.log("Redis connection closed");
                });
            }
            catch (error) {
                logger.error("Failed to initialize Redis client:", error);
                throw new Error(`Redis initialization failed: ${error.message}`);
            }
        }
        return RedisClient.instance;
    }
    static async disconnect() {
        if (RedisClient.instance) {
            try {
                await RedisClient.instance.quit();
                logger.log("Redis client disconnected successfully");
            }
            catch (error) {
                logger.error("Error during Redis disconnection:", error);
            }
            finally {
                RedisClient.instance = null;
            }
        }
    }
    static async set(key, value, ttl) {
        const client = RedisClient.getClient();
        try {
            const finalValue = typeof value === "string" || typeof value === "number"
                ? String(value)
                : JSON.stringify(value);
            if (ttl) {
                return await client.set(key, finalValue, "EX", ttl);
            }
            return await client.set(key, finalValue);
        }
        catch (error) {
            logger.error(`Error setting key ${key}:`, error);
            throw error;
        }
    }
    static async get(key) {
        const client = RedisClient.getClient();
        try {
            return await client.get(key);
        }
        catch (error) {
            logger.error(`Error getting key ${key}:`, error);
            throw error;
        }
    }
    static async getObject(key) {
        const value = await RedisClient.get(key);
        if (!value)
            return null;
        try {
            return JSON.parse(value);
        }
        catch {
            logger.warn(`Failed to parse JSON for key ${key}`);
            return null;
        }
    }
    static async incr(key, step = 1) {
        const client = RedisClient.getClient();
        try {
            return step === 1
                ? await client.incr(key)
                : await client.incrby(key, step);
        }
        catch (error) {
            logger.error(`Error incrementing key ${key}:`, error);
            throw error;
        }
    }
    static async decr(key, step = 1) {
        const client = RedisClient.getClient();
        try {
            return step === 1
                ? await client.decr(key)
                : await client.decrby(key, step);
        }
        catch (error) {
            logger.error(`Error decrementing key ${key}:`, error);
            throw error;
        }
    }
    static async rpush(key, values) {
        const client = RedisClient.getClient();
        try {
            return Array.isArray(values)
                ? await client.rpush(key, ...values)
                : await client.rpush(key, values);
        }
        catch (error) {
            logger.error(`Error pushing to list ${key}:`, error);
            throw error;
        }
    }
    static async lrange(key, start, end) {
        const client = RedisClient.getClient();
        return client.lrange(key, start, end);
    }
    static async hset(key, field, value) {
        const client = RedisClient.getClient();
        const val = typeof value === "string" || typeof value === "number"
            ? String(value)
            : JSON.stringify(value);
        return client.hset(key, field, val);
    }
    static async hget(key, field) {
        return RedisClient.getClient().hget(key, field);
    }
    static async hgetObject(key, field) {
        const val = await RedisClient.hget(key, field);
        if (!val)
            return null;
        try {
            return JSON.parse(val);
        }
        catch {
            return null;
        }
    }
    static async hgetall(key) {
        return RedisClient.getClient().hgetall(key);
    }
    static async sadd(key, members) {
        return Array.isArray(members)
            ? RedisClient.getClient().sadd(key, ...members)
            : RedisClient.getClient().sadd(key, members);
    }
    static async smembers(key) {
        return RedisClient.getClient().smembers(key);
    }
    static async del(keys) {
        return Array.isArray(keys)
            ? RedisClient.getClient().del(...keys)
            : RedisClient.getClient().del(keys);
    }
    static async exists(key) {
        return (await RedisClient.getClient().exists(key)) === 1;
    }
    static async expire(key, seconds) {
        return RedisClient.getClient().expire(key, seconds);
    }
    static async ttl(key) {
        return RedisClient.getClient().ttl(key);
    }
}
exports.RedisClient = RedisClient;
RedisClient.instance = null;
//# sourceMappingURL=redisClient.js.map