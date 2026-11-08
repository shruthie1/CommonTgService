/**
 * PaymentUncreditService (owner 2026-11-08): real Mongo (mongodb-memory-server) + real service; Postgres is a
 * recording fake of AnalyticsPgReader (payment_void / payment_unvoid run for real in tg-platform's PGlite test).
 */
import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { PaymentProofSchema } from '../../payment-proofs/schemas/payment-proof.schema';
import { PaymentUncreditService } from '../payment-uncredit.service';

jest.mock('../../../utils', () => ({
    ...jest.requireActual('../../../utils'),
    getBotsServiceInstance: jest.fn(),
}));
import { getBotsServiceInstance } from '../../../utils';

const mockedGetBots = getBotsServiceInstance as jest.MockedFunction<typeof getBotsServiceInstance>;

const CHAT = '8296621331';
const CLIENT = 'sowmya1';
const PROFILE = 'sowmya';
const MSG = 183799;
const PROOF_ID = `${CLIENT}-${CHAT}-${MSG}`;
const NOW = Date.parse('2026-11-08T06:00:00Z');
const SERVED = new Date('2026-11-08T04:03:01.495Z');

class FakePg {
    calls: { sql: string; params: unknown[] }[] = [];
    enabled = true;
    voidRow: any = { status: 'voided', payment_id: '5060', amount: 350, day: '2026-11-08', payers_taken: true, payers_mobile: '917814283401' };
    unvoidRow: any = { status: 'unvoided', payment_id: '5060', amount: 350, day: '2026-11-08', payers_given: true };
    failVoid = false;
    failUnvoid = 0;
    isEnabled() { return this.enabled; }
    async query(sql: string, params: unknown[] = [], onError?: (e: any) => void) {
        this.calls.push({ sql, params });
        if (sql.includes('payment_unvoid')) {
            if (this.failUnvoid > 0) { this.failUnvoid--; onError?.({ kind: 'query', message: 'connection reset', code: 'ECONNRESET' }); return undefined; }
            return [this.unvoidRow];
        }
        if (sql.includes('payment_void')) {
            if (this.failVoid) { onError?.({ kind: 'query', message: 'function payment_void does not exist', code: '42883' }); return undefined; }
            return [this.voidRow];
        }
        return [];
    }
    count(fn: string) { return this.calls.filter((c) => c.sql.includes(`${fn}(`)).length; }
}

/** The 2026-11-08 sowmya case: an earlier genuine ₹350 and ₹150, the fake ₹350 credited and its show delivered. */
const userRow = (over: Record<string, unknown> = {}) => ({
    chatId: CHAT, profile: PROFILE, clientId: CLIENT, totalCount: 5, picCount: 0, lastMsgTimeStamp: NOW, limitTime: 0,
    paidCount: 0, prfCount: 0, canReply: 1, cheatCount: 0,
    payAmount: 150, highestPayAmount: 350, lifetimePaid: 850, lifetimeCredits: 4, fullShow: 1, showsPaidTo: 0,
    secondShow: true, demoGiven: true, callTime: SERVED.getTime() + 5 * 60_000, creditKeys: ['msg:183799'],
    ...over,
});

const proofRow = (msg: number, over: Record<string, unknown> = {}) => ({
    chatId: CHAT, profile: PROFILE, clientId: CLIENT, telegramMsgId: msg, proofId: `${CLIENT}-${CHAT}-${msg}`,
    createdAt: new Date(SERVED.getTime() - 60), amount: 350, creditAmount: 350, servedAt: SERVED,
    verdict: { outcome: 'credited' }, review: { decision: 'fine', at: new Date('2026-11-08T04:08:03.787Z') },
    ...over,
});

describe('PaymentUncreditService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let users: Model<any>;
    let proofs: Model<any>;
    let pg: FakePg;
    let service: PaymentUncreditService;
    let sent: any[];
    let cache: { chatChanged: jest.Mock; proofsChanged: jest.Mock };

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'payment-uncredit' }).asPromise();
        users = connection.model('UserDataUncredit', UserDataSchema, 'userData');
        proofs = connection.model('PaymentProofUncredit', PaymentProofSchema, 'paymentProofs');
    }, 120_000);
    beforeEach(async () => {
        jest.restoreAllMocks();
        await users.collection.deleteMany({});
        await proofs.collection.deleteMany({});
        await connection.collection('stats2').deleteMany({});
        pg = new FakePg();
        cache = { chatChanged: jest.fn(async () => undefined), proofsChanged: jest.fn(async () => undefined) };
        service = new PaymentUncreditService(proofs as any, users as any, pg as any, cache as any);
        sent = [];
        mockedGetBots.mockReturnValue({ sendMessageByCategory: async (c: string, m: any) => { sent.push({ c, m }); return true; } } as any);
        await users.collection.insertMany([userRow(), { ...userRow({ profile: 'kavya', clientId: 'kavya1', payAmount: 150, lifetimePaid: 200 }) }]);
        await proofs.collection.insertMany([
            proofRow(MSG),
            proofRow(170001, { amount: 350, creditAmount: 350, servedAt: new Date('2026-11-06T10:00:00Z') }),
            proofRow(170002, { amount: 150, creditAmount: 150, servedAt: new Date('2026-11-05T10:00:00Z') }),
            proofRow(170003, { amount: 999, creditAmount: undefined, servedAt: undefined, verdict: { outcome: 'fraud_ask' } }),
        ]);
        await connection.collection('stats2').insertOne({ chatId: CHAT, profile: PROFILE, client: CLIENT, payAmount: 350, dailyPaidCountedAt: '2026-11-08', dailyRevenueCounted: 350 });
    });
    afterAll(async () => { await connection.dropDatabase(); await connection.close(); await mongod.stop(); });

    const user = (profile = PROFILE) => users.collection.findOne({ chatId: CHAT, profile }) as Promise<any>;
    const proof = (msg = MSG) => proofs.collection.findOne({ telegramMsgId: msg }) as Promise<any>;
    const stats = () => connection.collection('stats2').findOne({ chatId: CHAT }) as Promise<any>;

    it('void: Postgres payment_void with the proof link, stats2 marker unset (payer taken), userData as the manual 5060 fix, review fake', async () => {
        const res = await service.uncredit(PROOF_ID, { reason: 'resent', by: 'ops-sai' }, NOW);
        expect(res.changed).toBe(true);
        expect(res.postgres).toEqual({ status: 'voided', paymentId: '5060', linked: true, payersTaken: true, day: '2026-11-08' });
        expect(res.stats2).toBe('unset');
        expect(pg.calls[0].params).toEqual([PROOF_ID, CHAT, CLIENT, PROFILE, 350, SERVED.toISOString(), 'resent', 'ops-sai']);
        expect(pg.calls[0].sql).toContain('day::text AS day');

        const u = await user();
        // highestPayAmount stays 350 (the earlier genuine ₹350); payAmount stays 150; the cycle ends at owedShowCap(350) = 7.
        expect([u.lifetimePaid, u.lifetimeCredits, u.highestPayAmount, u.payAmount, u.fullShow, u.showsPaidTo]).toEqual([500, 3, 350, 150, 7, 0]);
        expect([u.secondShow, u.demoGiven, u.canReply, u.cheatCount]).toEqual([true, true, 1, 0]);
        expect(u.creditKeys).toEqual(['msg:183799']);
        expect((await user('kavya')).lifetimePaid).toBe(200);

        const s = await stats();
        expect(s.dailyPaidCountedAt).toBeUndefined();
        expect(s.dailyRevenueCounted).toBeUndefined();
        expect(s.payAmount).toBe(350);

        const p = await proof();
        expect(p.uncredited.state).toBe('done');
        expect(p.uncredited).toMatchObject({ by: 'ops-sai', reason: 'resent', note: '', amount: 350 });
        expect(p.uncredited.undo.review).toEqual({ decision: 'fine', at: new Date('2026-11-08T04:08:03.787Z') });
        expect(p.review.decision).toBe('fake');
        expect(cache.chatChanged).toHaveBeenCalledWith(CHAT);
        expect(cache.proofsChanged).toHaveBeenCalledWith(CHAT);
        expect(sent[0].m.title).toBe('Payment uncredited (₹350)');
    });

    it('payer kept (another counted payment that day): stats2 revenue lowered, marker kept', async () => {
        pg.voidRow = { ...pg.voidRow, payers_taken: false, payers_mobile: null };
        await connection.collection('stats2').updateOne({ chatId: CHAT }, { $set: { dailyRevenueCounted: 500 } });
        const res = await service.uncredit(PROOF_ID, { reason: 'duplicate' }, NOW);
        expect(res.stats2).toBe('lowered');
        const s = await stats();
        expect([s.dailyPaidCountedAt, s.dailyRevenueCounted]).toEqual(['2026-11-08', 150]);
    });

    it('marker on another day (a later genuine payment counted a new day): stats2 unchanged', async () => {
        await connection.collection('stats2').updateOne({ chatId: CHAT }, { $set: { dailyPaidCountedAt: '2026-11-09' } });
        const res = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW);
        expect(res.stats2).toBe('unchanged');
        expect((await stats()).dailyPaidCountedAt).toBe('2026-11-09');
    });

    it('idempotent: a second Uncredit answers changed:false and writes nothing', async () => {
        await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW);
        const u1 = await user();
        const res = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW + 1000);
        expect(res.changed).toBe(false);
        expect(res.uncredited.reason).toBe('resent');
        expect(pg.count('payment_void')).toBe(1);
        expect(await user()).toEqual(u1);
    });

    it('recredit restores userData, stats2, Postgres and the previous stamp; history kept; a repeat is changed:false', async () => {
        const before = await user();
        await service.uncredit(PROOF_ID, { reason: 'other', note: 'owner said genuine?' }, NOW);
        const res = await service.recredit(PROOF_ID, { by: 'ops-sai' }, NOW + 60_000);
        expect(res.changed).toBe(true);
        expect(res.postgres).toEqual({ status: 'unvoided', paymentId: '5060', payersGiven: true, day: '2026-11-08' });
        expect(res.stats2).toBe('restored');
        expect(res.userData?.skipped).toEqual([]);
        expect(pg.calls[pg.calls.length - 1].params).toEqual([PROOF_ID, CHAT]);
        expect(await user()).toEqual(before);
        const s = await stats();
        expect([s.dailyPaidCountedAt, s.dailyRevenueCounted]).toEqual(['2026-11-08', 350]);
        const p = await proof();
        expect(p.uncredited).toBeUndefined();
        expect(p.review).toEqual({ decision: 'fine', at: new Date('2026-11-08T04:08:03.787Z') });
        expect(p.uncreditHistory).toHaveLength(1);
        expect(p.uncreditHistory[0]).toMatchObject({ reason: 'other', note: 'owner said genuine?', amount: 350, recreditedBy: 'ops-sai' });
        expect((await service.recredit(PROOF_ID, {}, NOW + 120_000)).changed).toBe(false);
        expect(pg.count('payment_unvoid')).toBe(1);
    });

    it('recredit keeps a field that moved since (a new payment) and a day a genuine payment re-counted; lifetime deltas always come back', async () => {
        pg.voidRow = { ...pg.voidRow };
        await users.collection.updateOne({ chatId: CHAT, profile: PROFILE }, { $set: { fullShow: 3, callTime: 0 } });
        // not delivered: payAmount 150 -> 0, showsPaidTo untouched (0 <= fullShow)
        await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW);
        expect((await user()).payAmount).toBe(0);
        await users.collection.updateOne({ chatId: CHAT, profile: PROFILE }, { $set: { payAmount: 200 }, $inc: { lifetimePaid: 200 } });
        await connection.collection('stats2').updateOne({ chatId: CHAT }, { $set: { dailyPaidCountedAt: '2026-11-08', dailyRevenueCounted: 200 } });
        const res = await service.recredit(PROOF_ID, {}, NOW + 60_000);
        expect(res.userData?.skipped).toEqual(['payAmount']);
        expect(res.stats2).toBe('kept');
        const u = await user();
        expect([u.payAmount, u.lifetimePaid, u.lifetimeCredits]).toEqual([200, 1050, 4]);
        expect((await stats()).dailyRevenueCounted).toBe(200);
    });

    it('compensation: a userData failure undoes stats2 and Postgres, releases the claim, 502 compensated', async () => {
        jest.spyOn(users.collection, 'updateOne').mockImplementationOnce(async () => { throw new Error('write conflict'); });
        const err = await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(502);
        expect(err.getResponse()).toMatchObject({ failedAt: 'userData', compensated: true });
        expect(pg.count('payment_unvoid')).toBe(1);
        const s = await stats();
        expect([s.dailyPaidCountedAt, s.dailyRevenueCounted]).toEqual(['2026-11-08', 350]);
        expect((await user()).lifetimePaid).toBe(850);
        const p = await proof();
        expect(p.uncredited).toBeUndefined();
        expect(p.review.decision).toBe('fine');
        expect(sent[sent.length - 1].m.title).toBe('Uncredit FAILED at userData (undone)');
        // a clean retry then works
        expect((await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW + 1000)).changed).toBe(true);
    });

    it('compensation: a proof-step failure also restores userData', async () => {
        const realUpdate = proofs.collection.updateOne.bind(proofs.collection);
        jest.spyOn(proofs.collection, 'updateOne').mockImplementation(async (filter: any, update: any, ...rest: any[]) => {
            if (update?.$set?.['uncredited.state'] === 'done') throw new Error('primary stepped down');
            return realUpdate(filter, update, ...rest);
        });
        const err = await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ failedAt: 'proof', compensated: true });
        const u = await user();
        expect([u.lifetimePaid, u.lifetimeCredits, u.fullShow]).toEqual([850, 4, 1]);
        expect((await proof()).uncredited).toBeUndefined();
    });

    it('compensation that fails too: journal stays failed (502 compensated:false); repeating Uncredit finishes forward without a second void', async () => {
        jest.spyOn(users.collection, 'updateOne').mockImplementationOnce(async () => { throw new Error('write conflict'); });
        pg.failUnvoid = 1;
        const err = await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ failedAt: 'userData', compensated: false });
        const p = await proof();
        expect(p.uncredited.state).toBe('failed');
        expect(p.uncredited.undo.pg).toMatchObject({ paymentId: '5060' });
        expect(p.uncredited.undo.stats2).toBeUndefined();
        const res = await service.uncredit(PROOF_ID, { reason: 'resent' }, NOW + 1000);
        expect(res.changed).toBe(true);
        expect(pg.count('payment_void')).toBe(1);
        expect((await user()).lifetimePaid).toBe(500);
        expect((await proof()).uncredited.state).toBe('done');
    });

    it('the voided payment was the highest and no show was delivered: tier drops to the remaining payments, balance loses A', async () => {
        await proofs.collection.deleteOne({ telegramMsgId: 170001 });
        await users.collection.updateOne({ chatId: CHAT, profile: PROFILE }, { $set: { payAmount: 500, lifetimePaid: 500, lifetimeCredits: 2, fullShow: 0, showsPaidTo: 1, callTime: 0 } });
        const res = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW);
        expect(res.userData.status).toBe('applied');
        const u = await user();
        expect([u.highestPayAmount, u.payAmount, u.lifetimePaid, u.lifetimeCredits, u.showsPaidTo, u.fullShow]).toEqual([150, 150, 150, 1, 0, 0]);
    });

    it('refuses: fake-marked chat (409), live show without force (409; force treats it as delivered), not credited (400), bad input (400), unknown proof (404)', async () => {
        await users.collection.updateOne({ chatId: CHAT, profile: 'kavya' }, { $set: { fakePaymentAt: new Date() } });
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toMatchObject({ response: { code: 'fake_marked' } });
        await users.collection.updateOne({ chatId: CHAT, profile: 'kavya' }, { $unset: { fakePaymentAt: '' } });

        await users.collection.updateOne({ chatId: CHAT, profile: PROFILE }, { $set: { callTime: 0, callProgress: { v1: { positionSec: 30, durationSec: 300, updatedAt: NOW - 60_000, completed: false } } } });
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toMatchObject({ response: { code: 'call_in_progress' } });
        expect(pg.calls).toHaveLength(0);
        expect((await proof()).uncredited).toBeUndefined();
        await service.uncredit(PROOF_ID, { reason: 'fake', force: true }, NOW);
        expect((await user()).fullShow).toBe(7);

        await expect(service.uncredit(`${CLIENT}-${CHAT}-170003`, { reason: 'fake' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.uncredit(PROOF_ID, { reason: 'other' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.uncredit(PROOF_ID, { reason: 'nope' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.uncredit('garbage', { reason: 'fake' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.uncredit(`${CLIENT}-${CHAT}-1`, { reason: 'fake' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Postgres: fake_marked there releases the claim (409); no row yet within an hour is pg_row_pending (409); later it proceeds unlinked', async () => {
        pg.voidRow = { status: 'fake_marked', payment_id: null, amount: null, day: null, payers_taken: false, payers_mobile: null };
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toBeInstanceOf(ConflictException);
        expect((await proof()).uncredited).toBeUndefined();

        pg.voidRow = { status: 'no_row', payment_id: null, amount: null, day: null, payers_taken: false, payers_mobile: null };
        const young = SERVED.getTime() + 10 * 60_000;
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, young)).rejects.toMatchObject({ response: { code: 'pg_row_pending' } });
        expect((await proof()).uncredited).toBeUndefined();

        const res = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW);
        expect(res.postgres).toMatchObject({ status: 'no_row', linked: false });
        expect(res.stats2).toBe('unchanged');
        expect((await user()).lifetimePaid).toBe(500);
        const back = await service.recredit(PROOF_ID, {}, NOW + 1000);
        expect(back.postgres).toEqual({ status: 'not_linked' });
        expect(pg.count('payment_unvoid')).toBe(0);
    });

    it('Postgres: two candidate rows (ambiguous) refuses with 409, claim released, nothing else written', async () => {
        pg.voidRow = { status: 'ambiguous', payment_id: null, amount: null, day: null, payers_taken: false, payers_mobile: null };
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toMatchObject({ response: { code: 'ambiguous_match' } });
        expect((await proof()).uncredited).toBeUndefined();
        expect((await proof()).review).toMatchObject({ decision: 'fine' });
        expect((await user()).lifetimePaid).toBe(850);
        expect((await stats()).dailyPaidCountedAt).toBe('2026-11-08');
        expect(pg.count('payment_unvoid')).toBe(0);
    });

    it('Postgres: already voided for this proof but no journal knows of it: 409, userData never taken twice', async () => {
        pg.voidRow = { status: 'already', payment_id: '5060', amount: 350, day: '2026-11-08', payers_taken: true, payers_mobile: '917814283401' };
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toMatchObject({ response: { code: 'already_voided' } });
        expect((await proof()).uncredited).toBeUndefined();
        expect((await user()).lifetimePaid).toBe(850);
        expect((await stats()).dailyPaidCountedAt).toBe('2026-11-08');
        expect(pg.count('payment_unvoid')).toBe(0);
    });

    it('Postgres failure on the void itself: nothing written anywhere, claim released, 502 compensated', async () => {
        pg.failVoid = true;
        const err = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ failedAt: 'postgres', compensated: true });
        expect((await proof()).uncredited).toBeUndefined();
        expect((await user()).lifetimePaid).toBe(850);
        expect((await stats()).dailyPaidCountedAt).toBe('2026-11-08');
    });

    it('Postgres not configured: 503 before any write', async () => {
        pg.enabled = false;
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect((await proof()).uncredited).toBeUndefined();
    });

    it('swept userData row: Postgres, stats2 and the proof are still done; userData missing; recredit skips it', async () => {
        await users.collection.deleteOne({ chatId: CHAT, profile: PROFILE });
        const res = await service.uncredit(PROOF_ID, { reason: 'fake' }, NOW);
        expect(res.userData.status).toBe('missing');
        expect(res.stats2).toBe('unset');
        const back = await service.recredit(PROOF_ID, {}, NOW + 1000);
        expect(back.userData).toEqual({ status: 'missing', restored: [], skipped: [] });
    });

    it('a running Uncredit (fresh pending journal) blocks a second one', async () => {
        await proofs.collection.updateOne({ telegramMsgId: MSG }, { $set: { uncredited: { state: 'pending', at: new Date(NOW - 1000), by: 'x', reason: 'fake', note: '', amount: 350, undo: {} } } });
        await expect(service.uncredit(PROOF_ID, { reason: 'fake' }, NOW)).rejects.toMatchObject({ response: { code: 'uncredit_in_progress' } });
        await expect(service.recredit(PROOF_ID, {}, NOW)).rejects.toMatchObject({ response: { code: 'uncredit_in_progress' } });
    });
});
