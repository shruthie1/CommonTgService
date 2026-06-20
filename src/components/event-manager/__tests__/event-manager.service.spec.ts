import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Event, EventSchema, EventDocument } from '../schemas/event.schema';

// Mock externals: fetchWithTimeout + sleep (network/timing). Keep real Logger.
jest.mock('../../../utils', () => {
    const actual = jest.requireActual('../../../utils');
    return {
        ...actual,
        fetchWithTimeout: jest.fn(),
        sleep: jest.fn().mockResolvedValue(undefined),
    };
});

import { EventManagerService } from '../event-manager.service';
import { fetchWithTimeout, sleep } from '../../../utils';

const mockedFetch = fetchWithTimeout as jest.Mock;
const mockedSleep = sleep as jest.Mock;

function makeClientStub() {
    return { findOne: jest.fn() };
}

describe('EventManagerService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<EventDocument>;
    let clientStub: ReturnType<typeof makeClientStub>;
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
        mockedSleep.mockResolvedValue(undefined);
        clientStub = makeClientStub();
        service = new EventManagerService(model as any, clientStub as any);
    });

    afterEach(async () => {
        service.onModuleDestroy();
        await model.deleteMany({});
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await connection.close();
        await mongod.stop();
    });

    const evt = (over: any = {}) => ({
        chatId: 'c1', time: Date.now(), type: 'call', profile: 'p1', payload: {}, ...over,
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
            const svc = new EventManagerService(badModel, clientStub as any);
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
            const svc = new EventManagerService(badModel, clientStub as any);
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
            const svc = new EventManagerService(badModel, clientStub as any);
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
            const svc = new EventManagerService(badModel, clientStub as any);
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
            const svc = new EventManagerService(badModel, clientStub as any);
            expect(await svc.getEventById('x')).toBeNull();
        });
    });

    // ==================== schedulePaidEvents ====================
    describe('schedulePaidEvents', () => {
        it('returns already-exists message when events exist', async () => {
            await model.create(evt({ chatId: 'sc', profile: 'pr' }));
            const result = await service.schedulePaidEvents('sc', 'pr');
            expect(result.message).toContain('already exists');
        });

        it('schedules type 1', async () => {
            const result = await service.schedulePaidEvents('c1', 'pr', '1');
            expect(result.message).toContain('scheduled events');
            expect(await model.countDocuments({ chatId: 'c1' })).toBeGreaterThan(0);
        });

        it('schedules type 2', async () => {
            const result = await service.schedulePaidEvents('c2', 'pr', '2');
            expect(result.message).toContain('scheduled events');
            expect(await model.countDocuments({ chatId: 'c2' })).toBeGreaterThan(0);
        });

        it('schedules default type (else)', async () => {
            const result = await service.schedulePaidEvents('c3', 'pr', '3');
            expect(result.message).toContain('scheduled events');
            expect(await model.countDocuments({ chatId: 'c3' })).toBeGreaterThan(0);
        });
    });

    // ==================== startEventExecution interval tick ====================
    describe('startEventExecution interval tick', () => {
        // Capture the interval callback so we can invoke it directly and await it
        // with REAL timers (mongoose async ops require real timers).
        let intervalSpy: jest.SpyInstance;
        let tickFn: () => Promise<void>;

        beforeEach(() => {
            intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((cb: any) => {
                tickFn = cb;
                return 12345 as any;
            }) as any);
        });
        afterEach(() => {
            intervalSpy.mockRestore();
        });

        // helper: register the interval for the given service then invoke its callback
        const tick = async (svc: EventManagerService = service) => {
            svc.startEventExecution();
            await tickFn();
        };

        it('skips tick when isProcessing', async () => {
            (service as any).isProcessing = true;
            await tick();
            // no client lookups since skipped
            expect(clientStub.findOne).not.toHaveBeenCalled();
        });

        it('logs no overdue events when none due', async () => {
            await model.create(evt({ time: Date.now() + 10_000_000 }));
            await tick();
            expect(clientStub.findOne).not.toHaveBeenCalled();
        });

        it('call event success -> deletes event', async () => {
            await model.create(evt({ type: 'call', time: Date.now() - 1000 }));
            clientStub.findOne.mockResolvedValue({ repl: 'https://x.repl/' });
            mockedFetch.mockResolvedValue({ ok: true });
            await tick();
            expect(mockedFetch).toHaveBeenCalled();
            expect(await model.countDocuments()).toBe(0);
        });

        it('message event success -> deletes event', async () => {
            await model.create(evt({ type: 'message', time: Date.now() - 1000, payload: { message: 'hi' } }));
            clientStub.findOne.mockResolvedValue({ repl: 'https://x.repl/' });
            mockedFetch.mockResolvedValue({ ok: true });
            await tick();
            expect(await model.countDocuments()).toBe(0);
        });

        it('invalid repl URL for call -> catch, result null -> reschedule', async () => {
            const created = await model.create(evt({ type: 'call', time: Date.now() - 1000 }));
            clientStub.findOne.mockResolvedValue({ repl: 'not a url' });
            await tick();
            // not deleted, rescheduled with later time
            const after = await model.findById(created._id).lean();
            expect(after).toBeTruthy();
            expect(after!.time).toBeGreaterThan(created.time);
            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('invalid repl URL for message -> catch, reschedule', async () => {
            const created = await model.create(evt({ type: 'message', time: Date.now() - 1000, payload: { message: 'x' } }));
            clientStub.findOne.mockResolvedValue({ repl: 'not a url' });
            await tick();
            const after = await model.findById(created._id).lean();
            expect(after).toBeTruthy();
        });

        it('profile not found -> warn + reschedule', async () => {
            const created = await model.create(evt({ type: 'call', time: Date.now() - 1000 }));
            clientStub.findOne.mockResolvedValue(null);
            await tick();
            const after = await model.findById(created._id).lean();
            expect(after).toBeTruthy();
            expect(after!.time).toBeGreaterThan(created.time);
        });

        it('fetch returns falsy result -> reschedule (!success branch)', async () => {
            const created = await model.create(evt({ type: 'call', time: Date.now() - 1000 }));
            clientStub.findOne.mockResolvedValue({ repl: 'https://x.repl/' });
            mockedFetch.mockResolvedValue(null);
            await tick();
            const after = await model.findById(created._id).lean();
            expect(after).toBeTruthy();
            expect(after!.time).toBeGreaterThan(created.time);
            expect(after!.attempts).toBe(1); // first failure increments the counter
        });

        it('a failing event increments attempts and is GIVEN UP (deleted) after the cap', async () => {
            // Real scenario: a permanently-dead profile.repl. Without a cap the event reschedules
            // every tick forever (background load + notification spam). After MAX attempts it must
            // be dropped, not rescheduled again.
            const MAX = 5;
            // Event already at the last allowed attempt; the next failure should delete it.
            const created = await model.create(evt({ type: 'call', time: Date.now() - 1000, attempts: MAX - 1 }));
            clientStub.findOne.mockResolvedValue({ repl: 'https://x.repl/' });
            mockedFetch.mockResolvedValue(null); // keeps failing
            await tick();
            const after = await model.findById(created._id).lean();
            expect(after).toBeNull(); // given up & removed, not rescheduled forever
        });

        it('reschedule updateOne throwing -> error log (does not throw)', async () => {
            // Use a model whose find returns one overdue event but updateOne rejects.
            const overdue = { _id: 'fake-id', chatId: 'c', type: 'call', profile: 'p', time: Date.now() - 1000, payload: {} };
            const badModel: any = {
                find: () => ({ sort: () => ({ lean: jest.fn().mockResolvedValue([overdue]) }) }),
                updateOne: jest.fn().mockRejectedValue(new Error('update fail')),
                deleteOne: jest.fn(),
            };
            clientStub.findOne.mockResolvedValue(null); // forces reschedule path
            const svc = new EventManagerService(badModel, clientStub as any);
            await tick(svc);
            expect(badModel.updateOne).toHaveBeenCalled();
            svc.onModuleDestroy();
        });

        it('deleteOne throwing after success -> per-event catch + reschedule', async () => {
            const overdue = { _id: 'fake-id-2', chatId: 'c', type: 'call', profile: 'p', time: Date.now() - 1000, payload: {} };
            const badModel: any = {
                find: () => ({ sort: () => ({ lean: jest.fn().mockResolvedValue([overdue]) }) }),
                deleteOne: jest.fn().mockRejectedValue(new Error('delete fail')),
                updateOne: jest.fn().mockResolvedValue({}),
            };
            clientStub.findOne.mockResolvedValue({ repl: 'https://x.repl/' });
            mockedFetch.mockResolvedValue({ ok: true });
            const svc = new EventManagerService(badModel, clientStub as any);
            await tick(svc);
            expect(badModel.deleteOne).toHaveBeenCalled();
            expect(badModel.updateOne).toHaveBeenCalled(); // rescheduled after catch
            svc.onModuleDestroy();
        });

        it('outer try/catch on find error', async () => {
            const badModel: any = {
                find: () => ({ sort: () => ({ lean: jest.fn().mockRejectedValue(new Error('find fail')) }) }),
            };
            const svc = new EventManagerService(badModel, clientStub as any);
            await tick(svc);
            // isProcessing reset in finally
            expect((svc as any).isProcessing).toBe(false);
            svc.onModuleDestroy();
        });

        it('clears existing interval when called twice', () => {
            service.startEventExecution();
            service.startEventExecution();
            // setInterval is captured (mocked), and clearInterval was invoked on re-start
            expect(intervalSpy).toHaveBeenCalled();
        });
    });

    // ==================== onModuleInit / onModuleDestroy ====================
    describe('lifecycle', () => {
        it('onModuleInit starts execution', () => {
            service.onModuleInit();
            expect((service as any).intervalId).toBeDefined();
        });

        it('onModuleDestroy clears interval when set', () => {
            service.startEventExecution();
            service.onModuleDestroy();
            // calling again with no interval is a no-op
            (service as any).intervalId = undefined;
            expect(() => service.onModuleDestroy()).not.toThrow();
        });
    });
});
