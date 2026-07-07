import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Event, EventSchema, EventDocument } from '../schemas/event.schema';

import { EventManagerService } from '../event-manager.service';

describe('EventManagerService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<EventDocument>;
    let service: EventManagerService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'event-svc-test' }).asPromise();
        model = connection.model<EventDocument>('EventSvcTest', EventSchema);
        await model.init();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        service = new EventManagerService(model as any);
    });

    afterEach(async () => {
        await model.deleteMany({});
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await connection.close();
        await mongod.stop();
    });

    const evt = (over: any = {}) => ({
        chatId: 'c1', time: Date.now(), type: 'call', clientId: 'p1', payload: {}, ...over,
    });

    // ==================== create ====================
    describe('create', () => {
        it('creates a valid event', async () => {
            const result = await service.create(evt() as any);
            expect(result).toBeTruthy();
            expect(await model.countDocuments()).toBe(1);
        });

        it('warns and returns undefined on bad format', async () => {
            const result = await service.create({ chatId: 'c1' } as any);
            expect(result).toBeUndefined();
            expect(await model.countDocuments()).toBe(0);
        });

        it('catches errors', async () => {
            const badModel: any = { create: jest.fn().mockRejectedValue(new Error('db fail')) };
            const svc = new EventManagerService(badModel);
            const result = await svc.create(evt() as any);
            expect(result).toBeUndefined();
        });
    });

    // ==================== createMultiple ====================
    describe('createMultiple', () => {
        it('inserts valid events (filtered)', async () => {
            const result = await service.createMultiple([
                evt({ chatId: 'a' }), { chatId: 'bad' }, evt({ chatId: 'b' }),
            ] as any);
            expect(result).toHaveLength(2);
            expect(await model.countDocuments()).toBe(2);
        });

        it('warns when none valid', async () => {
            const result = await service.createMultiple([{ chatId: 'bad' }] as any);
            expect(result).toBeUndefined();
        });

        it('catches errors', async () => {
            const badModel: any = { insertMany: jest.fn().mockRejectedValue(new Error('fail')) };
            const svc = new EventManagerService(badModel);
            const result = await svc.createMultiple([evt()] as any);
            expect(result).toBeUndefined();
        });
    });

    // ==================== deleteMultiple ====================
    describe('deleteMultiple', () => {
        it('returns deletedCount', async () => {
            await model.create(evt({ chatId: 'del' }));
            await model.create(evt({ chatId: 'del' }));
            const result = await service.deleteMultiple('del');
            expect(result).toBe(2);
        });

        it('returns 0 on error', async () => {
            const badModel: any = { deleteMany: jest.fn().mockRejectedValue(new Error('fail')) };
            const svc = new EventManagerService(badModel);
            expect(await svc.deleteMultiple('x')).toBe(0);
        });
    });

    // ==================== getEvents ====================
    describe('getEvents', () => {
        it('returns matching events', async () => {
            await model.create(evt({ chatId: 'g1' }));
            const result = await service.getEvents({ chatId: 'g1' });
            expect(result).toHaveLength(1);
        });

        it('returns [] on error', async () => {
            const badModel: any = { find: () => ({ lean: jest.fn().mockRejectedValue(new Error('fail')) }) };
            const svc = new EventManagerService(badModel);
            expect(await svc.getEvents({})).toEqual([]);
        });
    });

    // ==================== getEventById ====================
    describe('getEventById', () => {
        it('returns event', async () => {
            const created = await model.create(evt());
            const result = await service.getEventById(String(created._id));
            expect(result).toBeTruthy();
        });

        it('returns null on error', async () => {
            const badModel: any = { findById: () => ({ lean: jest.fn().mockRejectedValue(new Error('fail')) }) };
            const svc = new EventManagerService(badModel);
            expect(await svc.getEventById('x')).toBeNull();
        });
    });

    // ==================== schedulePaidEvents ====================
    describe('schedulePaidEvents', () => {
        it('returns already-exists message when events exist', async () => {
            await model.create(evt({ chatId: 'sc', clientId: 'pr' }));
            const result = await service.schedulePaidEvents('sc', 'pr');
            expect(result.message).toContain('already exists');
        });

        it('schedules type 1 with clientId (no profile key)', async () => {
            const result = await service.schedulePaidEvents('c1', 'kavya1', '1');
            expect(result.message).toContain('scheduled events');
            const docs = await model.find({ chatId: 'c1' }).lean();
            expect(docs.length).toBeGreaterThan(0);
            for (const doc of docs) {
                expect(doc.clientId).toBe('kavya1');
                expect((doc as any).profile).toBeUndefined();
            }
        });

        it('schedules type 2', async () => {
            const result = await service.schedulePaidEvents('c2', 'kavya1', '2');
            expect(result.message).toContain('scheduled events');
            expect(await model.countDocuments({ chatId: 'c2' })).toBeGreaterThan(0);
        });

        it('schedules default type (else)', async () => {
            const result = await service.schedulePaidEvents('c3', 'kavya1', '3');
            expect(result.message).toContain('scheduled events');
            expect(await model.countDocuments({ chatId: 'c3' })).toBeGreaterThan(0);
        });

        it('dup-check returns already-exists and skips insert', async () => {
            await model.create(evt({ chatId: 'dup', clientId: 'kavya1' }));
            const countBefore = await model.countDocuments({ chatId: 'dup' });
            const result = await service.schedulePaidEvents('dup', 'kavya1', '1');
            expect(result.message).toContain('already exists');
            expect(await model.countDocuments({ chatId: 'dup' })).toBe(countBefore);
        });

        it('deleteMultiple calls deleteMany({ chatId })', async () => {
            await model.create(evt({ chatId: 'dm1' }));
            await model.create(evt({ chatId: 'dm1' }));
            const deleted = await service.deleteMultiple('dm1');
            expect(deleted).toBe(2);
            expect(await model.countDocuments({ chatId: 'dm1' })).toBe(0);
        });
    });
});
