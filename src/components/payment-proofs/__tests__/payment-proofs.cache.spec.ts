/**
 * PaymentProofsService list cache (prod 2026-11-03: every list re-read the whole 7-day window, ~8.5 s on VM2):
 * single-flight, 60 s fresh, stale-while-revalidate, patched in place by stampChat() and the fake-payment mark.
 * Real Mongo (mongodb-memory-server) + real services; the window read is counted on proofModel.find.
 */
import mongoose, { Connection, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { PaymentProofSchema } from '../schemas/payment-proof.schema';
import { PaymentProofsService } from '../payment-proofs.service';
import { FakePaymentService } from '../../fake-payment/fake-payment.service';

jest.mock('../../../utils', () => ({
    ...jest.requireActual('../../../utils'),
    getBotsServiceInstance: jest.fn(() => ({ sendMessageByCategory: async () => true })),
}));

const NOW = Date.parse('2026-11-03T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);

const ud = (chatId: string, profile: string, over: Record<string, unknown> = {}): any => ({
    chatId, profile, totalCount: 5, picCount: 0, lastMsgTimeStamp: NOW, limitTime: 0, paidCount: 0, prfCount: 0,
    canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0, ...over,
});

let seq = 0;
const proof = (over: Record<string, unknown>): any => ({
    _id: new Types.ObjectId(), chatId: '111', profile: 'ramya', clientId: 'ramya1', telegramMsgId: ++seq,
    decision: 'ACCEPT', reasons: [], mode: 'enforce', provider: 'tg-aut', source: 'local', createdAt: at(seq), ...over,
});

class FakePg {
    async query(sql: string) {
        if (sql.includes('fake_payment_mark')) return [{ marked_now: 1, payments: 1, amount_marked: '20', payer_days: 1, payer_days_skipped: 0 }];
        if (sql.includes('fake_payment_unmark')) return [{ unmarked_now: 1, amount_restored: '20', payer_days: 1 }];
        return [];
    }
}

/** A find() chain whose exec rejects (the window read is find().sort().limit().lean().exec()). */
const failingFind = (err: Error): any => {
    const q: any = { sort: () => q, limit: () => q, lean: () => q, exec: () => Promise.reject(err) };
    return q;
};

async function until(check: () => Promise<boolean>, tries = 100) {
    for (let i = 0; i < tries; i++) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('condition not reached');
}

describe('PaymentProofsService list cache', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let proofs: Model<any>;
    let userData: Model<UserDataDocument>;
    let service: PaymentProofsService;
    let findSpy: jest.SpyInstance;
    const windowFinds = () => findSpy.mock.calls.filter((c) => c[0] && 'createdAt' in c[0]).length;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'payment-proofs-cache' }).asPromise();
        proofs = connection.model('PaymentProofCache', PaymentProofSchema, 'paymentProofs');
        userData = connection.model<UserDataDocument>('UserDataPaymentProofsCache', UserDataSchema, 'userData');
        await proofs.init();
        await userData.init();
    }, 120_000);
    afterAll(async () => { await connection.close(); await mongod.stop(); });

    beforeEach(async () => {
        seq = 0;
        delete process.env.PAYMENT_PROOFS_LIST_CACHE_MS;
        await proofs.deleteMany({});
        await userData.deleteMany({});
        await connection.collection('clients').deleteMany({});
        await connection.collection('clients').insertMany([{ clientId: 'ramya1', repl: 'https://ramya1.paidgirls.site' }]);
        await userData.create([ud('111', 'ramya', { username: 'u111' }), ud('333', 'ramya', { username: 'u333' })]);
        await proofs.collection.insertMany([
            proof({ servedAt: at(1), creditAmount: 20, amount: 20 }),
            proof({ servedAt: at(2), creditAmount: 350, amount: 350 }),
            proof({ ask: { kind: 'fraud', state: 'open', openedAt: at(3) } }), // a fake on chat 111: its credited proofs go to review
            proof({ chatId: '333', amount: 50 }),
        ]);
        service = new PaymentProofsService(proofs as any, userData as any);
        findSpy = jest.spyOn(proofs, 'find');
    });
    afterEach(() => { findSpy.mockRestore(); delete process.env.PAYMENT_PROOFS_LIST_CACHE_MS; });

    it('(a) concurrent calls share one window read and get the same counts', async () => {
        const [a, b] = await Promise.all([service.list({}, NOW), service.list({ limit: 1 }, NOW)]);
        expect(windowFinds()).toBe(1);
        expect(a.counts).toEqual(b.counts);
        expect(b.items).toHaveLength(1);
    });

    it('(b) a second call within the TTL does not re-read; per-request filters and paging still apply', async () => {
        const first = await service.list({ state: 'all' }, NOW);
        const second = await service.list({ state: 'all', limit: 2 }, NOW + 59_000);
        const client = await service.list({ state: 'all', minAmount: 100 }, NOW + 59_000);
        expect(windowFinds()).toBe(1);
        expect(first.counts.all).toBe(4);
        expect(second.items.map((i) => i.telegramMsgId)).toEqual(first.items.slice(0, 2).map((i) => i.telegramMsgId));
        expect(second.nextCursor).not.toBeNull();
        expect(client.counts.all).toBe(1);
    });

    it('(c) stampChat() is reflected by the next list without a window re-read', async () => {
        const before = await service.list({}, NOW);
        expect(before.counts.reviewed).toBe(0);
        await service.stampChat('111', { decision: 'fine', proofIds: ['ramya1-111-2'] }, new Date(NOW));
        const after = await service.list({}, NOW);
        expect(after.counts.reviewed).toBe(1);
        expect(after.items.find((i) => i.telegramMsgId === 2)?.stamp).toEqual({ decision: 'fine', at: new Date(NOW).toISOString() });
        expect(windowFinds()).toBe(1);
    });

    it('(c) fake-payment mark / unmark is reflected by the next list without a window re-read', async () => {
        const fake = new FakePaymentService(userData as any, new FakePg() as any, service);
        expect((await service.list({ state: 'all' }, NOW)).counts.marked).toBe(0);
        await fake.mark('333', { by: 'ops', reason: 'edited' });
        const marked = await service.list({ state: 'all' }, NOW);
        expect(marked.counts.marked).toBe(1);
        expect(marked.items.find((i) => i.chatId === '333')?.fakePaymentAt).toBeInstanceOf(Date);
        await fake.unmark('333', { by: 'ops', reason: 'mistake' });
        const unmarked = await service.list({ state: 'all' }, NOW);
        expect(unmarked.counts.marked).toBe(0);
        expect(unmarked.items.find((i) => i.chatId === '333')?.fakePaymentAt).toBeNull();
        expect(windowFinds()).toBe(1);
    });

    it('(d) a stale copy is served at once while one background reload runs, then the reload is used', async () => {
        await service.list({ state: 'all' }, NOW);
        await proofs.collection.insertMany([proof({ chatId: '333', amount: 70, createdAt: at(0.5) })]);
        const stale = await Promise.all([service.list({ state: 'all' }, NOW + 61_000), service.list({ state: 'all' }, NOW + 61_000)]);
        expect(stale.map((r) => r.counts.all)).toEqual([4, 4]);
        expect(windowFinds()).toBe(2); // one reload for both stale callers
        await until(async () => (await service.list({ state: 'all' }, NOW + 62_000)).counts.all === 5);
        expect(windowFinds()).toBe(2);
    });

    it('(e) a failed first load rejects (nothing cached; the next call loads again)', async () => {
        findSpy.mockImplementationOnce(() => failingFind(new Error('atlas down')));
        await expect(service.list({}, NOW)).rejects.toThrow('atlas down');
        expect((await service.list({ state: 'all' }, NOW)).counts.all).toBe(4);
        expect(windowFinds()).toBe(2);
    });

    it('(e) a failed background reload keeps the good copy and is logged', async () => {
        const logged = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
        await service.list({ state: 'all' }, NOW);
        await proofs.collection.insertMany([proof({ chatId: '333', amount: 70, createdAt: at(0.5) })]);
        findSpy.mockImplementationOnce(() => failingFind(new Error('atlas down')));
        expect((await service.list({ state: 'all' }, NOW + 61_000)).counts.all).toBe(4);
        await until(async () => logged.mock.calls.length > 0);
        expect(String(logged.mock.calls[0][0])).toContain('atlas down');
        // still the good copy (stale), and the next stale call reloads successfully
        expect((await service.list({ state: 'all' }, NOW + 62_000)).counts.all).toBe(4);
        await until(async () => (await service.list({ state: 'all' }, NOW + 63_000)).counts.all === 5);
    });

    it('PAYMENT_PROOFS_LIST_CACHE_MS=0 disables the cache', async () => {
        process.env.PAYMENT_PROOFS_LIST_CACHE_MS = '0';
        await service.list({}, NOW);
        await service.list({}, NOW);
        expect(windowFinds()).toBe(2);
    });

    it('older explicit since windows are cached separately and capped at 4 entries', async () => {
        for (let d = 8; d <= 13; d++) await service.list({ since: new Date(NOW - d * 86400_000).toISOString() }, NOW);
        await service.list({}, NOW);
        expect(windowFinds()).toBe(7);
        expect((service as any).windows.size).toBe(4);
        await service.list({}, NOW);
        expect(windowFinds()).toBe(7);
    });
});
