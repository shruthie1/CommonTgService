import Redis from "ioredis";
export declare class RedisClient {
    private static instance;
    private constructor();
    static getClient(): Redis;
    static disconnect(): Promise<void>;
    static set<T extends object | string | number>(key: string, value: T, ttl?: number): Promise<"OK">;
    static get(key: string): Promise<string | null>;
    static getObject<T>(key: string): Promise<T | null>;
    static incr(key: string, step?: number): Promise<number>;
    static decr(key: string, step?: number): Promise<number>;
    static rpush(key: string, values: string | string[]): Promise<number>;
    static lrange(key: string, start: number, end: number): Promise<string[]>;
    static hset(key: string, field: string, value: string | number | object): Promise<number>;
    static hget(key: string, field: string): Promise<string | null>;
    static hgetObject<T>(key: string, field: string): Promise<T | null>;
    static hgetall(key: string): Promise<Record<string, string>>;
    static sadd(key: string, members: string | string[]): Promise<number>;
    static smembers(key: string): Promise<string[]>;
    static del(keys: string | string[]): Promise<number>;
    static exists(key: string): Promise<boolean>;
    static expire(key: string, seconds: number): Promise<number>;
    static ttl(key: string): Promise<number>;
}
