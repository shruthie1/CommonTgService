/**
 * PaymentProofsService: real Mongo (mongodb-memory-server) + real service. paymentProofs rows are inserted in the
 * shapes tg-aut writes (old rows without proofId/verdict, new rows with them); userData + clients are joined.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { PaymentProofSchema } from '../schemas/payment-proof.schema';
import { PaymentProofsService } from '../payment-proofs.service';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);

const ud = (chatId: string, profile: string, over: Record<string, unknown> = {}): any => ({
    chatId, profile, totalCount: 5, picCount: 0, lastMsgTimeStamp: NOW, limitTime: 0, paidCount: 0, prfCount: 0,
    canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0, ...over,
});

let seq = 0;
const proof = (over: Record<string, unknown>): any => ({
    _id: new Types.ObjectId(), chatId: '111', profile: 'ramya', clientId: 'ramya1', telegramMsgId: ++seq,
    decision: 'ACCEPT', reasons: [], mode: 'enforce', provider: 'tg-aut', source: 'local', createdAt: at(seq),
    shadow: { big: 'x' }, imageHash: 'f'.repeat(64), servedSha: 'a'.repeat(64), ...over,
});

describe('PaymentProofsService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let proofs: Model<any>;
    let userData: Model<UserDataDocument>;
    let service: PaymentProofsService;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'payment-proofs' }).asPromise();
        // tg-aut owns the collection and its TTL index; create them the way tg-aut does before CMS's model loads.
        await connection.collection('paymentProofs').createIndex({ createdAt: 1 }, { name: 'createdAt_ttl', expireAfterSeconds: 604_800 });
        proofs = connection.model('PaymentProofSvc', PaymentProofSchema, 'paymentProofs');
        userData = connection.model<UserDataDocument>('UserDataPaymentProofs', UserDataSchema, 'userData');
        await proofs.init();
        await userData.init();
    }, 120_000);
    afterAll(async () => { await connection.close(); await mongod.stop(); });

    beforeEach(async () => {
        seq = 0;
        await proofs.deleteMany({});
        await userData.deleteMany({});
        await connection.collection('clients').deleteMany({});
        service = new PaymentProofsService(proofs as any, userData as any);
        await connection.collection('clients').insertMany([
            { clientId: 'ramya1', repl: 'https://ramya1.paidgirls.site' },
            { clientId: 'kavya1', repl: 'https://kavya1.paidgirls.site' },
        ]);
        await userData.create([
            ud('111', 'ramya', { username: 'u111', cheatCount: 2 }),
            ud('222', 'ramya', { username: 'u222', cheatCount: 0, fakePaymentAt: new Date(NOW - 3600_000) }),
            ud('222', 'kavya', { fakePaymentAt: new Date(NOW - 3600_000) }),
        ]);
    });

    it('creates no index and keeps the tg-aut TTL index unchanged', async () => {
        const idx = await connection.collection('paymentProofs').indexes();
        expect(idx.map((i) => i.name).sort()).toEqual(['_id_', 'createdAt_ttl']);
        expect(idx.find((i) => i.name === 'createdAt_ttl')?.expireAfterSeconds).toBe(604_800);
        expect(PaymentProofSchema.indexes()).toEqual([]);
    });

    async function seed() {
        await proofs.collection.insertMany([
            // old shapes (no proofId / verdict)
            // chat 111 sent a fake (msg 3), so its credited proofs (1, 2, 8) carry a strong signal
            proof({ servedAt: at(1), creditAmount: 20, amount: 20 }), // credited, strong: review
            proof({ servedAt: at(2), creditAmount: 350, amount: 350 }), // credited, strong: review
            proof({ ask: { kind: 'fraud', state: 'open', openedAt: at(3) } }), // fraud_ask: flagged only, not review
            proof({ ask: { kind: 'fraud', state: 'open', blockedAt: at(4) }, chatId: '222' }), // fake_blocked, marked
            proof({ amount: 50 }), // other (uncredited): not review
            // new shapes
            proof({ proofId: 'ramya1-111-6', telegramMsgId: 6, verdict: { outcome: 'not_ours', reasons: ['UPI_NOT_OURS'], payee: 'foreign', fakeScore: null, fakeSignals: [] }, amount: 100, payeeName: 'X STORES', image: { host: 'ramya1', bytes: 1234, mime: 'image/jpeg', stored: true }, ocr: { app: 'phonepe', note: 'hi' } }),
            proof({ proofId: 'kavya1-333-7', telegramMsgId: 7, clientId: 'kavya1', profile: 'kavya', chatId: '333', servedAt: at(7), creditAmount: 20, verdict: { outcome: 'credited', reasons: [], fakeScore: 55 } }),
            proof({ proofId: 'ramya1-111-8', telegramMsgId: 8, servedAt: at(8), creditAmount: 100, verdict: { outcome: 'credited', reasons: [] }, review: { state: 'ok', by: 'ops', at: at(1) } }),
            // outside the default 7-day window
            proof({ createdAt: new Date(NOW - 8 * 86400_000) }),
        ]);
    }

    it('counts every state over the window; review = credited proofs at risk, riskiest ₹ first', async () => {
        await seed();
        const res = await service.list({}, NOW);
        expect(res.counts).toEqual({ review: 3, reviewAmount: 390, flagged: 2, not_credited: 4, credited: 4, marked: 1, reviewed: 1, all: 8 });
        // risk x ₹: 2 (85 x 350), 1 (85 x 20), 7 (70 x 20: fakeScore 55)
        expect(res.items.map((i) => i.telegramMsgId)).toEqual([2, 1, 7]);
        expect(res.items.map((i) => i.risk)).toEqual([85, 85, 70]);
        expect(res.items[0]).toMatchObject({ inReview: true, strong: true, atRiskAmount: 350, repeat: false });
        expect(res.items[0].riskReasons).toContain('Chat sent a fake receipt');
        expect(res.reviewModel.options).toEqual({ dailyTarget: 20, riskFloor: 25, minAmount: 100, alwaysAmount: 200 });
        expect((await service.list({ sort: 'time' }, NOW)).items.map((i) => i.telegramMsgId)).toEqual([1, 2, 7]);
        expect(res.nextCursor).toBeNull();
        expect(res.truncated).toBe(false);
    });

    it('joins userData (persona, username, complaintScore, fakePaymentAt) and clients.repl; hides bulky fields', async () => {
        await seed();
        const { items } = await service.list({ state: 'all' }, NOW);
        const byMsg = new Map(items.map((i) => [i.telegramMsgId, i]));
        expect(byMsg.get(3)).toMatchObject({
            proofId: 'ramya1-111-3', outcome: 'fraud_ask', legacy: true, persona: 'ramya', username: 'u111', complaintScore: 2,
            fakePaymentAt: null, clientHost: 'https://ramya1.paidgirls.site', inReview: false, flagged: true, atRiskAmount: 0,
        });
        expect(byMsg.get(4)).toMatchObject({ outcome: 'fake_blocked', username: 'u222', fakePaymentAt: new Date(NOW - 3600_000) });
        // kavya/333 has no userData row: persona falls back to the proof's profile
        expect(byMsg.get(7)).toMatchObject({ proofId: 'kavya1-333-7', outcome: 'credited', legacy: false, fakeScore: 55, persona: 'kavya', username: null, complaintScore: null, clientHost: 'https://kavya1.paidgirls.site' });
        // page items carry the full row (not just the slim classification fields)
        expect(byMsg.get(6)).toMatchObject({ payeeName: 'X STORES', image: { host: 'ramya1', bytes: 1234 }, ocr: { app: 'phonepe', note: 'hi' }, verdict: { payee: 'foreign' }, mode: 'enforce' });
        for (const i of items) {
            expect(i).not.toHaveProperty('shadow');
            expect(i).not.toHaveProperty('imageHash');
            expect(i).not.toHaveProperty('servedSha');
            expect(typeof i._id).toBe('string');
        }
    });

    it.each([
        ['flagged', [3, 4]],
        ['not_credited', [3, 4, 5, 6]],
        ['credited', [1, 2, 7, 8]],
        ['marked', [4]],
        ['reviewed', [8]],
    ])('state=%s', async (state, msgs) => {
        await seed();
        const { items } = await service.list({ state }, NOW);
        expect(items.map((i) => i.telegramMsgId)).toEqual(msgs);
    });

    it('filters by client, since and minAmount (counts follow the filters)', async () => {
        await seed();
        const k = await service.list({ client: 'kavya1', state: 'all' }, NOW);
        expect(k.items.map((i) => i.telegramMsgId)).toEqual([7]);
        expect(k.counts.all).toBe(1);
        const ch = await service.list({ chat: '333', state: 'all' }, NOW);
        expect(ch.items.map((i) => i.chatId)).toEqual(['333']);
        expect(ch.counts.all).toBe(1);
        const s = await service.list({ since: at(4.5).toISOString(), state: 'all' }, NOW);
        expect(s.items.map((i) => i.telegramMsgId)).toEqual([1, 2, 3, 4]);
        const m = await service.list({ minAmount: '100', state: 'all' }, NOW);
        expect(m.items.map((i) => i.telegramMsgId)).toEqual([2, 6, 8]);
        expect(m.counts).toMatchObject({ all: 3, credited: 2, review: 1, reviewAmount: 350 });
        // the review model sees the whole collection: msg 1 stays strong although its chat's fake (msg 3) is filtered out
        const recent = await service.list({ since: at(1.5).toISOString() }, NOW);
        expect(recent.items.map((i) => i.telegramMsgId)).toEqual([1]);
        expect((await service.list({ client: 'kavya1' }, NOW)).counts).toMatchObject({ review: 1, reviewAmount: 20 });
        const old = await service.list({ since: new Date(NOW - 9 * 86400_000).toISOString(), state: 'all' }, NOW);
        expect(old.counts.all).toBe(9);
    });

    it('pages with an opaque cursor without gaps or repeats, including equal createdAt', async () => {
        const same = at(30);
        await proofs.collection.insertMany(Array.from({ length: 7 }, (_, i) => proof({ createdAt: i < 4 ? same : at(40 + i) })));
        const seen: number[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const r = await service.list({ state: 'all', limit: 3, cursor }, NOW);
            seen.push(...r.items.map((i) => i.telegramMsgId));
            expect(r.counts.all).toBe(7);
            cursor = r.nextCursor ?? undefined;
            pages++;
        } while (cursor && pages < 10);
        expect(pages).toBe(3);
        expect(new Set(seen).size).toBe(7);
        expect(seen.length).toBe(7);
    });

    it('repeats / re-sends never enter review; risk-order paging has no gaps or repeats', async () => {
        const sha = 'b'.repeat(64);
        await proofs.collection.insertMany([
            proof({ chatId: '444', servedAt: at(50), creditAmount: 50, amount: 50, imageSha256: sha, createdAt: at(50) }),
            proof({ chatId: '444', amount: 50, imageSha256: sha, createdAt: at(49) }), // legacy re-send of the credited image
            proof({ chatId: '444', decision: 'REJECT_DUPLICATE', amount: 50, createdAt: at(48) }),
            ...Array.from({ length: 5 }, (_, i) => proof({ chatId: `5${i}`, servedAt: at(60), creditAmount: 50 + i, amount: 50 + i, reasons: ['FAKE_TEXT'] })),
        ]);
        const all = await service.list({ state: 'all' }, NOW);
        const resend = all.items.filter((i) => i.chatId === '444' && !i.servedAt);
        expect(resend.map((i) => [i.repeat, i.inReview])).toEqual([[true, false], [true, false]]);
        const seen: number[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const r = await service.list({ limit: 2, cursor }, NOW);
            seen.push(...r.items.map((i) => i.atRiskAmount));
            expect(r.counts.review).toBe(5);
            cursor = r.nextCursor ?? undefined;
            pages++;
        } while (cursor && pages < 10);
        expect(seen).toEqual([54, 53, 52, 51, 50]);
        // a cursor of one sort is refused by the other
        const first = await service.list({ limit: 2 }, NOW);
        await expect(service.list({ limit: 2, sort: 'time', cursor: first.nextCursor! }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reused UTR: the earliest proof is the original (not in review), the later edited copy is; reusedFrom on the item', async () => {
        await proofs.collection.insertMany([
            proof({ chatId: '555', servedAt: at(10), creditAmount: 50, amount: 50, utr: '123456789012', createdAt: at(10) }),
            proof({ chatId: '555', servedAt: at(5), creditAmount: 350, amount: 350, utr: '1234 5678 9012', createdAt: at(5) }),
        ]);
        const r = await service.list({ state: 'all', chat: '555' }, NOW);
        const [copy, orig] = r.items; // newest first
        expect(orig).toMatchObject({ amount: 50, inReview: false, strong: false, reusedFrom: null });
        expect(copy).toMatchObject({ amount: 350, inReview: true, strong: true });
        expect(copy.riskReasons).toContain('Reused UTR of an earlier receipt (₹50 before)');
        expect(copy.reusedFrom).toMatchObject({ proofId: orig.proofId, chatId: '555', amount: 50 });
    });

    it('caps limit at 100 and rejects bad params', async () => {
        await proofs.collection.insertMany(Array.from({ length: 105 }, () => proof({})));
        expect((await service.list({ state: 'all', limit: '500' }, NOW)).items).toHaveLength(100);
        for (const q of [{ state: 'nope' }, { since: 'yesterday' }, { limit: '0' }, { limit: '2.5' }, { minAmount: '-1' }, { cursor: 'zzz' }, { client: 'a b' }, { chat: '12ab' }, { sort: 'amount' }]) {
            await expect(service.list(q as any, NOW)).rejects.toBeInstanceOf(BadRequestException);
        }
    });

    it('review ok / clear on an old row (no proofId) and a new row; removes it from the review count', async () => {
        await seed();
        const before = await service.list({}, NOW);
        const now = new Date(NOW);
        const r = await service.review('ramya1-111-2', { state: 'ok', by: ' ops ' }, now);
        expect(r).toEqual({ proofId: 'ramya1-111-2', review: { state: 'ok', by: 'ops', at: now } });
        const row = await proofs.collection.findOne({ telegramMsgId: 2 });
        expect(row?.review).toEqual({ state: 'ok', by: 'ops', at: now });
        expect(row?.proofId).toBeUndefined(); // CMS never adds tg-aut fields
        const after = await service.list({}, NOW);
        expect(after.counts.review).toBe(before.counts.review - 1);
        expect(after.counts.reviewed).toBe(before.counts.reviewed + 1);

        await service.review('ramya1-111-6', { state: 'ok', by: 'ops' }, now);
        expect((await proofs.collection.findOne({ proofId: 'ramya1-111-6' }))?.review?.state).toBe('ok');

        expect(await service.review('ramya1-111-2', { state: 'clear' })).toEqual({ proofId: 'ramya1-111-2', review: null });
        expect((await proofs.collection.findOne({ telegramMsgId: 2 }))).not.toHaveProperty('review');
        // idempotent clear
        await expect(service.review('ramya1-111-2', { state: 'clear' })).resolves.toEqual({ proofId: 'ramya1-111-2', review: null });
        // msg 2 is back in review after the clear; msg 6 (not_ours, reviewed ok) was never in it
        expect((await service.list({}, NOW)).counts.review).toBe(before.counts.review);
    });

    it('review rejects bad input and 404s a missing proof', async () => {
        await seed();
        await expect(service.review('bad', { state: 'ok', by: 'ops' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.review('ramya1-111-3', { state: 'maybe', by: 'ops' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.review('ramya1-111-3', { state: 'ok' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.review('ramya1-111-999', { state: 'ok', by: 'ops' })).rejects.toBeInstanceOf(NotFoundException);
        // client must match too
        await expect(service.review('kavya1-111-3', { state: 'ok', by: 'ops' })).rejects.toBeInstanceOf(NotFoundException);
    });
});
