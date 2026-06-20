/**
 * WebshareProxyService — real-Mongo integration spec.
 *
 * Per externals-only policy: the ONLY mocked dependencies are true I/O —
 *  - the external Webshare HTTP API (axios instance), and
 *  - Redis (RedisClient).
 *
 * The sibling IpManagementService is REAL and backed by mongodb-memory-server
 * with the REAL ProxyIp model, so syncFromExternal / findProxyIpById /
 * markInactive / countBySource all run against a real collection. Assertions
 * verify the REAL sync counts returned by the service AND the REAL persisted
 * proxy rows (re-fetched from Mongo).
 */
import { BadRequestException } from '@nestjs/common';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import axios from 'axios';
import { WebshareProxyService } from '../webshare-proxy.service';
import { IpManagementService } from '../../ip-management/ip-management.service';
import { ProxyIp, ProxyIpDocument, ProxyIpSchema } from '../../ip-management/schemas/proxy-ip.schema';
import { RedisClient } from '../../../utils/redisClient';

jest.mock('axios');
jest.mock('../../../utils/redisClient', () => ({
    RedisClient: {
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(undefined),
        incr: jest.fn().mockResolvedValue(1),
    },
}));

const mockedRedis = RedisClient as unknown as {
    set: jest.Mock; get: jest.Mock; del: jest.Mock; incr: jest.Mock;
};

function makeAxiosClient() {
    return { get: jest.fn(), post: jest.fn() };
}

function proxy(over: any = {}) {
    return {
        id: 'id1',
        username: 'u',
        password: 'p',
        proxy_address: '1.2.3.4',
        port: 8080,
        valid: true,
        last_verification: '',
        country_code: 'US',
        city_name: 'NY',
        created_at: '',
        ...over,
    };
}

describe('WebshareProxyService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let proxyIpModel: Model<ProxyIpDocument>;
    let ipService: IpManagementService;
    let axiosClient: ReturnType<typeof makeAxiosClient>;
    let service: WebshareProxyService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'webshare-test' }).asPromise();
        proxyIpModel = connection.model<ProxyIpDocument>(ProxyIp.name, ProxyIpSchema);
        await proxyIpModel.init();
    });

    afterAll(async () => {
        if (connection) {
            await connection.dropDatabase();
            await connection.close();
        }
        if (mongod) await mongod.stop();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        axiosClient = makeAxiosClient();
        (axios.create as jest.Mock).mockReturnValue(axiosClient);
        ipService = new IpManagementService(proxyIpModel as any);
        service = new WebshareProxyService(ipService as any);
        mockedRedis.set.mockResolvedValue(undefined);
        mockedRedis.get.mockResolvedValue(null);
        mockedRedis.del.mockResolvedValue(undefined);
    });

    afterEach(async () => {
        await proxyIpModel.deleteMany({});
        delete process.env.WEBSHARE_API_KEY;
        delete process.env.WEBSHARE_API_URL;
        delete process.env.WEBSHARE_API_TIMEOUT;
    });

    // configures with apiKey to make service usable
    function configure() {
        process.env.WEBSHARE_API_KEY = 'test-key';
        service.onModuleInit();
    }

    // ==================== onModuleInit / isConfigured ====================
    describe('onModuleInit', () => {
        it('disables when WEBSHARE_API_KEY unset', () => {
            const warn = jest.spyOn((service as any).logger, 'warn');
            service.onModuleInit();
            expect(service.isConfigured()).toBe(false);
            expect(warn).toHaveBeenCalled();
            expect(axios.create).not.toHaveBeenCalled();
        });

        it('configures when WEBSHARE_API_KEY set', () => {
            process.env.WEBSHARE_API_KEY = 'k';
            process.env.WEBSHARE_API_URL = 'https://custom/api';
            process.env.WEBSHARE_API_TIMEOUT = '5000';
            service.onModuleInit();
            expect(service.isConfigured()).toBe(true);
            expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
                baseURL: 'https://custom/api',
                timeout: 5000,
            }));
        });
    });

    // ==================== ensureConfigured guards ====================
    describe('ensureConfigured guards', () => {
        it('throws BadRequest for all public methods when unconfigured', async () => {
            await expect(service.fetchAllProxies()).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.syncProxies()).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.replaceProxy('1.1.1.1', 80)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.refreshAndSync()).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.getProxyConfig()).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ==================== fetchAllProxies ====================
    describe('fetchAllProxies', () => {
        it('paginates until next is null', async () => {
            configure();
            axiosClient.get
                .mockResolvedValueOnce({ data: { results: [proxy({ id: 'a' })], next: 'page2', count: 2 } })
                .mockResolvedValueOnce({ data: { results: [proxy({ id: 'b' })], next: null, count: 2 } });
            const result = await service.fetchAllProxies();
            expect(result).toHaveLength(2);
            expect(axiosClient.get).toHaveBeenCalledTimes(2);
        });

        it('stops when length >= count even if next present', async () => {
            configure();
            axiosClient.get.mockResolvedValueOnce({
                data: { results: [proxy({ id: 'a' }), proxy({ id: 'b' })], next: 'page2', count: 2 },
            });
            const result = await service.fetchAllProxies();
            expect(result).toHaveLength(2);
            expect(axiosClient.get).toHaveBeenCalledTimes(1);
        });

        it('returns partial on error after first page', async () => {
            configure();
            axiosClient.get
                .mockResolvedValueOnce({ data: { results: [proxy({ id: 'a' })], next: 'page2', count: 5 } })
                .mockRejectedValueOnce(new Error('net fail'));
            const result = await service.fetchAllProxies();
            expect(result).toHaveLength(1);
        });

        it('rethrows on error on first page', async () => {
            configure();
            axiosClient.get.mockRejectedValueOnce(new Error('boom'));
            await expect(service.fetchAllProxies()).rejects.toThrow('boom');
        });
    });

    // ==================== syncProxies ====================
    describe('syncProxies', () => {
        it('filters valid proxies, persists real rows, writes redis on success', async () => {
            configure();
            axiosClient.get.mockResolvedValueOnce({
                data: {
                    results: [
                        proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001 }),
                        proxy({ id: 'b', proxy_address: '10.0.0.2', port: 1002, valid: false }), // filtered (invalid)
                        proxy({ id: 'c', proxy_address: null, port: 1003 }),                     // filtered (no address)
                    ],
                    next: null, count: 3,
                },
            });

            const result = await service.syncProxies(true);

            // REAL sync counts: only the 1 valid proxy reached the DB as an insert.
            expect(result.totalFetched).toBe(3);
            expect(result.created).toBe(1);
            expect(result.updated).toBe(0);
            expect(result.removed).toBe(0);
            expect(result.errors).toEqual([]);

            // REAL persisted row re-fetched from Mongo.
            const rows = await proxyIpModel.find({ source: 'webshare' }).lean();
            expect(rows).toHaveLength(1);
            expect(rows[0].ipAddress).toBe('10.0.0.1');
            expect(rows[0].port).toBe(1001);
            expect(rows[0].protocol).toBe('socks5');
            expect(rows[0].webshareId).toBe('a');
            expect(rows[0].status).toBe('active');

            expect(mockedRedis.set).toHaveBeenCalledWith('webshare:last-sync', expect.any(String));
            expect(mockedRedis.del).toHaveBeenCalledWith('webshare:last-sync-error');
        });

        it('updates existing rows and removes stale ones on a second sync', async () => {
            configure();
            // First sync: two proxies.
            axiosClient.get.mockResolvedValueOnce({
                data: {
                    results: [
                        proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001, country_code: 'US' }),
                        proxy({ id: 'b', proxy_address: '10.0.0.2', port: 1002, country_code: 'IN' }),
                    ],
                    next: null, count: 2,
                },
            });
            const first = await service.syncProxies(true);
            expect(first.created).toBe(2);

            // Second sync: proxy "a" changed country (update); "b" gone (stale removal).
            axiosClient.get.mockResolvedValueOnce({
                data: {
                    results: [proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001, country_code: 'GB' })],
                    next: null, count: 1,
                },
            });
            const second = await service.syncProxies(true);
            expect(second.totalFetched).toBe(1);
            expect(second.created).toBe(0);
            expect(second.updated).toBe(1);
            expect(second.removed).toBe(1);

            const rows = await proxyIpModel.find({ source: 'webshare' }).lean();
            expect(rows).toHaveLength(1);
            expect(rows[0].ipAddress).toBe('10.0.0.1');
            expect(rows[0].countryCode).toBe('GB');
        });

        it('does NOT prune the pool when the fetch was INCOMPLETE (partial fetch + removeStale)', async () => {
            configure();
            // First sync: two proxies across pages, both persisted.
            axiosClient.get.mockResolvedValueOnce({
                data: {
                    results: [
                        proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001 }),
                        proxy({ id: 'b', proxy_address: '10.0.0.2', port: 1002 }),
                    ],
                    next: null, count: 2,
                },
            });
            await service.syncProxies(true);
            expect(await proxyIpModel.countDocuments({ source: 'webshare' })).toBe(2);

            // Second sync: page 1 succeeds (only proxy "a"), page 2 ERRORS -> partial fetch.
            // proxy "b" is still valid in Webshare; it must NOT be deleted from a partial set.
            axiosClient.get
                .mockResolvedValueOnce({ data: { results: [proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001 })], next: 'page2', count: 2 } })
                .mockRejectedValueOnce(new Error('network blip on page 2'));

            const result = await service.syncProxies(true);

            expect(result.removed).toBe(0);            // no pruning on incomplete data
            const rows = await proxyIpModel.find({ source: 'webshare' }).lean();
            expect(rows.map(r => r.ipAddress).sort()).toEqual(['10.0.0.1', '10.0.0.2']); // both survive
        });

        it('keeps stale rows when removeStale is false', async () => {
            configure();
            axiosClient.get.mockResolvedValueOnce({
                data: {
                    results: [
                        proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001 }),
                        proxy({ id: 'b', proxy_address: '10.0.0.2', port: 1002 }),
                    ],
                    next: null, count: 2,
                },
            });
            await service.syncProxies(true);

            axiosClient.get.mockResolvedValueOnce({
                data: { results: [proxy({ id: 'a', proxy_address: '10.0.0.1', port: 1001 })], next: null, count: 1 },
            });
            const result = await service.syncProxies(false);
            expect(result.removed).toBe(0);
            const rows = await proxyIpModel.find({ source: 'webshare' }).lean();
            expect(rows).toHaveLength(2);
        });

        it('swallows redis set error in success path (real created count preserved)', async () => {
            configure();
            axiosClient.get.mockResolvedValueOnce({
                data: { results: [proxy({ proxy_address: '10.0.0.9', port: 1009 })], next: null, count: 1 },
            });
            mockedRedis.set.mockRejectedValueOnce(new Error('redis down'));
            const result = await service.syncProxies(true);
            expect(result.created).toBe(1);
            expect(await proxyIpModel.countDocuments({ source: 'webshare' })).toBe(1);
        });

        it('catch path returns errors array and writes error key', async () => {
            configure();
            axiosClient.get.mockRejectedValue(new Error('fetch broke'));
            const result = await service.syncProxies(true);
            expect(result.errors).toEqual(['fetch broke']);
            expect(result.totalFetched).toBe(0);
            expect(mockedRedis.set).toHaveBeenCalledWith('webshare:last-sync-error', 'fetch broke');
        });

        it('swallows redis set error in catch path', async () => {
            configure();
            axiosClient.get.mockRejectedValue(new Error('fetch broke'));
            mockedRedis.set.mockRejectedValue(new Error('redis down'));
            const result = await service.syncProxies(true);
            expect(result.errors).toEqual(['fetch broke']);
        });
    });

    // ==================== replaceProxy ====================
    describe('replaceProxy', () => {
        it('returns success:false when proxy not from webshare', async () => {
            configure();
            // Persist a real manual-source proxy.
            await proxyIpModel.create({
                ipAddress: '1.1.1.1', port: 80, protocol: 'socks5', source: 'manual', status: 'active',
            });
            const result = await service.replaceProxy('1.1.1.1', 80);
            expect(result.success).toBe(false);
            expect(result.message).toContain('not from Webshare');
        });

        it('marks the real row inactive, posts replacement and returns success', async () => {
            configure();
            await proxyIpModel.create({
                ipAddress: '2.2.2.2', port: 90, protocol: 'socks5', source: 'webshare', status: 'active',
            });
            axiosClient.post.mockResolvedValue({ status: 201, data: { id: 'repl-1' } });

            const result = await service.replaceProxy('2.2.2.2', 90, 'US');
            expect(result.success).toBe(true);
            expect(result.replacementId).toBe('repl-1');
            expect(axiosClient.post).toHaveBeenCalledWith('/proxy/replacement/', {
                proxy_address: '2.2.2.2', country_code: 'US',
            });

            // REAL effect: the row was marked inactive in Mongo.
            const row = await proxyIpModel.findOne({ ipAddress: '2.2.2.2', port: 90 }).lean();
            expect(row!.status).toBe('inactive');
        });

        it('returns success:false on error (proxy not found)', async () => {
            configure();
            const result = await service.replaceProxy('9.9.9.9', 70);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Replacement failed');
        });

        it('ROLLS BACK to active when the Webshare replacement POST fails', async () => {
            // Real scenario: markInactive runs first, then the Webshare POST times out / 429s.
            // Without rollback the proxy is left inactive FOREVER and silently leaves rotation,
            // shrinking the pool. The proxy must be restored to active on POST failure.
            configure();
            await proxyIpModel.create({
                ipAddress: '5.5.5.5', port: 95, protocol: 'socks5', source: 'webshare', status: 'active',
            });
            axiosClient.post.mockRejectedValue(new Error('429 Too Many Requests'));

            const result = await service.replaceProxy('5.5.5.5', 95);
            expect(result.success).toBe(false);

            const row = await proxyIpModel.findOne({ ipAddress: '5.5.5.5', port: 95 }).lean();
            expect(row!.status).toBe('active'); // restored, not stranded inactive
        });

        it('replaces without a country code (no country_code in the body)', async () => {
            // Drives the `if (preferredCountry)` FALSE branch — replacement body omits country_code.
            configure();
            await proxyIpModel.create({
                ipAddress: '3.3.3.3', port: 91, protocol: 'socks5', source: 'webshare', status: 'active',
            });
            axiosClient.post.mockResolvedValue({ status: 201, data: { id: 'repl-2' } });

            const result = await service.replaceProxy('3.3.3.3', 91);
            expect(result.success).toBe(true);
            expect(axiosClient.post).toHaveBeenCalledWith('/proxy/replacement/', {
                proxy_address: '3.3.3.3',
            });
        });

        it('reports "manual" when a non-webshare proxy has no explicit source', async () => {
            // Drives the `proxy.source || 'manual'` fallback when source is null.
            configure();
            await proxyIpModel.create({
                ipAddress: '4.4.4.4', port: 92, protocol: 'socks5', source: null as any, status: 'active',
            });
            const result = await service.replaceProxy('4.4.4.4', 92);
            expect(result.success).toBe(false);
            expect(result.message).toContain('source: manual');
        });
    });

    // ==================== refreshAndSync ====================
    // NOTE: refreshAndSync has a hardcoded 5s setTimeout before syncing. We use
    // real timers here (fake timers freeze the MongoDB driver's internal timers
    // so the real syncFromExternal would deadlock) and shorten the wait by
    // stubbing only the global setTimeout used for the propagation delay.
    describe('refreshAndSync', () => {
        let setTimeoutSpy: jest.SpyInstance;

        afterEach(() => {
            if (setTimeoutSpy) setTimeoutSpy.mockRestore();
        });

        it('posts refresh, waits, then syncs into real DB', async () => {
            configure();
            // Collapse the 5000ms propagation wait to a near-immediate timer so
            // the subsequent REAL Mongo sync runs without a long real delay.
            setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any) => {
                return (setImmediate as any)(fn);
            }) as any);
            axiosClient.post.mockResolvedValue({ status: 200 });
            axiosClient.get.mockResolvedValue({
                data: { results: [proxy({ proxy_address: '5.5.5.5', port: 55 })], next: null, count: 1 },
            });
            const result = await service.refreshAndSync();
            expect(axiosClient.post).toHaveBeenCalledWith('/proxy/refresh/');
            expect(result.created).toBe(1);
            expect(await proxyIpModel.countDocuments({ source: 'webshare' })).toBe(1);
        });

        it('rethrows on refresh error', async () => {
            configure();
            axiosClient.post.mockRejectedValue(new Error('refresh fail'));
            await expect(service.refreshAndSync()).rejects.toThrow('refresh fail');
        });
    });

    // ==================== getStatus ====================
    describe('getStatus', () => {
        it('returns not-configured branch', async () => {
            const result = await service.getStatus();
            expect(result.configured).toBe(false);
            expect(result.lastSyncError).toContain('not configured');
        });

        it('returns configured + apiKeyValid true with REAL db count', async () => {
            configure();
            // Seed 2 real webshare rows so countBySource returns the real number.
            await proxyIpModel.create([
                { ipAddress: '7.0.0.1', port: 71, protocol: 'socks5', source: 'webshare', status: 'active' },
                { ipAddress: '7.0.0.2', port: 72, protocol: 'socks5', source: 'webshare', status: 'active' },
            ]);
            axiosClient.get.mockResolvedValue({ data: { count: 42 } });
            mockedRedis.get.mockResolvedValueOnce('2026-01-01').mockResolvedValueOnce(null);
            const result = await service.getStatus();
            expect(result.configured).toBe(true);
            expect(result.apiKeyValid).toBe(true);
            expect(result.totalProxiesInWebshare).toBe(42);
            expect(result.totalProxiesInDb).toBe(2);
            expect(result.lastSyncAt).toBe('2026-01-01');
        });

        it('apiKeyValid false when api throws; swallows redis get error', async () => {
            configure();
            axiosClient.get.mockRejectedValue(new Error('401'));
            mockedRedis.get.mockRejectedValue(new Error('redis down'));
            const result = await service.getStatus();
            expect(result.apiKeyValid).toBe(false);
            expect(result.totalProxiesInDb).toBe(0);
            expect(result.lastSyncAt).toBeNull();
        });
    });

    // ==================== getProxyConfig ====================
    describe('getProxyConfig', () => {
        it('returns config data on success', async () => {
            configure();
            axiosClient.get.mockResolvedValue({ data: { username: 'u', request_timeout: 5 } });
            const result = await service.getProxyConfig();
            expect(result).toEqual({ username: 'u', request_timeout: 5 });
        });

        it('rethrows on error', async () => {
            configure();
            axiosClient.get.mockRejectedValue(new Error('config fail'));
            await expect(service.getProxyConfig()).rejects.toThrow('config fail');
        });
    });
});
