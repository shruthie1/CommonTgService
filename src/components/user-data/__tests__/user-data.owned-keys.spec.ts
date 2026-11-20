/**
 * Workflow-owned userData keys (userData audit A1/A2/A10, Codex blocker 2026-11-20).
 * The schema declares them so CMS model writes keep them, but the generic routes (PATCH /userData/:profile/:chatId,
 * PATCH /userData/updateAll/:chatId, POST /updateUserData/:chatId, POST /userData) must not write them: only their
 * owning workflows do (tg-aut ladder / service completion, payment uncredit, fake-payment).
 * Real MongoDB (mongodb-memory-server) through the real service.
 */
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../schemas/user-data.schema';
import { UserDataService } from '../user-data.service';
import { USER_DATA_WORKFLOW_OWNED_KEYS } from '../user-data.owned-keys';

const base = (chatId: string): any => ({
    chatId, profile: 'p1', picCount: 0, lastMsgTimeStamp: Date.now(), limitTime: 0,
    paidCount: 0, prfCount: 0, canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0,
});
const STORED: Record<string, unknown> = {
    showsPaidTo: 2,
    demoCompletions: 1,
    showCompletions: 3,
    lifetimePaid: 499,
    lifetimeCredits: 2,
    creditKeys: ['k1', 'k2'],
    firstPaidAt: 1760000000000,
    lastPaidAt: 1760000500000,
    fakePaymentAt: new Date('2026-11-07T10:00:00Z'),
    fakePaymentBy: 'ops',
    fakePaymentReason: 'edited',
    fakePaymentPrev: { payAmount: 350, canReply: 1 },
    fakePaymentHistory: [{ action: 'mark', by: 'ops', reason: 'edited', at: new Date('2026-11-07T10:00:00Z'), proofIds: ['p-1'] }],
    fakePaymentProofIds: ['p-1'],
    msgCount: 41,
};
const ATTEMPT: Record<string, unknown> = {
    showsPaidTo: 9,
    demoCompletions: 9,
    showCompletions: 9,
    lifetimePaid: 99999,
    lifetimeCredits: 9,
    creditKeys: [],
    firstPaidAt: 1,
    lastPaidAt: 1,
    fakePaymentAt: null,
    fakePaymentBy: 'evil',
    fakePaymentReason: 'evil',
    fakePaymentPrev: null,
    fakePaymentHistory: [],
    fakePaymentProofIds: ['evil'],
    msgCount: 0,
};

jest.setTimeout(60_000);

describe('UserData workflow-owned keys', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<UserDataDocument>;
    let service: UserDataService;
    let warn: jest.SpyInstance;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'user-data-owned-keys' }).asPromise();
        model = connection.model<UserDataDocument>('UserDataOwnedKeys', UserDataSchema);
        await model.init();
    }, 120_000);
    beforeEach(() => {
        service = new UserDataService(model as any);
        warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(async () => { await model.deleteMany({}); });
    afterAll(async () => { await connection.dropDatabase(); await connection.close(); await mongod.stop(); });

    const raw = (chatId: string) => model.collection.findOne({ chatId });
    const lines = () => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('user-data-update '));

    it('lists exactly the workflow-owned keys (audit A1/A2/A10, payment, fake-payment mark, msgCount)', () => {
        expect([...USER_DATA_WORKFLOW_OWNED_KEYS].sort()).toEqual(Object.keys(STORED).sort());
    });

    it('declares every owned key in the schema, optional, with no default', async () => {
        for (const k of USER_DATA_WORKFLOW_OWNED_KEYS) {
            const p: any = UserDataSchema.path(k);
            expect(p).toBeDefined();
            expect(p.isRequired).toBeFalsy();
        }
        await model.create(base('d1'));
        const row: any = await raw('d1');
        for (const k of USER_DATA_WORKFLOW_OWNED_KEYS) expect(row).not.toHaveProperty(k);
    });

    it.each(Object.keys(ATTEMPT))('PATCH /userData/:profile/:chatId with %s leaves the stored value unchanged and logs it', async (key) => {
        const chatId = '7000001234';
        await model.collection.insertOne({ ...base(chatId), ...STORED });
        const out: any = await service.update('p1', chatId, { [key]: ATTEMPT[key], payAmount: 25 } as any);
        const row: any = await raw(chatId);
        expect(row[key]).toEqual(STORED[key]);
        expect(row.payAmount).toBe(25); // the rest of the body is still written
        expect(out[key]).toEqual(STORED[key]);
        expect(lines()).toEqual([`user-data-update kind=stripped_owned keys=${key} chat=****1234`]);
    });

    it('a dotted path under an owned key is stripped too', async () => {
        const chatId = '7000005678';
        await model.collection.insertOne({ ...base(chatId), ...STORED });
        await service.update('p1', chatId, { 'fakePaymentHistory.0.by': 'x', showsPaidTo: 0 } as any);
        const row: any = await raw(chatId);
        expect(row.fakePaymentHistory).toEqual(STORED.fakePaymentHistory);
        expect(row.showsPaidTo).toBe(2);
        expect(lines()).toEqual(['user-data-update kind=stripped_owned keys=fakePaymentHistory.0.by,showsPaidTo chat=****5678']);
    });

    it('PATCH /userData/updateAll/:chatId strips every owned key on every persona row', async () => {
        const chatId = '7000009999';
        await model.collection.insertMany([{ ...base(chatId), ...STORED }, { ...base(chatId), profile: 'p2', ...STORED }]);
        await service.updateAll(chatId, { ...ATTEMPT, limitTime: 5 } as any);
        for (const r of await model.collection.find({ chatId }).toArray() as any[]) {
            for (const [k, v] of Object.entries(STORED)) expect(r[k]).toEqual(v);
            expect(r.limitTime).toBe(5);
        }
        expect(lines()).toEqual([`user-data-update kind=stripped_owned keys=${Object.keys(ATTEMPT).join(',')} chat=****9999`]);
    });

    it('POST /userData (create) does not write owned keys', async () => {
        await service.create({ ...base('7000004321'), ...ATTEMPT } as any);
        const row: any = await raw('7000004321');
        for (const k of USER_DATA_WORKFLOW_OWNED_KEYS) expect(row).not.toHaveProperty(k);
        expect(lines()).toEqual([`user-data-update kind=stripped_owned keys=${Object.keys(ATTEMPT).join(',')} chat=****4321`]);
    });

    it('PATCH /userData/updateAll/:chatId cannot change chatId or profile (silent, like PATCH /userData/:profile/:chatId)', async () => {
        const chatId = '7000008888';
        await model.collection.insertMany([base(chatId), { ...base(chatId), profile: 'p2' }]);
        await service.updateAll(chatId, { chatId: '1', profile: 'evil', _id: 'x', 'profile.x': 1, limitTime: 7 } as any);
        const rows = await model.collection.find({ chatId }).sort({ profile: 1 }).toArray() as any[];
        expect(rows.map((r) => [r.chatId, r.profile, r.limitTime])).toEqual([[chatId, 'p1', 7], [chatId, 'p2', 7]]);
        expect(await model.collection.countDocuments({ chatId: '1' })).toBe(0);
        expect(lines()).toEqual([]);
    });

    it('PATCH /userData/:profile/:chatId cannot change chatId or profile', async () => {
        const chatId = '7000007777';
        await model.collection.insertOne(base(chatId));
        await service.update('p1', chatId, { chatId: '1', profile: 'evil', payAmount: 5 } as any);
        const row: any = await raw(chatId);
        expect([row.chatId, row.profile, row.payAmount]).toEqual([chatId, 'p1', 5]);
    });

    it('windowCount (the daily counter) stays writable through PATCH (tg-chats edits it); msgCount does not', async () => {
        const chatId = '7000006666';
        await model.collection.insertOne({ ...base(chatId), msgCount: 41, windowCount: 90 });
        await service.update('p1', chatId, { windowCount: 10, msgCount: 0 } as any);
        const row: any = await raw(chatId);
        expect([row.windowCount, row.msgCount]).toEqual([10, 41]);
        expect(lines()).toEqual(['user-data-update kind=stripped_owned keys=msgCount chat=****6666']);
    });

    it('windowCount accepts only a finite number on create, PATCH and updateAll; the next inbound $inc still works', async () => {
        const inbound = (chatId: string) => model.collection.updateMany({ chatId }, { $inc: { msgCount: 1, windowCount: 1 } });
        await service.create({ ...base('7000005551'), windowCount: null } as any);
        await model.collection.insertOne({ ...base('7000005552'), msgCount: 3, windowCount: 7 });
        await service.update('p1', '7000005552', { windowCount: '', payAmount: 4 } as any);
        await model.collection.insertMany([{ ...base('7000005553'), msgCount: 2, windowCount: 5 }, { ...base('7000005553'), profile: 'p2', msgCount: 2, windowCount: 5 }]);
        await service.updateAll('7000005553', { windowCount: 'x', 'windowCount.a': 1 } as any);
        for (const id of ['7000005551', '7000005552', '7000005553']) await inbound(id);
        expect((await raw('7000005551') as any).windowCount).toBe(1);
        expect([(await raw('7000005552') as any).windowCount, (await raw('7000005552') as any).msgCount, (await raw('7000005552') as any).payAmount]).toEqual([8, 4, 4]);
        expect((await model.collection.find({ chatId: '7000005553' }).toArray() as any[]).map((r) => [r.windowCount, r.msgCount])).toEqual([[6, 3], [6, 3]]);
        expect(lines()).toEqual([
            'user-data-update kind=stripped_invalid_counter keys=windowCount chat=****5551',
            'user-data-update kind=stripped_invalid_counter keys=windowCount chat=****5552',
            'user-data-update kind=stripped_invalid_counter keys=windowCount,windowCount.a chat=****5553',
        ]);
        await service.update('p1', '7000005552', { windowCount: 0 } as any);
        expect((await raw('7000005552') as any).windowCount).toBe(0);
        expect(lines()).toHaveLength(3);
    });

    it('a body with no owned key logs nothing', async () => {
        await model.collection.insertOne(base('7000000001'));
        await service.update('p1', '7000000001', { payAmount: 10 } as any);
        expect(lines()).toEqual([]);
    });

    it('the raw-collection path (payment uncredit) still writes showsPaidTo', async () => {
        await model.collection.insertOne({ ...base('7000000002'), showsPaidTo: 3 });
        await model.collection.updateOne({ chatId: '7000000002' }, { $set: { showsPaidTo: 2 } });
        expect((await raw('7000000002') as any).showsPaidTo).toBe(2);
        const doc: any = await service.findOne('p1', '7000000002');
        expect(doc.showsPaidTo).toBe(2);
    });

    it('a model bulkWrite in default strict mode (fake-payment) keeps the owned keys', async () => {
        await model.collection.insertOne(base('7000000003'));
        const at = new Date('2026-11-20T00:00:00Z');
        await model.bulkWrite([{
            updateOne: {
                filter: { chatId: '7000000003' },
                update: {
                    $set: { fakePaymentProofIds: ['a', 'b'] },
                    $push: { fakePaymentHistory: { action: 'mark', by: 'ops', reason: 'r', at, proofIds: ['a'] } },
                } as any,
            },
        }], { ordered: true });
        const row: any = await raw('7000000003');
        expect(row.fakePaymentProofIds).toEqual(['a', 'b']);
        expect(row.fakePaymentHistory).toEqual([{ action: 'mark', by: 'ops', reason: 'r', at, proofIds: ['a'] }]);
    });
});
