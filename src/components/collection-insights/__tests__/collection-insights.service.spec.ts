/**
 * CollectionInsightsService — real-Mongo integration spec.
 *
 * Per externals-only policy: NO hand-rolled cursor/connection fakes. The
 * service receives a REAL mongoose Connection (mongodb-memory-server) and all
 * reads/aggregations run against REAL collections seeded with REAL documents.
 * Assertions verify the REAL results (returned counts, persisted-doc-derived
 * analytics, real index/storage stats).
 *
 * The only jest spies used target the real Connection's own methods to drive
 * the rare failure branches (collStats rejects, indexes() rejects,
 * estimatedDocumentCount throws) — the underlying DB stays real.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CollectionInsightsService } from '../collection-insights.service';

describe('CollectionInsightsService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let service: CollectionInsightsService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'insights-test' }).asPromise();
    });

    afterAll(async () => {
        if (connection) {
            await connection.dropDatabase();
            await connection.close();
        }
        if (mongod) await mongod.stop();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    beforeEach(async () => {
        jest.restoreAllMocks();
        // Wipe every collection between tests so name lists are deterministic.
        const existing = await connection.db.listCollections().toArray();
        for (const c of existing) {
            await connection.db.collection(c.name).deleteMany({});
            await connection.db.dropCollection(c.name).catch(() => undefined);
        }
        service = new CollectionInsightsService(connection as any);
    });

    async function seed(collectionName: string, docs: any[]) {
        if (docs.length === 0) {
            await connection.db.createCollection(collectionName);
        } else {
            await connection.db.collection(collectionName).insertMany(docs);
        }
    }

    // ==================== listCollections ====================

    test('lists existing non-system collections with estimated counts', async () => {
        await seed('userData', [{ chatId: '1', totalCount: 2 }]);
        const result = await service.listCollections();
        expect(result.collections).toEqual([{ name: 'userData', estimatedCount: 1 }]);
    });

    test('listCollections sorts names and excludes empty/system names', async () => {
        await seed('zeta', [{ a: 1 }]);
        await seed('alpha', [{ a: 1 }]);
        const result = await service.listCollections();
        expect(result.collections.map((c: any) => c.name)).toEqual(['alpha', 'zeta']);
    });

    test('getCollectionNames throws BadRequest when db not ready', async () => {
        const broken = new CollectionInsightsService({ db: undefined } as any);
        await expect(broken.listCollections()).rejects.toBeInstanceOf(BadRequestException);
    });

    // ==================== readCollection validation ====================

    test('rejects dangerous query operators', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', {
            filter: { $where: 'return true' } as any,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects invalid JSON filter string', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { filter: '{not json' }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects non-object JSON filter string', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { filter: '[1,2,3]' }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects non-object filter value', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { filter: 42 as any }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects unsafe field names in filter', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { filter: { 'bad name!': 1 } as any }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects invalid projection values', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { projection: { chatId: 2 } as any }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects unsafe field names in sort object', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('userData', { sort: { '$evil': 1 } as any }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection throws NotFound for missing collection', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('doesNotExist', {}))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    test('readCollection throws BadRequest for invalid collection name', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('bad name!', {}))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    test('readCollection rejects system. collection names', async () => {
        await seed('userData', [{ chatId: '1' }]);
        await expect(service.readCollection('system.profile', {}))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    // ==================== readCollection real reads ====================

    test('reads documents with capped limit and validated sort field', async () => {
        await seed('userData', [
            { chatId: '1', totalCount: 5 },
            { chatId: '2', totalCount: 3 },
            { chatId: '3', totalCount: 9 },
        ]);
        const result = await service.readCollection('userData', {
            filter: JSON.stringify({ totalCount: { $gte: 1 } }),
            sortBy: 'totalCount',
            sortOrder: 'desc',
            limit: '9999',
        });
        expect(result.collection).toBe('userData');
        expect(result.limit).toBe(500); // capped to MAX_LIMIT
        expect(result.sort).toEqual({ totalCount: -1 });
        expect(result.filter).toEqual({ totalCount: { $gte: 1 } });
        expect(result.returned).toBe(3);
        // Real sort applied: highest totalCount first.
        expect(result.documents.map((d: any) => d.totalCount)).toEqual([9, 5, 3]);
    });

    test('readCollection accepts a filter object and projection object', async () => {
        await seed('userData', [
            { chatId: '1', secret: 'x' },
            { chatId: '2', secret: 'y' },
            { chatId: '3', secret: 'z' },
        ]);
        const result = await service.readCollection('userData', {
            filter: { chatId: '1' } as any,
            projection: { chatId: 1, _id: 0 } as any,
            skip: '0',
        });
        expect(result.collection).toBe('userData');
        expect(result.returned).toBe(1);
        // Real projection: only chatId present, no _id, no secret.
        expect(result.documents[0]).toEqual({ chatId: '1' });
    });

    test('readCollection applies skip against real data', async () => {
        await seed('userData', [
            { chatId: '1', totalCount: 1 },
            { chatId: '2', totalCount: 2 },
            { chatId: '3', totalCount: 3 },
        ]);
        const result = await service.readCollection('userData', {
            sortBy: 'totalCount',
            sortOrder: 'asc',
            skip: '2',
        });
        expect(result.skip).toBe(2);
        expect(result.returned).toBe(1);
        expect(result.documents[0].totalCount).toBe(3);
    });

    test('readCollection accepts a sort object (asc/desc and -1)', async () => {
        await seed('userData', [
            { a: 1, b: 1, c: 1 },
            { a: 2, b: 2, c: 2 },
        ]);
        const result = await service.readCollection('userData', {
            sort: { a: 'desc', b: 'asc', c: -1 } as any,
        });
        expect(result.sort).toEqual({ a: -1, b: 1, c: -1 });
        expect(result.documents.map((d: any) => d.a)).toEqual([2, 1]);
    });

    test('readCollection sortBy asc maps to 1', async () => {
        await seed('userData', [{ totalCount: 2 }, { totalCount: 1 }]);
        const result = await service.readCollection('userData', { sortBy: 'totalCount', sortOrder: 'asc' });
        expect(result.sort).toEqual({ totalCount: 1 });
        expect(result.documents.map((d: any) => d.totalCount)).toEqual([1, 2]);
    });

    test('readCollection with no sort returns empty sort and default limit', async () => {
        await seed('userData', [{ chatId: '1' }]);
        const result = await service.readCollection('userData', {});
        expect(result.sort).toEqual({});
        expect(result.limit).toBe(50); // DEFAULT_LIMIT
        expect(result.returned).toBe(1);
    });

    test('readCollection allows safe operators nested inside arrays', async () => {
        await seed('userData', [
            { chatId: '1' }, { chatId: '2' }, { chatId: '3' },
        ]);
        const result = await service.readCollection('userData', {
            filter: { $or: [{ chatId: '1' }, { chatId: '2' }] } as any,
        });
        expect(result.returned).toBe(2);
        expect(result.documents.map((d: any) => d.chatId).sort()).toEqual(['1', '2']);
    });

    // ==================== getCollectionStats ====================

    test('getCollectionStats returns real storage stats and indexes', async () => {
        await seed('userData', [{ chatId: '1' }, { chatId: '2' }, { chatId: '3' }, { chatId: '4' }, { chatId: '5' }]);
        const result = await service.getCollectionStats('userData');
        expect(result.collection).toBe('userData');
        expect(result.estimatedCount).toBe(5);
        // Real default _id_ index exists.
        expect(result.indexes.some((i: any) => i.name === '_id_')).toBe(true);
        // Real collStats: count matches inserted docs and storage fields are numeric.
        expect(result.storage).not.toBeNull();
        expect(result.storage!.count).toBe(5);
        expect(typeof result.storage!.size).toBe('number');
    });

    test('getCollectionStats returns null storage when collStats fails', async () => {
        await seed('userData', [{ chatId: '1' }]);
        jest.spyOn(connection.db, 'command').mockRejectedValueOnce(new Error('no collStats'));
        const result = await service.getCollectionStats('userData');
        expect(result.storage).toBeNull();
    });

    test('getCollectionStats falls back to [] when indexes() rejects', async () => {
        await seed('userData', [{ chatId: '1' }]);
        const realCollection = connection.db.collection.bind(connection.db);
        jest.spyOn(connection.db, 'collection').mockImplementation(((name: string, ...rest: any[]) => {
            const coll = realCollection(name, ...rest);
            jest.spyOn(coll, 'indexes').mockRejectedValue(new Error('no indexes') as any);
            return coll;
        }) as any);
        const result = await service.getCollectionStats('userData');
        expect(result.indexes).toEqual([]);
    });

    test('safeEstimatedCount returns null when count throws', async () => {
        await seed('userData', [{ chatId: '1' }]);
        const realCollection = connection.db.collection.bind(connection.db);
        jest.spyOn(connection.db, 'collection').mockImplementation(((name: string, ...rest: any[]) => {
            const coll = realCollection(name, ...rest);
            jest.spyOn(coll, 'estimatedDocumentCount').mockRejectedValue(new Error('boom') as any);
            return coll;
        }) as any);
        const result = await service.getCollectionStats('userData');
        expect(result.estimatedCount).toBeNull();
    });

    // ==================== getCollectionAnalytics ====================

    test('returns field analytics from a bounded real sample', async () => {
        await seed('userData', [{ chatId: '1', totalCount: 2, paidReply: true }]);
        const result = await service.getCollectionAnalytics('userData', 20);
        expect(result.sampleSize).toBe(1);
        expect(result.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'chatId', present: 1 }),
            expect.objectContaining({
                field: 'totalCount',
                numeric: expect.objectContaining({ count: 1, min: 2, max: 2, avg: 2 }),
            }),
            expect.objectContaining({
                field: 'paidReply',
                boolean: { true: 1, false: 0 },
            }),
        ]));
    });

    test('getCollectionAnalytics analyses many real field types', async () => {
        await seed('userData', [{
            chatId: '1',
            totalCount: 5,
            score: 10,
            flag: false,
            tags: ['a', 'b'],
            created: new Date(),
            empty: null,
            nested: { inner: 'x' },
        }]);
        const result = await service.getCollectionAnalytics('userData', '99999');
        const byField = Object.fromEntries(result.fields.map((f: any) => [f.field, f]));
        expect(byField['score'].numeric).toMatchObject({ count: 1, min: 10, max: 10, avg: 10 });
        expect(byField['flag'].boolean).toEqual({ true: 0, false: 1 });
        expect(byField['tags'].array).toMatchObject({ count: 1, avgLength: 2 });
        expect(byField['nested.inner'].present).toBe(1);
        expect(byField['created'].types.date).toBe(1);
        expect(byField['empty'].types.null).toBe(1);
    });

    test('getCollectionAnalytics caps the sample to MAX (1000) against real data', async () => {
        const docs = Array.from({ length: 1200 }, (_, i) => ({ chatId: String(i), n: i }));
        await seed('userData', docs);
        const result = await service.getCollectionAnalytics('userData', '99999');
        // limit capped to MAX_ANALYTICS_SAMPLE_SIZE — only 1000 docs sampled.
        expect(result.sampleSize).toBe(1000);
        const byField = Object.fromEntries(result.fields.map((f: any) => [f.field, f]));
        expect(byField['n'].numeric.count).toBe(1000);
    });

    test('getCollectionAnalytics uses default sample size when input invalid', async () => {
        const docs = Array.from({ length: 600 }, (_, i) => ({ chatId: String(i) }));
        await seed('userData', docs);
        const result = await service.getCollectionAnalytics('userData', 'not-a-number');
        // DEFAULT_ANALYTICS_SAMPLE_SIZE (500) applied.
        expect(result.sampleSize).toBe(500);
    });

    test('getCollectionAnalytics handles empty sample (coverage 0)', async () => {
        await seed('userData', []);
        const result = await service.getCollectionAnalytics('userData');
        expect(result.sampleSize).toBe(0);
        expect(result.fields).toEqual([]);
    });
});
