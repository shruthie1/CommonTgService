import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IpManagementService } from '../ip-management.service';
import { ProxyIp, ProxyIpSchema, ProxyIpDocument } from '../schemas/proxy-ip.schema';
import { RedisClient } from '../../../utils/redisClient';

// Silence logger output
jest.spyOn(require('../../../utils').Logger.prototype, 'log').mockImplementation(() => {});
jest.spyOn(require('../../../utils').Logger.prototype, 'debug').mockImplementation(() => {});
jest.spyOn(require('../../../utils').Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(require('../../../utils').Logger.prototype, 'error').mockImplementation(() => {});

const baseProxy = (overrides: Partial<ProxyIp> = {}): any => ({
    ipAddress: '10.0.0.1',
    port: 8080,
    protocol: 'http',
    status: 'active',
    isAssigned: false,
    source: 'manual',
    ...overrides,
});

describe('IpManagementService (real mongo)', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<ProxyIpDocument>;
    let service: IpManagementService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose
            .createConnection(mongod.getUri(), { dbName: 'ip-mgmt-svc-test' })
            .asPromise();
        model = connection.model<ProxyIpDocument>('ProxyIpSvcTest', ProxyIpSchema);
        await model.init();
        service = new IpManagementService(model as any);
    });

    afterEach(async () => {
        await model.deleteMany({});
        jest.restoreAllMocks();
        // re-silence loggers (restoreAllMocks would unmock them)
        jest.spyOn(require('../../../utils').Logger.prototype, 'log').mockImplementation(() => {});
        jest.spyOn(require('../../../utils').Logger.prototype, 'debug').mockImplementation(() => {});
        jest.spyOn(require('../../../utils').Logger.prototype, 'warn').mockImplementation(() => {});
        jest.spyOn(require('../../../utils').Logger.prototype, 'error').mockImplementation(() => {});
    });

    afterAll(async () => {
        if (connection) {
            await connection.dropDatabase();
            await connection.close();
        }
        if (mongod) await mongod.stop();
    });

    // ==================== createProxyIp ====================

    describe('createProxyIp', () => {
        it('creates a proxy IP', async () => {
            const result = await service.createProxyIp(baseProxy());
            expect(result.ipAddress).toBe('10.0.0.1');
            expect(result.port).toBe(8080);
            expect((result as any)._id).toBeUndefined(); // toJSON strips _id
        });

        it('throws BadRequest when ipAddress missing', async () => {
            await expect(service.createProxyIp(baseProxy({ ipAddress: undefined as any })))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws BadRequest when port missing', async () => {
            await expect(service.createProxyIp(baseProxy({ port: undefined as any })))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws BadRequest when port out of range (too high)', async () => {
            await expect(service.createProxyIp(baseProxy({ port: 70000 })))
                .rejects.toThrow('Port must be between 1 and 65535');
        });

        it('throws Conflict on duplicate', async () => {
            await service.createProxyIp(baseProxy());
            await expect(service.createProxyIp(baseProxy()))
                .rejects.toBeInstanceOf(ConflictException);
        });

        it('wraps generic DB errors into BadRequest', async () => {
            jest.spyOn(model, 'findOne').mockReturnValue({
                then: undefined,
            } as any);
            // Force the save to fail by making findOne resolve null then save throw
            jest.spyOn(model, 'findOne').mockResolvedValue(null as any);
            jest.spyOn(model.prototype as any, 'save').mockRejectedValueOnce(new Error('db down'));
            await expect(service.createProxyIp(baseProxy({ ipAddress: '10.0.0.99' })))
                .rejects.toThrow('Failed to create proxy IP: db down');
        });
    });

    // ==================== bulkCreateProxyIps ====================

    describe('bulkCreateProxyIps', () => {
        it('throws BadRequest on empty array', async () => {
            await expect(service.bulkCreateProxyIps([]))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws BadRequest on null', async () => {
            await expect(service.bulkCreateProxyIps(null as any))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('counts created, invalid (missing addr/port), and conflict errors', async () => {
            const items = [
                baseProxy({ ipAddress: '1.1.1.1', port: 1000 }),
                baseProxy({ ipAddress: '1.1.1.2', port: 1001 }),
                baseProxy({ ipAddress: undefined as any, port: 1002 }), // invalid -> failed
                baseProxy({ ipAddress: '1.1.1.1', port: 1000 }), // duplicate -> conflict error
            ];
            const res = await service.bulkCreateProxyIps(items);
            expect(res.created).toBe(2);
            expect(res.failed).toBe(2);
            expect(res.errors.length).toBe(2);
            expect(res.errors.some(e => e.includes('Invalid IP data'))).toBe(true);
        });

        it('processes more than one batch (>10 items)', async () => {
            const items = Array.from({ length: 12 }, (_, i) =>
                baseProxy({ ipAddress: `2.2.2.${i}`, port: 2000 + i }));
            const res = await service.bulkCreateProxyIps(items);
            expect(res.created).toBe(12);
            expect(res.failed).toBe(0);
        });
    });

    // ==================== findAllProxyIps / getAvailableProxyIps ====================

    it('findAllProxyIps returns all', async () => {
        await service.createProxyIp(baseProxy({ ipAddress: '3.3.3.1', port: 100 }));
        await service.createProxyIp(baseProxy({ ipAddress: '3.3.3.2', port: 101 }));
        const all = await service.findAllProxyIps();
        expect(all.length).toBe(2);
    });

    it('getAvailableProxyIps returns only active+unassigned', async () => {
        await service.createProxyIp(baseProxy({ ipAddress: '4.4.4.1', port: 100, isAssigned: false }));
        await service.createProxyIp(baseProxy({ ipAddress: '4.4.4.2', port: 101, isAssigned: true }));
        await service.createProxyIp(baseProxy({ ipAddress: '4.4.4.3', port: 102, status: 'inactive' }));
        const avail = await service.getAvailableProxyIps();
        expect(avail.length).toBe(1);
        expect(avail[0].ipAddress).toBe('4.4.4.1');
    });

    // ==================== updateProxyIp ====================

    describe('updateProxyIp', () => {
        it('updates an existing IP', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '5.5.5.1', port: 200 }));
            const updated = await service.updateProxyIp('5.5.5.1', 200, { status: 'inactive' });
            expect(updated.status).toBe('inactive');
        });

        it('throws NotFound when missing', async () => {
            await expect(service.updateProxyIp('9.9.9.9', 200, { status: 'inactive' }))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ==================== deleteProxyIp ====================

    describe('deleteProxyIp', () => {
        it('deletes an existing IP', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '6.6.6.1', port: 300 }));
            await expect(service.deleteProxyIp('6.6.6.1', 300)).resolves.toBeUndefined();
            expect(await model.countDocuments()).toBe(0);
        });

        it('throws NotFound when missing', async () => {
            await expect(service.deleteProxyIp('9.9.9.9', 300))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ==================== findProxyIpById ====================

    describe('findProxyIpById', () => {
        it('throws BadRequest when args missing', async () => {
            await expect(service.findProxyIpById('', 0)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('returns found IP', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '7.7.7.1', port: 400 }));
            const found = await service.findProxyIpById('7.7.7.1', 400);
            expect(found.ipAddress).toBe('7.7.7.1');
        });

        it('throws NotFound when missing', async () => {
            await expect(service.findProxyIpById('9.9.9.9', 400))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        it('wraps generic errors into BadRequest', async () => {
            jest.spyOn(model, 'findOne').mockReturnValue({
                lean: () => Promise.reject(new Error('boom')),
            } as any);
            await expect(service.findProxyIpById('7.7.7.1', 400))
                .rejects.toThrow('Failed to find proxy IP: boom');
        });
    });

    // ==================== getClientAssignedIps ====================

    describe('getClientAssignedIps', () => {
        it('throws BadRequest on empty clientId', async () => {
            await expect(service.getClientAssignedIps('   '))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('returns assigned IPs for client', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '8.8.8.1', port: 500, isAssigned: true, assignedToClient: 'c1' }));
            await service.createProxyIp(baseProxy({ ipAddress: '8.8.8.2', port: 501, isAssigned: false }));
            const ips = await service.getClientAssignedIps('c1');
            expect(ips.length).toBe(1);
            expect(ips[0].ipAddress).toBe('8.8.8.1');
        });

        it('wraps errors into BadRequest', async () => {
            jest.spyOn(model, 'find').mockImplementation(() => { throw new Error('find broke'); });
            await expect(service.getClientAssignedIps('c1'))
                .rejects.toThrow('Failed to get assigned IPs: find broke');
        });
    });

    // ==================== isIpAvailable ====================

    describe('isIpAvailable', () => {
        it('throws BadRequest when args missing', async () => {
            await expect(service.isIpAvailable('', 0)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('returns true when available', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '11.0.0.1', port: 600 }));
            expect(await service.isIpAvailable('11.0.0.1', 600)).toBe(true);
        });

        it('returns false when not found', async () => {
            expect(await service.isIpAvailable('11.0.0.9', 600)).toBe(false);
        });

        it('returns false on error', async () => {
            jest.spyOn(model, 'findOne').mockReturnValue({
                lean: () => Promise.reject(new Error('boom')),
            } as any);
            expect(await service.isIpAvailable('11.0.0.1', 600)).toBe(false);
        });
    });

    // ==================== getAvailableIpCount ====================

    describe('getAvailableIpCount', () => {
        it('counts available', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '12.0.0.1', port: 700 }));
            await service.createProxyIp(baseProxy({ ipAddress: '12.0.0.2', port: 701, isAssigned: true }));
            expect(await service.getAvailableIpCount()).toBe(1);
        });

        it('returns 0 on error', async () => {
            jest.spyOn(model, 'countDocuments').mockImplementation(() => { throw new Error('boom'); });
            expect(await service.getAvailableIpCount()).toBe(0);
        });
    });

    // ==================== getNextIp + _pickAndMark ====================

    describe('getNextIp', () => {
        it('filters by countryCode and protocol and serves from pool', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '13.0.0.1', port: 800, countryCode: 'US', protocol: 'http' }));
            await service.createProxyIp(baseProxy({ ipAddress: '13.0.0.2', port: 801, countryCode: 'IN', protocol: 'http' }));
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(1);
            const ip = await service.getNextIp({ countryCode: 'US', protocol: 'http' });
            expect(ip.ipAddress).toBe('13.0.0.1');
        });

        it('serves client-specific IPs when clientId has matches', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '14.0.0.1', port: 900, isAssigned: true, assignedToClient: 'cli' }));
            await service.createProxyIp(baseProxy({ ipAddress: '14.0.0.2', port: 901 }));
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(1);
            const ip = await service.getNextIp({ clientId: 'cli' });
            expect(ip.ipAddress).toBe('14.0.0.1');
        });

        it('falls back to full pool when client has no IPs', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '15.0.0.1', port: 1000 }));
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(1);
            const ip = await service.getNextIp({ clientId: 'no-such-client' });
            expect(ip.ipAddress).toBe('15.0.0.1');
        });

        it('throws NotFound when pool empty', async () => {
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(1);
            await expect(service.getNextIp({})).rejects.toBeInstanceOf(NotFoundException);
        });

        it('uses Redis counter to pick index (round-robin)', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '16.0.0.1', port: 1100 }));
            await service.createProxyIp(baseProxy({ ipAddress: '16.0.0.2', port: 1101 }));
            // sorted by _id ascending; first created is index 0
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(2); // (2-1)%2 = 1 -> second
            const ip = await service.getNextIp({});
            expect(ip.ipAddress).toBe('16.0.0.2');
        });

        it('falls back to timestamp when Redis throws', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '17.0.0.1', port: 1200 }));
            jest.spyOn(RedisClient, 'incr').mockRejectedValue(new Error('redis down'));
            const ip = await service.getNextIp({});
            expect(ip.ipAddress).toBe('17.0.0.1');
        });

        it('lastUsed update failure is swallowed (fire-and-forget .catch)', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '18.0.0.1', port: 1300 }));
            jest.spyOn(RedisClient, 'incr').mockResolvedValue(1);
            jest.spyOn(model, 'updateOne').mockReturnValue({
                exec: () => Promise.reject(new Error('update fail')),
            } as any);
            const ip = await service.getNextIp({});
            expect(ip.ipAddress).toBe('18.0.0.1');
            // allow the fire-and-forget promise to settle
            await new Promise(r => setImmediate(r));
        });
    });

    // ==================== syncFromExternal ====================

    describe('syncFromExternal', () => {
        it('upserts new proxies (created count)', async () => {
            const res = await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '20.0.0.1', port: 1, source: undefined as any }),
                baseProxy({ ipAddress: '20.0.0.2', port: 2 }),
            ], false);
            expect(res.created).toBe(2);
            expect(res.updated).toBe(0);
            expect(res.removed).toBe(0);
        });

        it('updates existing proxies (modified count)', async () => {
            await service.syncFromExternal('webshare', [baseProxy({ ipAddress: '21.0.0.1', port: 1 })], false);
            const res = await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '21.0.0.1', port: 1, cityName: 'NYC' }),
            ], false);
            expect(res.updated).toBe(1);
        });

        it('removes stale proxies when removeStale=true', async () => {
            await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '22.0.0.1', port: 1 }),
                baseProxy({ ipAddress: '22.0.0.2', port: 2 }),
            ], false);
            // second sync only contains one -> the other becomes stale
            const res = await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '22.0.0.1', port: 1 }),
            ], true);
            expect(res.removed).toBe(1);
            const remaining = await service.findBySource('webshare');
            expect(remaining.length).toBe(1);
            expect(remaining[0].ipAddress).toBe('22.0.0.1');
        });

        it('skips stale removal when removeStale=false', async () => {
            await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '23.0.0.1', port: 1 }),
                baseProxy({ ipAddress: '23.0.0.2', port: 2 }),
            ], false);
            const res = await service.syncFromExternal('webshare', [
                baseProxy({ ipAddress: '23.0.0.1', port: 1 }),
            ], false);
            expect(res.removed).toBe(0);
            expect((await service.findBySource('webshare')).length).toBe(2);
        });

        it('handles bulkWrite error WITH error.result (partial)', async () => {
            const err: any = new Error('partial fail');
            err.result = { upsertedCount: 3, modifiedCount: 1 };
            jest.spyOn(model, 'bulkWrite').mockRejectedValue(err);
            const res = await service.syncFromExternal('webshare', [baseProxy({ ipAddress: '24.0.0.1', port: 1 })], false);
            expect(res.created).toBe(3);
            expect(res.updated).toBe(1);
            expect(res.errors.length).toBe(1);
        });

        it('handles bulkWrite error WITHOUT error.result', async () => {
            jest.spyOn(model, 'bulkWrite').mockRejectedValue(new Error('total fail'));
            const res = await service.syncFromExternal('webshare', [baseProxy({ ipAddress: '25.0.0.1', port: 1 })], false);
            expect(res.created).toBe(0);
            expect(res.updated).toBe(0);
            expect(res.errors[0]).toContain('total fail');
        });

        it('handles empty proxies list (no bulkOps)', async () => {
            const res = await service.syncFromExternal('webshare', [], false);
            expect(res.created).toBe(0);
            expect(res.updated).toBe(0);
        });
    });

    // ==================== removeBySource ====================

    it('removeBySource deletes by source', async () => {
        await service.syncFromExternal('webshare', [
            baseProxy({ ipAddress: '26.0.0.1', port: 1 }),
            baseProxy({ ipAddress: '26.0.0.2', port: 2 }),
        ], false);
        const removed = await service.removeBySource('webshare');
        expect(removed).toBe(2);
    });

    // ==================== markLastUsed ====================

    it('markLastUsed sets lastUsed', async () => {
        await service.createProxyIp(baseProxy({ ipAddress: '27.0.0.1', port: 1 }));
        await service.markLastUsed('27.0.0.1', 1);
        const doc = await model.findOne({ ipAddress: '27.0.0.1', port: 1 }).lean();
        expect(doc?.lastUsed).toBeInstanceOf(Date);
    });

    // ==================== updateHealthStatus ====================

    describe('updateHealthStatus', () => {
        it('healthy branch resets consecutiveFails', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '28.0.0.1', port: 1 }));
            await model.updateOne({ ipAddress: '28.0.0.1', port: 1 }, { $set: { consecutiveFails: 5 } });
            await service.updateHealthStatus('28.0.0.1', 1, true);
            const doc = await model.findOne({ ipAddress: '28.0.0.1', port: 1 }).lean();
            expect(doc?.consecutiveFails).toBe(0);
            expect(doc?.lastVerified).toBeInstanceOf(Date);
        });

        it('unhealthy branch increments consecutiveFails', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '29.0.0.1', port: 1 }));
            await service.updateHealthStatus('29.0.0.1', 1, false);
            const doc = await model.findOne({ ipAddress: '29.0.0.1', port: 1 }).lean();
            expect(doc?.consecutiveFails).toBe(1);
        });
    });

    // ==================== markInactive ====================

    it('markInactive sets status inactive', async () => {
        await service.createProxyIp(baseProxy({ ipAddress: '30.0.0.1', port: 1 }));
        await service.markInactive('30.0.0.1', 1);
        const doc = await model.findOne({ ipAddress: '30.0.0.1', port: 1 }).lean();
        expect(doc?.status).toBe('inactive');
    });

    // ==================== findBySource / countBySource ====================

    it('findBySource and countBySource', async () => {
        await service.syncFromExternal('webshare', [
            baseProxy({ ipAddress: '31.0.0.1', port: 1 }),
        ], false);
        expect((await service.findBySource('webshare')).length).toBe(1);
        expect(await service.countBySource('webshare')).toBe(1);
    });

    // ==================== getStats ====================

    describe('getStats', () => {
        it('aggregates stats and maps null source to manual', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '32.0.0.1', port: 1 })); // manual, available
            await service.createProxyIp(baseProxy({ ipAddress: '32.0.0.2', port: 2, isAssigned: true })); // assigned
            await service.createProxyIp(baseProxy({ ipAddress: '32.0.0.3', port: 3, status: 'inactive' })); // inactive
            // insert a doc with null source directly to hit 'manual' fallback
            await model.collection.insertOne({ ipAddress: '32.0.0.4', port: 4, protocol: 'http', status: 'active', isAssigned: false, source: null });

            const stats = await service.getStats();
            expect(stats.total).toBe(4);
            expect(stats.assigned).toBe(1);
            expect(stats.inactive).toBe(1);
            expect(stats.bySource.manual).toBeGreaterThanOrEqual(1);
        });

        it('throws BadRequest on error', async () => {
            jest.spyOn(model, 'countDocuments').mockImplementation(() => { throw new Error('agg fail'); });
            await expect(service.getStats()).rejects.toThrow('Failed to get statistics: agg fail');
        });
    });

    // ==================== healthCheck ====================

    describe('healthCheck', () => {
        it('healthy with adequate pool', async () => {
            for (let i = 0; i < 10; i++) {
                await service.createProxyIp(baseProxy({ ipAddress: `33.0.0.${i}`, port: 1 + i }));
            }
            const hc = await service.healthCheck();
            expect(hc.status).toBe('healthy');
            expect(hc.issues.length).toBe(0);
        });

        it('critical when available=0', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '34.0.0.1', port: 1, isAssigned: true }));
            const hc = await service.healthCheck();
            expect(hc.status).toBe('critical');
            expect(hc.issues).toContain('No available IPs in pool');
        });

        it('warning when available < 5', async () => {
            await service.createProxyIp(baseProxy({ ipAddress: '35.0.0.1', port: 1 }));
            await service.createProxyIp(baseProxy({ ipAddress: '35.0.0.2', port: 2 }));
            const hc = await service.healthCheck();
            expect(hc.status).toBe('warning');
            expect(hc.issues.some(i => i.includes('Low IP availability'))).toBe(true);
        });

        it('warning when utilization > 90 (but <= 95)', async () => {
            // 20 total, 19 assigned -> 95% exactly is NOT >95, so warning.
            // build 19 assigned + 1 available => 95% utilization (warning), available=1 (<5 also warning)
            for (let i = 0; i < 19; i++) {
                await service.createProxyIp(baseProxy({ ipAddress: `36.0.${i}.1`, port: 1, isAssigned: true }));
            }
            await service.createProxyIp(baseProxy({ ipAddress: '36.0.99.1', port: 1 }));
            const hc = await service.healthCheck();
            expect(hc.utilizationRate).toBeCloseTo(95, 1);
            expect(hc.status).toBe('warning');
            expect(hc.issues.some(i => i.includes('High utilization rate'))).toBe(true);
        });

        it('critical when utilization > 95', async () => {
            // 100 total, 96 assigned, 4 available -> 96% > 95 critical
            for (let i = 0; i < 96; i++) {
                await model.collection.insertOne({ ipAddress: `37.0.${Math.floor(i / 10)}.${i % 10}`, port: i, protocol: 'http', status: 'active', isAssigned: true, source: 'manual' });
            }
            for (let i = 0; i < 4; i++) {
                await model.collection.insertOne({ ipAddress: `37.1.0.${i}`, port: 1000 + i, protocol: 'http', status: 'active', isAssigned: false, source: 'manual' });
            }
            const hc = await service.healthCheck();
            expect(hc.utilizationRate).toBeGreaterThan(95);
            expect(hc.status).toBe('critical');
        });

        it('warning when inactive > 20%', async () => {
            // 10 total: 5 available active, 5 inactive -> inactive 50% > 20%
            for (let i = 0; i < 5; i++) {
                await service.createProxyIp(baseProxy({ ipAddress: `38.0.0.${i}`, port: i + 1 }));
            }
            for (let i = 0; i < 5; i++) {
                await service.createProxyIp(baseProxy({ ipAddress: `38.1.0.${i}`, port: 100 + i, status: 'inactive' }));
            }
            const hc = await service.healthCheck();
            expect(hc.issues).toContain('High number of inactive IPs');
            expect(hc.status).toBe('warning');
        });

        it('returns critical fallback when getStats throws', async () => {
            jest.spyOn(service, 'getStats').mockRejectedValue(new Error('stats boom'));
            const hc = await service.healthCheck();
            expect(hc.status).toBe('critical');
            expect(hc.issues).toContain('Health check failed');
            expect(hc.availableIps).toBe(0);
        });
    });
});
