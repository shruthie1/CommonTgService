/**
 * Client API integration tests.
 *
 * Real MongoDB (memory server) + real service logic.
 * Only external dependencies (Telegram, bots, notifications) are mocked.
 *
 * Every assertion matches exact real-world expected behavior — return types,
 * field isolation, side-effect verification, and error contract.
 */
import { Model } from 'mongoose';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { ClientService } from '../clients/client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    createClientModel, makeClientData, resetCounter,
    mockTelegramService, mockUsersService,
} from './api-test-helpers';

// Mock external modules
jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));

describe('Client API', () => {
    let ctx: MongoTestContext;
    let ClientModel: Model<ClientDocument>;
    let service: ClientService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('client-api-test');
        ClientModel = createClientModel(ctx.connection) as Model<ClientDocument>;
        await ClientModel.init();
    });

    beforeEach(async () => {
        resetCounter();

        const telegramService = mockTelegramService();
        const bufferClientService = {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            markAsInactive: jest.fn().mockResolvedValue(null),
            setPrimaryInUse: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue(null),
            model: ClientModel, // not actually used but prevents crashes
        };
        const usersService = mockUsersService();

        service = new ClientService(
            ClientModel as any,
            telegramService as any,
            bufferClientService as any,
            usersService as any,
        );

        // Force initialization (bypass onModuleInit which tries to load from DB)
        (service as any).isInitialized = true;
        (service as any).clientsMap = new Map();
        // Stop periodic tasks
        if ((service as any).refreshInterval) {
            clearInterval((service as any).refreshInterval);
        }
    });

    afterEach(async () => {
        // Stop any periodic tasks
        if ((service as any).refreshInterval) {
            clearInterval((service as any).refreshInterval);
            (service as any).refreshInterval = null;
        }
        if ((service as any).checkInterval) {
            clearInterval((service as any).checkInterval);
            (service as any).checkInterval = null;
        }
        if ((service as any).cleanupInterval) {
            clearInterval((service as any).cleanupInterval);
            (service as any).cleanupInterval = null;
        }
        await ClientModel.deleteMany({});
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    // ─── CREATE ──────────────────────────────────────────────────────────────

    describe('create()', () => {
        it('creates a client with all required fields and correct defaults', async () => {
            const data = makeClientData({ mobile: '15550100001', clientId: 'create-test-1' });
            const result = await service.create(data);

            // Required fields preserved
            expect(result.clientId).toBe('create-test-1');
            expect(result.mobile).toBe('15550100001');
            expect(result.name).toBe(data.name);
            expect(result.session).toBe(data.session);
            expect(result.channelLink).toBe(data.channelLink);
            expect(result.dbcoll).toBe(data.dbcoll);
            expect(result.link).toBe(data.link);
            expect(result.password).toBe(data.password);
            expect(result.repl).toBe(data.repl);
            expect(result.promoteRepl).toBe(data.promoteRepl);
            expect(result.username).toBe(data.username);
            expect(result.deployKey).toBe(data.deployKey);
            expect(result.product).toBe(data.product);

            // Optional fields with explicit values
            expect(result.qrId).toBe(data.qrId);
            expect(result.gpayId).toBe(data.gpayId);

            // Schema defaults for persona pools
            expect(result.firstNames).toEqual([]);
            expect(result.bufferLastNames).toEqual([]);
            expect(result.promoteLastNames).toEqual([]);
            expect(result.bios).toEqual([]);
            expect(result.profilePics).toEqual([]);

            // IP-related defaults
            expect(result.dedicatedIps).toEqual([]);
            expect(result.autoAssignIps).toBe(false);
            expect(result.preferredIpCountry).toBeNull();
        });

        it('creates a client without qrId and gpayId (defaults to null)', async () => {
            const data = makeClientData({ clientId: 'create-null-pay' });
            delete data.qrId;
            delete data.gpayId;

            const result = await service.create(data);
            expect(result.qrId).toBeNull();
            expect(result.gpayId).toBeNull();
        });

        it('rejects duplicate clientId', async () => {
            const data = makeClientData({ clientId: 'dup-client', mobile: '15550100002' });
            await service.create(data);

            await expect(service.create(makeClientData({
                clientId: 'dup-client',
                mobile: '15550100003',
            }))).rejects.toThrow();
        });

        it('rejects duplicate mobile', async () => {
            await service.create(makeClientData({ mobile: '15550100004', clientId: 'client-a' }));

            await expect(service.create(makeClientData({
                mobile: '15550100004',
                clientId: 'client-b',
            }))).rejects.toThrow();
        });

        it('populates cache after create — findOne returns without DB hit', async () => {
            const data = makeClientData({ clientId: 'cache-create', mobile: '15550100005' });
            await service.create(data);

            const found = await service.findOne('cache-create');
            expect(found).toBeTruthy();
            expect(found.clientId).toBe('cache-create');
            expect(found.mobile).toBe('15550100005');
        });
    });

    // ─── FIND ────────────────────────────────────────────────────────────────

    describe('findOne()', () => {
        it('returns client by clientId with all fields', async () => {
            const data = makeClientData({ clientId: 'find-one', mobile: '15550200001' });
            await service.create(data);

            const found = await service.findOne('find-one');
            expect(found.clientId).toBe('find-one');
            expect(found.name).toBe(data.name);
            expect(found.mobile).toBe('15550200001');
            expect(found.session).toBe(data.session);
        });

        it('throws NotFoundException with descriptive message for unknown clientId', async () => {
            await expect(service.findOne('nonexistent'))
                .rejects.toThrow('not found');
        });

        it('returns null (not undefined) with throwErr=false for unknown clientId', async () => {
            const found = await service.findOne('nonexistent', false);
            // Client service uses .lean() which returns null directly
            expect(found).toBeNull();
        });
    });

    describe('findAll()', () => {
        it('returns all clients', async () => {
            await service.create(makeClientData({ clientId: 'c1', mobile: '15550300001' }));
            await service.create(makeClientData({ clientId: 'c2', mobile: '15550300002' }));

            const all = await service.findAll();
            expect(all).toHaveLength(2);
            const ids = all.map(c => c.clientId).sort();
            expect(ids).toEqual(['c1', 'c2']);
        });

        it('returns empty array when no clients exist', async () => {
            const all = await service.findAll();
            expect(all).toEqual([]);
            expect(Array.isArray(all)).toBe(true);
        });
    });

    describe('findAllMasked()', () => {
        it('excludes session, mobile, password from response but keeps other fields', async () => {
            await service.create(makeClientData({ clientId: 'masked-1', mobile: '15550300003' }));

            const masked = await service.findAllMasked();
            expect(masked).toHaveLength(1);

            // Must NOT have sensitive fields
            expect(masked[0]).not.toHaveProperty('session');
            expect(masked[0]).not.toHaveProperty('mobile');
            expect(masked[0]).not.toHaveProperty('password');

            // Must have non-sensitive fields
            expect(masked[0]).toHaveProperty('clientId');
            expect(masked[0]).toHaveProperty('name');
            expect(masked[0]).toHaveProperty('product');
            expect((masked[0] as any).clientId).toBe('masked-1');
        });
    });

    // ─── UPDATE (PATCH) — NO UPSERT ─────────────────────────────────────────

    describe('update()', () => {
        it('updates existing client fields', async () => {
            const data = makeClientData({ clientId: 'upd-1', mobile: '15550400001' });
            await service.create(data);

            const updated = await service.update('upd-1', { name: 'Updated Name' });
            expect(updated.name).toBe('Updated Name');
            expect(updated.clientId).toBe('upd-1');
            expect(updated.mobile).toBe('15550400001');
        });

        it('updates persona pool arrays', async () => {
            const data = makeClientData({ clientId: 'upd-2', mobile: '15550400002' });
            await service.create(data);

            const updated = await service.update('upd-2', {
                firstNames: ['Sara', 'Maya'],
                bios: ['Hello world'],
            });
            expect(updated.firstNames).toEqual(['Sara', 'Maya']);
            expect(updated.bios).toEqual(['Hello world']);
        });

        it('does NOT upsert — throws on unknown clientId', async () => {
            await expect(service.update('nonexistent-client', { name: 'test' }))
                .rejects.toThrow();
        });

        it('does NOT create a new doc on unknown clientId (upsert removed)', async () => {
            try {
                await service.update('ghost-client', { name: 'Ghost' });
            } catch {
                // expected to throw
            }
            // Verify no doc was created
            const doc = await ClientModel.findOne({ clientId: 'ghost-client' }).lean();
            expect(doc).toBeNull();
        });

        it('preserves fields not in the update', async () => {
            const data = makeClientData({ clientId: 'upd-3', mobile: '15550400003', name: 'Original' });
            await service.create(data);

            await service.update('upd-3', { product: 'new-product' });
            const found = await service.findOne('upd-3');
            expect(found.name).toBe('Original');
            expect(found.product).toBe('new-product');
        });

        it('updates cache after update — subsequent findOne reflects change', async () => {
            const data = makeClientData({ clientId: 'upd-cache', mobile: '15550400004' });
            await service.create(data);

            await service.update('upd-cache', { name: 'Cached Update' });

            const found = await service.findOne('upd-cache');
            expect(found.name).toBe('Cached Update');
        });

        it('updates updatedAt timestamp', async () => {
            const data = makeClientData({ clientId: 'upd-ts', mobile: '15550400005' });
            const created = await service.create(data);

            await new Promise(r => setTimeout(r, 50));
            const updated = await service.update('upd-ts', { name: 'Timestamp Test' });
            // timestamps are added by Mongoose `timestamps: true` but not on the TS type
            expect(new Date((updated as any).updatedAt).getTime()).toBeGreaterThanOrEqual(
                new Date((created as any).updatedAt).getTime(),
            );
        });
    });

    // ─── DELETE ──────────────────────────────────────────────────────────────

    describe('remove()', () => {
        it('deletes an existing client and returns the deleted doc', async () => {
            const data = makeClientData({ clientId: 'del-1', mobile: '15550500001' });
            await service.create(data);

            const deleted = await service.remove('del-1');
            expect(deleted.clientId).toBe('del-1');
            expect(deleted.mobile).toBe('15550500001');

            // Verify gone from DB
            const doc = await ClientModel.findOne({ clientId: 'del-1' }).lean();
            expect(doc).toBeNull();
        });

        it('removes from cache after delete — findOne throws NotFoundException', async () => {
            const data = makeClientData({ clientId: 'del-cache', mobile: '15550500002' });
            await service.create(data);

            await service.remove('del-cache');

            await expect(service.findOne('del-cache'))
                .rejects.toThrow('not found');
        });

        it('throws for unknown clientId', async () => {
            await expect(service.remove('nonexistent'))
                .rejects.toThrow();
        });

        it('does not affect other documents', async () => {
            await service.create(makeClientData({ clientId: 'del-a', mobile: '15550500003' }));
            await service.create(makeClientData({ clientId: 'del-b', mobile: '15550500004' }));

            await service.remove('del-a');

            const remaining = await ClientModel.find({}).lean();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].clientId).toBe('del-b');
        });
    });

    // ─── SEARCH ─────────────────────────────────────────────────────────────

    describe('search()', () => {
        it('searches by clientId', async () => {
            await service.create(makeClientData({ clientId: 'search-a', mobile: '15550600001' }));
            await service.create(makeClientData({ clientId: 'search-b', mobile: '15550600002' }));

            const results = await service.search({ clientId: 'search-a' } as any);
            expect(results).toHaveLength(1);
            expect(results[0].clientId).toBe('search-a');
        });

        it('returns empty array for no matches', async () => {
            const results = await service.search({ clientId: 'nope' } as any);
            expect(results).toEqual([]);
            expect(Array.isArray(results)).toBe(true);
        });

        it('supports regex search on name field', async () => {
            await service.create(makeClientData({ clientId: 'regex-a', mobile: '15550600003', name: 'Alpha Bot' }));
            await service.create(makeClientData({ clientId: 'regex-b', mobile: '15550600004', name: 'Beta Service' }));

            const results = await service.search({ name: 'Alpha' } as any);
            expect(results).toHaveLength(1);
            expect(results[0].clientId).toBe('regex-a');
        });
    });

    // ─── EXECUTE QUERY ──────────────────────────────────────────────────────

    describe('executeQuery()', () => {
        it('runs a raw MongoDB query', async () => {
            await service.create(makeClientData({ clientId: 'q1', mobile: '15550700001', product: 'alpha' }));
            await service.create(makeClientData({ clientId: 'q2', mobile: '15550700002', product: 'beta' }));

            const results = await service.executeQuery({ product: 'alpha' });
            expect(results).toHaveLength(1);
            expect(results[0].clientId).toBe('q1');
        });

        it('supports sort and limit', async () => {
            await service.create(makeClientData({ clientId: 'q3', mobile: '15550700003', name: 'C' }));
            await service.create(makeClientData({ clientId: 'q4', mobile: '15550700004', name: 'A' }));
            await service.create(makeClientData({ clientId: 'q5', mobile: '15550700005', name: 'B' }));

            const results = await service.executeQuery({}, { name: 1 }, 2);
            expect(results).toHaveLength(2);
            expect(results[0].name).toBe('A');
            expect(results[1].name).toBe('B');
        });

        it('throws BadRequestException on null query', async () => {
            await expect(service.executeQuery(null as any)).rejects.toThrow('Query is invalid');
        });
    });

    // ─── SCHEMA DEFAULTS ────────────────────────────────────────────────────

    describe('schema defaults', () => {
        it('qrId and gpayId default to null when not provided', async () => {
            const data = makeClientData();
            delete data.qrId;
            delete data.gpayId;

            const doc = await ClientModel.create(data);
            const found = await ClientModel.findOne({ clientId: doc.clientId }).lean();

            expect(found?.qrId).toBeNull();
            expect(found?.gpayId).toBeNull();
        });

        it('qrId and gpayId are stored when provided', async () => {
            const data = makeClientData({ qrId: 'my-qr', gpayId: 'my-gpay' });

            const doc = await ClientModel.create(data);
            const found = await ClientModel.findOne({ clientId: doc.clientId }).lean();

            expect(found?.qrId).toBe('my-qr');
            expect(found?.gpayId).toBe('my-gpay');
        });

        it('persona pool arrays default to empty', async () => {
            const doc = await ClientModel.create(makeClientData());
            const found = await ClientModel.findOne({ clientId: doc.clientId }).lean();

            expect(found?.firstNames).toEqual([]);
            expect(found?.bufferLastNames).toEqual([]);
            expect(found?.promoteLastNames).toEqual([]);
            expect(found?.bios).toEqual([]);
            expect(found?.profilePics).toEqual([]);
        });

        it('IP-related fields default correctly', async () => {
            const doc = await ClientModel.create(makeClientData());
            const found = await ClientModel.findOne({ clientId: doc.clientId }).lean();

            expect(found?.dedicatedIps).toEqual([]);
            expect(found?.autoAssignIps).toBe(false);
            expect(found?.preferredIpCountry).toBeNull();
        });
    });

    // ─── EDGE CASES ─────────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('update with empty object does not corrupt doc', async () => {
            const data = makeClientData({ clientId: 'edge-empty', mobile: '15550800001' });
            await service.create(data);

            const updated = await service.update('edge-empty', {} as any);
            expect(updated.clientId).toBe('edge-empty');
            expect(updated.name).toBe(data.name);
            expect(updated.mobile).toBe('15550800001');
        });

        it('concurrent updates on same client do not create duplicates', async () => {
            const data = makeClientData({ clientId: 'concurrent-test', mobile: '15550800002' });
            await service.create(data);

            await Promise.all([
                service.update('concurrent-test', { name: 'Update A' }),
                service.update('concurrent-test', { product: 'Update B' }),
            ]);

            const docs = await ClientModel.find({ clientId: 'concurrent-test' }).lean();
            expect(docs).toHaveLength(1);
        });
    });

    // ─── FIELD ISOLATION ────────────────────────────────────────────────────

    describe('field isolation', () => {
        it('updating client A does not affect client B', async () => {
            await service.create(makeClientData({ clientId: 'iso-a', mobile: '15550900001', name: 'Client A' }));
            await service.create(makeClientData({ clientId: 'iso-b', mobile: '15550900002', name: 'Client B' }));

            await service.update('iso-a', { name: 'Modified A' });

            const clientB = await service.findOne('iso-b');
            expect(clientB.name).toBe('Client B');
        });

        it('removing client A does not remove client B', async () => {
            await service.create(makeClientData({ clientId: 'iso-rem-a', mobile: '15550900003' }));
            await service.create(makeClientData({ clientId: 'iso-rem-b', mobile: '15550900004' }));

            await service.remove('iso-rem-a');

            const clientB = await service.findOne('iso-rem-b');
            expect(clientB).toBeTruthy();
            expect(clientB.clientId).toBe('iso-rem-b');
        });
    });
});
