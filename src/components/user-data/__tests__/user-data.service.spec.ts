/**
 * UserDataService integration tests.
 *
 * Real MongoDB (mongodb-memory-server) + real service logic.
 * Only true externals are mocked: getBotsServiceInstance.
 */
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserData, UserDataDocument, UserDataSchema } from '../schemas/user-data.schema';
import { UserDataService } from '../user-data.service';

jest.mock('../../../utils', () => ({
    ...jest.requireActual('../../../utils'),
    getBotsServiceInstance: jest.fn(),
}));

import { getBotsServiceInstance } from '../../../utils';

const mockedGetBots = getBotsServiceInstance as jest.MockedFunction<typeof getBotsServiceInstance>;

let seq = 0;
function buildUserData(overrides: Partial<UserData> = {}): any {
    seq++;
    return {
        chatId: `chat-${seq}`,
        totalCount: 5,
        picCount: 1,
        lastMsgTimeStamp: Date.now(),
        limitTime: Date.now(),
        paidCount: 0,
        prfCount: 0,
        canReply: 1,
        payAmount: 0,
        username: `user-${seq}`,
        accessHash: `hash-${seq}`,
        paidReply: false,
        demoGiven: false,
        secondShow: false,
        profile: `profile-${seq}`,
        picSent: false,
        highestPayAmount: 0,
        cheatCount: 0,
        callTime: 0,
        ...overrides,
    };
}

describe('UserDataService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<UserDataDocument>;
    let service: UserDataService;
    let botsStub: { sendMessageByCategory: jest.Mock };

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'user-data-svc-test' }).asPromise();
        model = connection.model<UserDataDocument>('UserDataSvcTest', UserDataSchema);
        await model.init();
    });

    beforeEach(() => {
        seq = 0;
        botsStub = { sendMessageByCategory: jest.fn().mockResolvedValue(true) };
        mockedGetBots.mockReturnValue(null as any);
        service = new UserDataService(model as any);
    });

    afterEach(async () => {
        await model.deleteMany({});
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await connection.close();
        await mongod.stop();
    });

    describe('create', () => {
        it('creates a user-data document', async () => {
            const doc = await service.create(buildUserData({ profile: 'p1', chatId: 'c1' }) as any);
            expect(doc.profile).toBe('p1');
            expect(doc.chatId).toBe('c1');
        });

        it('throws InternalServerError when create fails (validation)', async () => {
            await expect(service.create({ chatId: 'only-this' } as any)).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });

    describe('findAll', () => {
        it('uses default limit', async () => {
            await model.create(buildUserData());
            await model.create(buildUserData());
            const all = await service.findAll();
            expect(all.length).toBe(2);
        });

        it('respects custom limit', async () => {
            await model.create(buildUserData());
            await model.create(buildUserData());
            const all = await service.findAll(1);
            expect(all.length).toBe(1);
        });
    });

    describe('findOne / recordCall', () => {
        it('returns user with incremented count', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1' }));
            const first = await service.findOne('p1', 'c1');
            expect(first.count).toBe(1);
            const second = await service.findOne('p1', 'c1');
            expect(second.count).toBe(2);
        });

        it('throws NotFound when missing', async () => {
            await expect(service.findOne('nope', 'nope')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('evicts the oldest entry once the cap is exceeded', async () => {
            const counts: Map<string, number> = (service as any).callCounts;
            const cap = (UserDataService as any).MAX_CALL_COUNTS as number;
            for (let i = 0; i < cap; i++) {
                counts.set(`old-${i}`, 1);
            }
            expect(counts.size).toBe(cap);
            // calling recordCall on a NEW chatId pushes size over the cap, evicting oldest
            const newCount = (service as any).recordCall('brand-new');
            expect(newCount).toBe(1);
            expect(counts.size).toBe(cap);
            expect(counts.has('old-0')).toBe(false);
            expect(counts.has('brand-new')).toBe(true);
        });
    });

    describe('clearCount', () => {
        it('clears a single chatId', () => {
            (service as any).callCounts.set('c1', 3);
            const msg = service.clearCount('c1');
            expect(msg).toBe('Count cleared for chatId: c1');
            expect((service as any).callCounts.has('c1')).toBe(false);
        });

        it('clears all when no chatId', () => {
            (service as any).callCounts.set('c1', 3);
            const msg = service.clearCount();
            expect(msg).toBe('All counts cleared.');
            expect((service as any).callCounts.size).toBe(0);
        });
    });

    describe('update', () => {
        it('updates (upserts) and strips _id/profile/chatId from dto', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', totalCount: 1 }));
            const res = await service.update('p1', 'c1', { totalCount: 99, _id: 'x', profile: 'evil', chatId: 'evil' } as any);
            expect(res.totalCount).toBe(99);
            expect(res.profile).toBe('p1');
            expect(res.chatId).toBe('c1');
        });
    });

    describe('updateAll', () => {
        it('updates many matching chatId', async () => {
            await model.create(buildUserData({ chatId: 'shared', profile: 'p1' }));
            await model.create(buildUserData({ chatId: 'shared', profile: 'p2' }));
            const res = await service.updateAll('shared', { totalCount: 7, _id: 'x' } as any);
            expect(res.modifiedCount).toBe(2);
            const docs = await model.find({ chatId: 'shared' }).lean();
            expect(docs.every(d => d.totalCount === 7)).toBe(true);
        });

        it('is a no-op when no docs match (no phantom upsert insert)', async () => {
            const res = await service.updateAll('chatId-that-matches-nothing', { totalCount: 5 } as any);
            expect(res.upsertedCount).toBe(0);
            expect(await model.countDocuments({})).toBe(0);
        });
    });

    describe('remove', () => {
        it('skips bot message when botsService is null then deletes', async () => {
            mockedGetBots.mockReturnValue(null as any);
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1' }));
            const deleted = await service.remove('p1', 'c1');
            expect(deleted.profile).toBe('p1');
            expect(await model.findOne({ profile: 'p1', chatId: 'c1' })).toBeNull();
        });

        it('sends a bot message when botsService present', async () => {
            mockedGetBots.mockReturnValue(botsStub as any);
            await model.create(buildUserData({ profile: 'p2', chatId: 'c2' }));
            await service.remove('p2', 'c2');
            expect(botsStub.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('throws NotFound when nothing to delete', async () => {
            mockedGetBots.mockReturnValue(null as any);
            await expect(service.remove('none', 'none')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('search', () => {
        it('transforms firstName into a regex filter', async () => {
            // firstName is not in the strict UserData schema, so insert raw to exercise the regex branch.
            await model.collection.insertOne({ ...buildUserData({ profile: 'p1', chatId: 'c1' }), firstName: 'Bob' });
            const res = await service.search({ firstName: 'bo' });
            expect(res.length).toBe(1);
        });

        it('applies a plain filter without firstName', async () => {
            await model.create(buildUserData({ profile: 'matchme', chatId: 'c1' }));
            await model.create(buildUserData({ profile: 'other', chatId: 'c2' }));
            const res = await service.search({ profile: 'matchme' });
            expect(res.length).toBe(1);
        });
    });

    describe('executeQuery', () => {
        it('throws BadRequest when query is falsy', async () => {
            await expect(service.executeQuery(null as any)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('runs with sort/limit/skip chained', async () => {
            await model.create(buildUserData({ totalCount: 1 }));
            await model.create(buildUserData({ totalCount: 2 }));
            await model.create(buildUserData({ totalCount: 3 }));
            const res = await service.executeQuery({}, { totalCount: -1 }, 2, 1);
            expect(res.length).toBe(2);
            expect(res[0].totalCount).toBe(2);
        });

        it('throws InternalServerError on a bad query', async () => {
            await expect(service.executeQuery({ $badop: 1 } as any)).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });

    describe('resetPaidUsers', () => {
        it('resets eligible paid users', async () => {
            await model.create(buildUserData({ payAmount: 20, totalCount: 40 }));
            await model.create(buildUserData({ payAmount: 5, totalCount: 40 }));
            const res = await service.resetPaidUsers();
            expect(res.modifiedCount).toBe(1);
        });

        it('throws InternalServerError on failure', async () => {
            const spy = jest.spyOn(model, 'updateMany').mockImplementationOnce(() => ({ exec: () => Promise.reject(new Error('boom')) }) as any);
            await expect(service.resetPaidUsers()).rejects.toBeInstanceOf(InternalServerErrorException);
            spy.mockRestore();
        });
    });

    describe('incrementTotalCount', () => {
        it('increments existing', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', totalCount: 5 }));
            const res = await service.incrementTotalCount('p1', 'c1', 3);
            expect(res.totalCount).toBe(8);
        });
        it('uses default amount of 1', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', totalCount: 5 }));
            const res = await service.incrementTotalCount('p1', 'c1');
            expect(res.totalCount).toBe(6);
        });
        it('throws NotFound when missing', async () => {
            await expect(service.incrementTotalCount('x', 'y')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('incrementPayAmount', () => {
        it('increments existing', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', payAmount: 10 }));
            const res = await service.incrementPayAmount('p1', 'c1', 15);
            expect(res.payAmount).toBe(25);
        });
        it('throws NotFound when missing', async () => {
            await expect(service.incrementPayAmount('x', 'y', 5)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('updateLastActive', () => {
        it('returns the updated doc for an existing user', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1' }));
            const res = await service.updateLastActive('p1', 'c1');
            // lastActiveTime is not in the strict schema, but the doc is still returned.
            expect(res.profile).toBe('p1');
        });
    });

    describe('findInactiveSince', () => {
        it('finds docs with lastActiveTime before date', async () => {
            // lastActiveTime not in strict schema -> insert raw so the field persists.
            await model.collection.insertOne({ ...buildUserData({ profile: 'p1', chatId: 'c1' }), lastActiveTime: new Date('2000-01-01') });
            const res = await service.findInactiveSince(new Date('2010-01-01'));
            expect(res.length).toBe(1);
        });
    });

    describe('findByPaymentRange', () => {
        it('filters by payAmount range', async () => {
            await model.create(buildUserData({ payAmount: 5 }));
            await model.create(buildUserData({ payAmount: 50 }));
            const res = await service.findByPaymentRange(10, 100);
            expect(res.length).toBe(1);
        });
    });

    describe('bulkUpdateUsers', () => {
        it('updates many', async () => {
            await model.create(buildUserData({ chatId: 'b1', profile: 'p1' }));
            const res = await service.bulkUpdateUsers({ chatId: 'b1' }, { $set: { totalCount: 42 } });
            expect(res.modifiedCount).toBe(1);
        });
        it('throws InternalServerError on failure', async () => {
            const spy = jest.spyOn(model, 'updateMany').mockImplementationOnce(() => ({ exec: () => Promise.reject(new Error('boom')) }) as any);
            await expect(service.bulkUpdateUsers({}, {} as any)).rejects.toBeInstanceOf(InternalServerErrorException);
            spy.mockRestore();
        });
    });

    describe('findActiveUsers', () => {
        it('uses default threshold', async () => {
            await model.create(buildUserData({ totalCount: 50 }));
            await model.create(buildUserData({ totalCount: 10 }));
            const res = await service.findActiveUsers();
            expect(res.length).toBe(1);
        });
        it('uses custom threshold', async () => {
            await model.create(buildUserData({ totalCount: 50 }));
            await model.create(buildUserData({ totalCount: 10 }));
            const res = await service.findActiveUsers(5);
            expect(res.length).toBe(2);
        });
    });

    describe('removeRedundantData', () => {
        it('deletes stale free users', async () => {
            const old = Date.now() - 70 * 24 * 60 * 60 * 1000;
            await model.create(buildUserData({ lastMsgTimeStamp: old, payAmount: 0, canReply: 1 }));
            await model.create(buildUserData({ lastMsgTimeStamp: Date.now(), payAmount: 0, canReply: 1 }));
            const res = await service.removeRedundantData();
            expect(res.deletedCount).toBe(1);
        });
        it('throws InternalServerError on failure', async () => {
            const spy = jest.spyOn(model, 'deleteMany').mockImplementationOnce(() => ({ exec: () => Promise.reject(new Error('boom')) }) as any);
            await expect(service.removeRedundantData()).rejects.toBeInstanceOf(InternalServerErrorException);
            spy.mockRestore();
        });
    });

    describe('resetUserCounts', () => {
        it('resets counts', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', totalCount: 99, paidReply: true }));
            const res = await service.resetUserCounts('p1', 'c1');
            expect(res.totalCount).toBe(0);
            expect(res.paidReply).toBe(false);
        });
    });
});
