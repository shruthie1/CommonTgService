/**
 * FakePaymentService (owner 2026-11-02): real Mongo (mongodb-memory-server) + real service; Postgres is a recording
 * fake of AnalyticsPgReader (the SQL functions are tested in tg-platform against a real Postgres 17).
 */
import { BadRequestException, HttpException } from '@nestjs/common';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { FakePaymentService } from '../fake-payment.service';

jest.mock('../../../utils', () => ({
    ...jest.requireActual('../../../utils'),
    getBotsServiceInstance: jest.fn(),
}));
import { getBotsServiceInstance } from '../../../utils';

const mockedGetBots = getBotsServiceInstance as jest.MockedFunction<typeof getBotsServiceInstance>;

const row = (chatId: string, profile: string, over: Record<string, unknown> = {}): any => ({
    chatId, profile, totalCount: 5, picCount: 0, lastMsgTimeStamp: Date.now(), limitTime: 0,
    paidCount: 0, prfCount: 0, canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0,
    ...over,
});

class FakePg {
    calls: { sql: string; params: unknown[] }[] = [];
    fail: { kind: 'query'; message: string; code?: string } | null = null;
    async query(sql: string, params: unknown[] = [], onError?: (e: any) => void) {
        this.calls.push({ sql, params });
        if (this.fail) { onError?.(this.fail); return undefined; }
        if (sql.includes('fake_payment_mark')) return [{ marked_now: 3, payments: 3, amount_marked: '350', payer_days: 2, payer_days_skipped: 0 }];
        if (sql.includes('fake_payment_unmark')) return [{ unmarked_now: 3, amount_restored: '350', payer_days: 2 }];
        if (sql.includes('payment_event_owner')) return [{ payments: 3, amount: '350', fake_payments: 0, owner_amount: '350' }];
        return [];
    }
}

describe('FakePaymentService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<UserDataDocument>;
    let pg: FakePg;
    let service: FakePaymentService;
    let sent: any[];

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'fake-payment' }).asPromise();
        model = connection.model<UserDataDocument>('UserDataFakePayment', UserDataSchema);
        await model.init();
    }, 120_000);
    beforeEach(async () => {
        await model.deleteMany({});
        pg = new FakePg();
        service = new FakePaymentService(model as any, pg as any);
        sent = [];
        mockedGetBots.mockReturnValue({ sendMessageByCategory: async (c: string, m: any) => { sent.push({ c, m }); return true; } } as any);
        await model.create([
            row('1118622422', 'ramya', { clientId: 'ramya1', payAmount: 150, highestPayAmount: 150, canReply: 1, cheatCount: 2 }),
            row('1118622422', 'shruthi', { clientId: 'shruthi2', payAmount: 0, canReply: 1, cheatCount: 0 }),
            row('999000111', 'ramya', { payAmount: 50 }),
        ]);
    });
    afterAll(async () => { await connection.dropDatabase(); await connection.close(); await mongod.stop(); });

    const raw = (chatId: string, profile: string) => model.collection.findOne({ chatId, profile }) as Promise<any>;

    it('mark: every persona row of the chat gets fakePaymentAt/By, prev values saved, payAmount 0, canReply 0; cheatCount untouched; other chats untouched', async () => {
        const res = await service.mark('1118622422', { by: 'ops-sai', reason: 'edited receipt' });
        expect(res.mongo).toEqual({ rows: 2, newlyMarked: 2 });
        expect(res.postgres).toEqual({ markedNow: 3, payments: 3, amountMarked: 350, payerDays: 2, payerDaysSkipped: 0 });
        const r = await raw('1118622422', 'ramya');
        expect(r.fakePaymentAt).toBeInstanceOf(Date);
        expect(r.fakePaymentBy).toBe('ops-sai');
        expect(r.fakePaymentReason).toBe('edited receipt');
        expect(r.fakePaymentPrev).toEqual({ payAmount: 150, canReply: 1 });
        expect([r.payAmount, r.canReply, r.cheatCount]).toEqual([0, 0, 2]);
        const s = await raw('1118622422', 'shruthi');
        expect([s.payAmount, s.canReply, s.cheatCount]).toEqual([0, 0, 0]);
        expect(s.fakePaymentAt).toBeInstanceOf(Date);
        const other = await raw('999000111', 'ramya');
        expect(other.fakePaymentAt).toBeUndefined();
        expect(other.payAmount).toBe(50);
        const call = pg.calls.find((c) => c.sql.includes('fake_payment_mark'))!;
        expect(call.params).toEqual(['1118622422']);
        expect(sent).toHaveLength(1);
        expect(sent[0].c).toBe('ACCOUNT_NOTIFICATIONS');
    });

    it('re-mark is idempotent: the original fakePaymentAt / fakePaymentPrev stay, a hand-released row is blocked again', async () => {
        await service.mark('1118622422', { by: 'a', reason: 'r' });
        const first = await raw('1118622422', 'ramya');
        await model.collection.updateOne({ chatId: '1118622422', profile: 'ramya' }, { $set: { canReply: 1 } });
        const res = await service.mark('1118622422', { by: 'b', reason: 'r2' });
        expect(res.mongo).toEqual({ rows: 2, newlyMarked: 0 });
        const again = await raw('1118622422', 'ramya');
        expect(again.fakePaymentAt).toEqual(first.fakePaymentAt);
        expect(again.fakePaymentBy).toBe('a');
        expect(again.fakePaymentPrev).toEqual({ payAmount: 150, canReply: 1 });
        expect(again.canReply).toBe(0);
    });

    it('Postgres failure after the Mongo half: 502 with what was done; repeating the mark completes it', async () => {
        pg.fail = { kind: 'query', message: 'function fake_payment_mark(text) does not exist', code: '42883' };
        let err: any;
        try { await service.mark('1118622422', { by: 'a', reason: 'r' }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(502);
        expect(err.getResponse().postgresError).toContain('42883');
        expect((await raw('1118622422', 'ramya')).fakePaymentAt).toBeInstanceOf(Date);
        expect(sent[0].m.severity).toBe('error');
        pg.fail = null;
        const res = await service.mark('1118622422', { by: 'a', reason: 'r' });
        expect(res.postgres.markedNow).toBe(3);
        expect((await raw('1118622422', 'ramya')).fakePaymentPrev).toEqual({ payAmount: 150, canReply: 1 });
    });

    it('unmark restores payAmount / canReply from fakePaymentPrev and removes the fields; cheatCount untouched', async () => {
        await service.mark('1118622422', { by: 'a', reason: 'r' });
        const res = await service.unmark('1118622422', { by: 'a', reason: 'mistake' });
        expect(res.mongo).toEqual({ rowsUnmarked: 2 });
        expect(res.postgres).toEqual({ unmarkedNow: 3, amountRestored: 350, payerDays: 2 });
        const r = await raw('1118622422', 'ramya');
        expect([r.payAmount, r.canReply, r.cheatCount]).toEqual([150, 1, 2]);
        expect(r).not.toHaveProperty('fakePaymentAt');
        expect(r).not.toHaveProperty('fakePaymentBy');
        expect(r).not.toHaveProperty('fakePaymentReason');
        expect(r).not.toHaveProperty('fakePaymentPrev');
        expect(pg.calls.find((c) => c.sql.includes('fake_payment_unmark'))!.params).toEqual(['1118622422']);
    });

    it('unmark restores only values the mark set and nobody changed since: a hand unblock, a credit while marked and a lowered peak are kept', async () => {
        await model.create(row('1118622422', 'kavya', { clientId: 'kavya1', payAmount: 120, highestPayAmount: 200, canReply: 0 }));
        await service.mark('1118622422', { by: 'a', reason: 'r' });
        // While marked: kavya (blocked before the mark) unblocked by hand; shruthi credited ₹100 (old build / manual
        // CMS credit); ramya's peak lowered to 50 (reset), so her ₹150 balance must not come back above it.
        await model.collection.updateOne({ chatId: '1118622422', profile: 'kavya' }, { $set: { canReply: 1 } });
        await model.collection.updateOne({ chatId: '1118622422', profile: 'shruthi' }, { $set: { payAmount: 100 } });
        await model.collection.updateOne({ chatId: '1118622422', profile: 'ramya' }, { $set: { highestPayAmount: 50 } });
        const res = await service.unmark('1118622422', { by: 'a', reason: 'mistake' });
        expect(res.mongo).toEqual({ rowsUnmarked: 3 });
        const k = await raw('1118622422', 'kavya');
        expect([k.canReply, k.payAmount]).toEqual([1, 120]); // stale prev canReply 0 not written back over the unblock
        const s = await raw('1118622422', 'shruthi');
        expect([s.canReply, s.payAmount]).toEqual([1, 100]); // stale prev payAmount 0 not written back over the credit
        const r = await raw('1118622422', 'ramya');
        expect([r.canReply, r.payAmount]).toEqual([1, 50]); // capped at the current highestPayAmount
        for (const x of [k, s, r]) expect(x).not.toHaveProperty('fakePaymentAt');
    });

    it('a chat with no Mongo rows is still marked in Postgres (rows deleted, the user is still owed nothing)', async () => {
        const res = await service.mark('5550001112', { by: 'a', reason: 'r' });
        expect(res.mongo).toEqual({ rows: 0, newlyMarked: 0 });
        expect(pg.calls.some((c) => c.sql.includes('fake_payment_mark'))).toBe(true);
    });

    it('validates input before writing anything', async () => {
        await expect(service.mark('abc', { by: 'a', reason: 'r' })).rejects.toBeInstanceOf(BadRequestException);
        // by falls back to 'tg-chats' (redesign 2026-11-07); the reason is still required to mark.
        await expect(service.mark('1118622422', { by: '', reason: '  ' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.unmark('abc', {})).rejects.toBeInstanceOf(BadRequestException);
        expect(pg.calls).toHaveLength(0);
        expect((await raw('1118622422', 'ramya')).fakePaymentAt).toBeUndefined();
    });

    it('status reports both stores; a Postgres error is reported, not thrown', async () => {
        await service.mark('1118622422', { by: 'a', reason: 'r' });
        const st = await service.status('1118622422');
        expect(st.marked).toBe(true);
        expect(st.mongo).toMatchObject({ rows: 2, markedRows: 2 });
        expect(st.postgres.payments).toEqual({ payments: 3, amount: 350, fakePayments: 0, ownerAmount: 350 });
        pg.fail = { kind: 'query', message: 'down' };
        const st2 = await service.status('1118622422');
        expect(st2.postgres.error).toBe('down');
        expect(st2.marked).toBe(true);
    });
});
