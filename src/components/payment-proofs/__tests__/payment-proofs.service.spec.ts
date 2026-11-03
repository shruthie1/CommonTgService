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
            proof({ servedAt: at(1), creditAmount: 20, amount: 20 }), // credited < 300: not review
            proof({ servedAt: at(2), creditAmount: 350, amount: 350 }), // credited >= 300: review
            proof({ ask: { kind: 'fraud', state: 'open', openedAt: at(3) } }), // fraud_ask: review + flagged
            proof({ ask: { kind: 'fraud', state: 'open', blockedAt: at(4) }, chatId: '222' }), // fake_blocked, marked
            proof({ amount: 50 }), // other: review
            // new shapes
            proof({ proofId: 'ramya1-111-6', telegramMsgId: 6, verdict: { outcome: 'not_ours', reasons: ['UPI_NOT_OURS'], payee: 'foreign', fakeScore: null, fakeSignals: [] }, amount: 100, payeeName: 'X STORES', image: { host: 'ramya1', bytes: 1234, mime: 'image/jpeg', stored: true }, ocr: { app: 'phonepe', note: 'hi' } }),
            proof({ proofId: 'kavya1-333-7', telegramMsgId: 7, clientId: 'kavya1', profile: 'kavya', chatId: '333', servedAt: at(7), creditAmount: 20, verdict: { outcome: 'credited', reasons: [], fakeScore: 55 } }),
            proof({ proofId: 'ramya1-111-8', telegramMsgId: 8, servedAt: at(8), creditAmount: 100, verdict: { outcome: 'credited', reasons: [] }, review: { state: 'ok', by: 'ops', at: at(1) } }),
            // outside the default 7-day window
            proof({ createdAt: new Date(NOW - 8 * 86400_000) }),
        ]);
    }

    it('counts every state over the window and lists the review queue newest first', async () => {
        await seed();
        const res = await service.list({}, NOW);
        expect(res.counts).toEqual({ review: 6, flagged: 2, not_credited: 4, credited: 4, marked: 1, reviewed: 1, all: 8 });
        expect(res.items.map((i) => i.telegramMsgId)).toEqual([2, 3, 4, 5, 6, 7]);
        expect(res.nextCursor).toBeNull();
        expect(res.truncated).toBe(false);
    });

    it('joins userData (persona, username, complaintScore, fakePaymentAt) and clients.repl; hides bulky fields', async () => {
        await seed();
        const { items } = await service.list({ state: 'all' }, NOW);
        const byMsg = new Map(items.map((i) => [i.telegramMsgId, i]));
        expect(byMsg.get(3)).toMatchObject({
            proofId: 'ramya1-111-3', outcome: 'fraud_ask', legacy: true, persona: 'ramya', username: 'u111', complaintScore: 2,
            fakePaymentAt: null, clientHost: 'https://ramya1.paidgirls.site', inReview: true, flagged: true,
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
        const s = await service.list({ since: at(4.5).toISOString(), state: 'all' }, NOW);
        expect(s.items.map((i) => i.telegramMsgId)).toEqual([1, 2, 3, 4]);
        const m = await service.list({ minAmount: '100', state: 'all' }, NOW);
        expect(m.items.map((i) => i.telegramMsgId)).toEqual([2, 6, 8]);
        expect(m.counts).toMatchObject({ all: 3, credited: 2, review: 2 });
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

    it('caps limit at 100 and rejects bad params', async () => {
        await proofs.collection.insertMany(Array.from({ length: 105 }, () => proof({})));
        expect((await service.list({ state: 'all', limit: '500' }, NOW)).items).toHaveLength(100);
        for (const q of [{ state: 'nope' }, { since: 'yesterday' }, { limit: '0' }, { limit: '2.5' }, { minAmount: '-1' }, { cursor: 'zzz' }, { client: 'a b' }]) {
            await expect(service.list(q as any, NOW)).rejects.toBeInstanceOf(BadRequestException);
        }
    });

    it('review ok / clear on an old row (no proofId) and a new row; removes it from the review count', async () => {
        await seed();
        const before = await service.list({}, NOW);
        const now = new Date(NOW);
        const r = await service.review('ramya1-111-3', { state: 'ok', by: ' ops ' }, now);
        expect(r).toEqual({ proofId: 'ramya1-111-3', review: { state: 'ok', by: 'ops', at: now } });
        const row = await proofs.collection.findOne({ telegramMsgId: 3 });
        expect(row?.review).toEqual({ state: 'ok', by: 'ops', at: now });
        expect(row?.proofId).toBeUndefined(); // CMS never adds tg-aut fields
        const after = await service.list({}, NOW);
        expect(after.counts.review).toBe(before.counts.review - 1);
        expect(after.counts.reviewed).toBe(before.counts.reviewed + 1);

        await service.review('ramya1-111-6', { state: 'ok', by: 'ops' }, now);
        expect((await proofs.collection.findOne({ proofId: 'ramya1-111-6' }))?.review?.state).toBe('ok');

        expect(await service.review('ramya1-111-3', { state: 'clear' })).toEqual({ proofId: 'ramya1-111-3', review: null });
        expect((await proofs.collection.findOne({ telegramMsgId: 3 }))).not.toHaveProperty('review');
        // idempotent clear
        await expect(service.review('ramya1-111-3', { state: 'clear' })).resolves.toEqual({ proofId: 'ramya1-111-3', review: null });
        expect((await service.list({}, NOW)).counts.review).toBe(before.counts.review - 1);
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
