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
    chatId, profile: 'p1', totalCount: 1, picCount: 0, lastMsgTimeStamp: Date.now(), limitTime: 0,
    paidCount: 0, prfCount: 0, canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0,
});
const STORED: Record<string, unknown> = {
    showsPaidTo: 2,
    demoCompletions: 1,
    showCompletions: 3,
    fakePaymentHistory: [{ action: 'mark', by: 'ops', reason: 'edited', at: new Date('2026-11-07T10:00:00Z'), proofIds: ['p-1'] }],
    fakePaymentProofIds: ['p-1'],
};
const ATTEMPT: Record<string, unknown> = {
    showsPaidTo: 9,
    demoCompletions: 9,
    showCompletions: 9,
    fakePaymentHistory: [],
    fakePaymentProofIds: ['evil'],
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

    it('lists exactly the five keys the audit found missing from the schema', () => {
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
