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
import { USER_DATA_RESET_KEEPS, userDataResetFields } from '../user-data.reset';
import { Logger } from '../../../utils';

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
        windowCount: 5,
        msgCount: 5,
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
        picsSent: 0,
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

        it('applies canonical defaults when a valid identity is created through CommonTgService', async () => {
            const doc = await service.create({ chatId: 'c1', profile: 'p1' } as any);
            expect(doc).toMatchObject({
                canReply: 1,
                paidReply: true,
                picsSent: 0,
                videos: [],
                fullShow: 0,
                attributionChannelIds: [],
                attributionUpdatedAt: 0,
            });
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
        it('updates an existing record and strips _id/profile/chatId from dto', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1', windowCount: 1 }));
            const res = await service.update('p1', 'c1', { windowCount: 99, _id: 'x', profile: 'evil', chatId: 'evil' } as any);
            expect(res.windowCount).toBe(99);
            expect(res.profile).toBe('p1');
            expect(res.chatId).toBe('c1');
        });

        it('does not create a partial document when the target is missing', async () => {
            await expect(service.update('missing-profile', 'missing-chat', { canReply: 1 } as any))
                .rejects.toBeInstanceOf(NotFoundException);
            expect(await model.countDocuments({})).toBe(0);
        });

    });

    describe('updateAll', () => {
        it('updates many matching chatId', async () => {
            await model.create(buildUserData({ chatId: 'shared', profile: 'p1' }));
            await model.create(buildUserData({ chatId: 'shared', profile: 'p2' }));
            const res = await service.updateAll('shared', { windowCount: 7, _id: 'x' } as any);
            expect(res.modifiedCount).toBe(2);
            const docs = await model.find({ chatId: 'shared' }).lean();
            expect(docs.every(d => d.windowCount === 7)).toBe(true);
        });

        it('is a no-op when no docs match (no phantom upsert insert)', async () => {
            const res = await service.updateAll('chatId-that-matches-nothing', { windowCount: 5 } as any);
            expect(res.upsertedCount).toBe(0);
            expect(await model.countDocuments({})).toBe(0);
        });
    });

    describe('remove (DELETE route): resets, never deletes (owner 2026-11-20, A11)', () => {
        const KEPT = {
            clientId: 'p1a', username: 'raju', accessHash: 'ah', lastMsgTimeStamp: 1_700_000_000_000,
            lifetimePaid: 450, lifetimeCredits: 3, creditKeys: ['k1', 'k2'], firstPaidAt: 1_600_000_000_000, lastPaidAt: 1_650_000_000_000,
            fakePaymentAt: new Date(5), fakePaymentBy: 'op', fakePaymentReason: 'edited', fakePaymentPrev: { payAmount: 50, canReply: 1 },
            attributionChannelIds: ['-1001'], attributionUpdatedAt: 99, demoCompletions: 1, showCompletions: 2,
        };
        const DIRTY = {
            payAmount: 150, highestPayAmount: 350, demoGiven: true, secondShow: true, fullShow: 3, callTime: 5, videos: ['1', '2'],
            cheatCount: 4, graceFlag: true, canReply: 0, limitTime: 9e12, paidCount: 2, picCount: 3, prfCount: 1, picsSent: 4,
            paidReply: false, msgCount: 300, windowCount: 120, cycleVideoBase: 2, cyclePaid: 350, showsPaidTo: 3,
            callProgress: { 1: { positionSec: 3, durationSec: 10, updatedAt: 1, completed: false } },
        };
        const logs = () => (Logger.prototype.log as jest.Mock).mock.calls.concat((Logger.prototype.warn as jest.Mock).mock.calls)
            .map((c) => String(c[0])).filter((l) => l.startsWith('user-data-reset '));

        beforeEach(() => {
            jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
            jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        });
        afterEach(() => jest.restoreAllMocks());

        it('the row still exists, payment history and the fake mark are kept, the rest is a fresh row', async () => {
            await model.create(buildUserData({ profile: 'p1', chatId: 'c1234', ...KEPT, ...DIRTY } as any));
            const reset = await service.remove('p1', 'c1234');
            const row = await model.findOne({ profile: 'p1', chatId: 'c1234' }).lean();
            expect(row).not.toBeNull();
            expect(await model.countDocuments({})).toBe(1);
            expect(reset).toEqual(expect.objectContaining({ ...KEPT, chatId: 'c1234', profile: 'p1' }));
            expect(row).toEqual(expect.objectContaining({ ...KEPT, ...userDataResetFields() }));
            expect(logs()).toEqual([`user-data-reset kind=cms-delete-route chat=****1234 fields=${Object.keys(userDataResetFields()).length} matched=1`]);
        });

        it('the reset set is a fresh row minus the kept keys: no kept key is written, every written key is in the schema', () => {
            const fields = Object.keys(userDataResetFields());
            expect(fields.filter((k) => (USER_DATA_RESET_KEEPS as readonly string[]).includes(k))).toEqual([]);
            const schemaPaths = Object.keys(UserDataSchema.paths);
            expect(fields.filter((k) => !schemaPaths.includes(k))).toEqual([]);
            expect(fields).toHaveLength(22);
        });

        it('sends a masked bot message when botsService present', async () => {
            mockedGetBots.mockReturnValue(botsStub as any);
            await model.create(buildUserData({ profile: 'p2', chatId: 'c2' }));
            await service.remove('p2', 'c2');
            expect(botsStub.sendMessageByCategory).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(botsStub.sendMessageByCategory.mock.calls[0])).not.toContain('"c2"');
        });

        it('404 and a matched=0 line when no row matches; nothing is created', async () => {
            mockedGetBots.mockReturnValue(null as any);
            await expect(service.remove('none', 'none9876')).rejects.toBeInstanceOf(NotFoundException);
            expect(await model.countDocuments({})).toBe(0);
            expect(logs()).toEqual([`user-data-reset kind=cms-delete-route chat=****9876 fields=22 matched=0`]);
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
            await model.create(buildUserData({ windowCount: 1 }));
            await model.create(buildUserData({ windowCount: 2 }));
            await model.create(buildUserData({ windowCount: 3 }));
            const res = await service.executeQuery({}, { windowCount: -1 }, 2, 1);
            expect(res.length).toBe(2);
            expect(res[0].windowCount).toBe(2);
        });

        it('throws InternalServerError on a bad query', async () => {
            await expect(service.executeQuery({ $badop: 1 } as any)).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });
});
