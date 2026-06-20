/**
 * Tests for RedisClient wrapper (src/utils/redisClient.ts).
 *
 * We mock ONLY the external `ioredis` library. The fake Redis instance exposes
 * every command used by the wrapper as jest.fn(). All wrapper logic (singleton
 * behaviour, JSON (de)serialisation, retryStrategy, event handlers, error
 * branches) runs for real.
 */

// ---- Mock ioredis ------------------------------------------------------------
const eventHandlers: Record<string, (...args: any[]) => void> = {};

const fakeRedis = {
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
        eventHandlers[event] = handler;
        return fakeRedis;
    }),
    quit: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    incr: jest.fn(),
    incrby: jest.fn(),
    decr: jest.fn(),
    decrby: jest.fn(),
    rpush: jest.fn(),
    lrange: jest.fn(),
    hset: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    sadd: jest.fn(),
    smembers: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
};

let constructorConfig: any;
const RedisCtor = jest.fn().mockImplementation((config: any) => {
    constructorConfig = config;
    return fakeRedis;
});

jest.mock('ioredis', () => ({
    __esModule: true,
    default: RedisCtor,
}));

import { RedisClient } from '../redisClient';

// Reset the singleton + mocks between every test for isolation.
async function resetSingleton() {
    // Force-clear the private static instance via disconnect path or reflection.
    (RedisClient as any).instance = null;
    for (const k of Object.keys(eventHandlers)) delete eventHandlers[k];
    jest.clearAllMocks();
}

beforeEach(async () => {
    await resetSingleton();
    delete process.env.REDIS_MODE;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;
});

describe('RedisClient.getClient (singleton + config)', () => {
    test('constructs a Redis instance once and reuses it (singleton)', () => {
        const a = RedisClient.getClient();
        const b = RedisClient.getClient();
        expect(a).toBe(b);
        expect(RedisCtor).toHaveBeenCalledTimes(1);
    });

    test('registers connect/error/close event handlers and they run without throwing', () => {
        RedisClient.getClient();
        expect(typeof eventHandlers['connect']).toBe('function');
        expect(typeof eventHandlers['error']).toBe('function');
        expect(typeof eventHandlers['close']).toBe('function');
        // invoke them to cover the handler bodies
        eventHandlers['connect']();
        eventHandlers['error']({ message: 'boom' });
        eventHandlers['close']();
    });

    test('local default config when REDIS_MODE is not remote', () => {
        RedisClient.getClient();
        expect(constructorConfig.host).toBe('127.0.0.1');
        expect(constructorConfig.port).toBe(6379);
        expect(constructorConfig.db).toBe(0);
        expect(constructorConfig.password).toBeUndefined();
    });

    test('remote default host when REDIS_MODE=remote', () => {
        process.env.REDIS_MODE = 'remote';
        RedisClient.getClient();
        expect(constructorConfig.host).toBe('0.0.0.0');
    });

    test('honours explicit env overrides incl. trimmed password', () => {
        process.env.REDIS_HOST = 'cache.example.com';
        process.env.REDIS_PORT = '6380';
        process.env.REDIS_PASSWORD = '  secret  ';
        process.env.REDIS_DB = '3';
        RedisClient.getClient();
        expect(constructorConfig.host).toBe('cache.example.com');
        expect(constructorConfig.port).toBe(6380);
        expect(constructorConfig.password).toBe('secret');
        expect(constructorConfig.db).toBe(3);
    });

    test('retryStrategy backs off linearly and caps at 3000ms', () => {
        RedisClient.getClient();
        const strat = constructorConfig.retryStrategy;
        expect(strat(1)).toBe(100);
        expect(strat(5)).toBe(500);
        expect(strat(100)).toBe(3000); // capped
    });

    test('rethrows wrapped error when constructor throws', () => {
        (RedisClient as any).instance = null;
        RedisCtor.mockImplementationOnce(() => {
            throw new Error('ctor fail');
        });
        expect(() => RedisClient.getClient()).toThrow(/Redis initialization failed: ctor fail/);
    });
});

describe('RedisClient.disconnect', () => {
    test('quits and nulls the instance on success', async () => {
        RedisClient.getClient();
        fakeRedis.quit.mockResolvedValueOnce('OK');
        await RedisClient.disconnect();
        expect(fakeRedis.quit).toHaveBeenCalled();
        expect((RedisClient as any).instance).toBeNull();
    });

    test('swallows quit errors but still nulls the instance', async () => {
        RedisClient.getClient();
        fakeRedis.quit.mockRejectedValueOnce(new Error('quit fail'));
        await expect(RedisClient.disconnect()).resolves.toBeUndefined();
        expect((RedisClient as any).instance).toBeNull();
    });

    test('no-op when there is no instance', async () => {
        await RedisClient.disconnect();
        expect(fakeRedis.quit).not.toHaveBeenCalled();
    });
});

describe('set / get / getObject', () => {
    test('set serialises objects to JSON without ttl', async () => {
        fakeRedis.set.mockResolvedValueOnce('OK');
        const res = await RedisClient.set('k', { a: 1 });
        expect(res).toBe('OK');
        expect(fakeRedis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }));
    });

    test('set stringifies primitive values and applies EX ttl', async () => {
        fakeRedis.set.mockResolvedValueOnce('OK');
        await RedisClient.set('k', 42, 60);
        expect(fakeRedis.set).toHaveBeenCalledWith('k', '42', 'EX', 60);
    });

    test('set logs and rethrows on error', async () => {
        fakeRedis.set.mockRejectedValueOnce(new Error('set fail'));
        await expect(RedisClient.set('k', 'v')).rejects.toThrow('set fail');
    });

    test('get returns raw string', async () => {
        fakeRedis.get.mockResolvedValueOnce('hello');
        expect(await RedisClient.get('k')).toBe('hello');
    });

    test('get logs and rethrows on error', async () => {
        fakeRedis.get.mockRejectedValueOnce(new Error('get fail'));
        await expect(RedisClient.get('k')).rejects.toThrow('get fail');
    });

    test('getObject parses JSON', async () => {
        fakeRedis.get.mockResolvedValueOnce(JSON.stringify({ x: 1 }));
        expect(await RedisClient.getObject<{ x: number }>('k')).toEqual({ x: 1 });
    });

    test('getObject returns null when value missing', async () => {
        fakeRedis.get.mockResolvedValueOnce(null);
        expect(await RedisClient.getObject('k')).toBeNull();
    });

    test('getObject returns null and warns on bad JSON', async () => {
        fakeRedis.get.mockResolvedValueOnce('{not-json');
        expect(await RedisClient.getObject('k')).toBeNull();
    });
});

describe('numeric helpers', () => {
    test('incr uses incr for step 1, incrby otherwise', async () => {
        fakeRedis.incr.mockResolvedValueOnce(1);
        expect(await RedisClient.incr('k')).toBe(1);
        expect(fakeRedis.incr).toHaveBeenCalledWith('k');

        fakeRedis.incrby.mockResolvedValueOnce(5);
        expect(await RedisClient.incr('k', 5)).toBe(5);
        expect(fakeRedis.incrby).toHaveBeenCalledWith('k', 5);
    });

    test('incr rethrows on error', async () => {
        fakeRedis.incr.mockRejectedValueOnce(new Error('incr fail'));
        await expect(RedisClient.incr('k')).rejects.toThrow('incr fail');
    });

    test('decr uses decr for step 1, decrby otherwise', async () => {
        fakeRedis.decr.mockResolvedValueOnce(0);
        expect(await RedisClient.decr('k')).toBe(0);
        expect(fakeRedis.decr).toHaveBeenCalledWith('k');

        fakeRedis.decrby.mockResolvedValueOnce(-3);
        expect(await RedisClient.decr('k', 3)).toBe(-3);
        expect(fakeRedis.decrby).toHaveBeenCalledWith('k', 3);
    });

    test('decr rethrows on error', async () => {
        fakeRedis.decr.mockRejectedValueOnce(new Error('decr fail'));
        await expect(RedisClient.decr('k')).rejects.toThrow('decr fail');
    });
});

describe('lists', () => {
    test('rpush spreads arrays and passes single values', async () => {
        fakeRedis.rpush.mockResolvedValue(1);
        await RedisClient.rpush('k', ['a', 'b']);
        expect(fakeRedis.rpush).toHaveBeenCalledWith('k', 'a', 'b');
        await RedisClient.rpush('k', 'c');
        expect(fakeRedis.rpush).toHaveBeenCalledWith('k', 'c');
    });

    test('rpush rethrows on error', async () => {
        fakeRedis.rpush.mockRejectedValueOnce(new Error('rpush fail'));
        await expect(RedisClient.rpush('k', 'a')).rejects.toThrow('rpush fail');
    });

    test('lrange delegates', async () => {
        fakeRedis.lrange.mockResolvedValueOnce(['a', 'b']);
        expect(await RedisClient.lrange('k', 0, -1)).toEqual(['a', 'b']);
        expect(fakeRedis.lrange).toHaveBeenCalledWith('k', 0, -1);
    });
});

describe('hashes', () => {
    test('hset stringifies primitive and object values', async () => {
        fakeRedis.hset.mockResolvedValue(1);
        await RedisClient.hset('k', 'f', 7);
        expect(fakeRedis.hset).toHaveBeenCalledWith('k', 'f', '7');
        await RedisClient.hset('k', 'f', { z: 1 });
        expect(fakeRedis.hset).toHaveBeenCalledWith('k', 'f', JSON.stringify({ z: 1 }));
    });

    test('hget delegates', async () => {
        fakeRedis.hget.mockResolvedValueOnce('v');
        expect(await RedisClient.hget('k', 'f')).toBe('v');
    });

    test('hgetObject parses JSON, returns null on missing and on bad JSON', async () => {
        fakeRedis.hget.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
        expect(await RedisClient.hgetObject('k', 'f')).toEqual({ a: 1 });

        fakeRedis.hget.mockResolvedValueOnce(null);
        expect(await RedisClient.hgetObject('k', 'f')).toBeNull();

        fakeRedis.hget.mockResolvedValueOnce('{bad');
        expect(await RedisClient.hgetObject('k', 'f')).toBeNull();
    });

    test('hgetall delegates', async () => {
        fakeRedis.hgetall.mockResolvedValueOnce({ a: '1' });
        expect(await RedisClient.hgetall('k')).toEqual({ a: '1' });
    });
});

describe('sets', () => {
    test('sadd spreads arrays and passes single members', async () => {
        fakeRedis.sadd.mockResolvedValue(1);
        await RedisClient.sadd('k', ['a', 'b']);
        expect(fakeRedis.sadd).toHaveBeenCalledWith('k', 'a', 'b');
        await RedisClient.sadd('k', 'c');
        expect(fakeRedis.sadd).toHaveBeenCalledWith('k', 'c');
    });

    test('smembers delegates', async () => {
        fakeRedis.smembers.mockResolvedValueOnce(['x']);
        expect(await RedisClient.smembers('k')).toEqual(['x']);
    });
});

describe('keys / ttl', () => {
    test('del spreads arrays and passes single key', async () => {
        fakeRedis.del.mockResolvedValue(1);
        await RedisClient.del(['a', 'b']);
        expect(fakeRedis.del).toHaveBeenCalledWith('a', 'b');
        await RedisClient.del('c');
        expect(fakeRedis.del).toHaveBeenCalledWith('c');
    });

    test('exists returns boolean from count', async () => {
        fakeRedis.exists.mockResolvedValueOnce(1);
        expect(await RedisClient.exists('k')).toBe(true);
        fakeRedis.exists.mockResolvedValueOnce(0);
        expect(await RedisClient.exists('k')).toBe(false);
    });

    test('expire delegates', async () => {
        fakeRedis.expire.mockResolvedValueOnce(1);
        expect(await RedisClient.expire('k', 30)).toBe(1);
        expect(fakeRedis.expire).toHaveBeenCalledWith('k', 30);
    });

    test('ttl delegates', async () => {
        fakeRedis.ttl.mockResolvedValueOnce(99);
        expect(await RedisClient.ttl('k')).toBe(99);
    });
});
