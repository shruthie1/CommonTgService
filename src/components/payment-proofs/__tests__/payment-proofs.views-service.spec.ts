/**
 * PaymentProofsService views + chat actions (redesign 2026-11-07) over real Mongo (mongodb-memory-server):
 * GET ?view=check|muted|refused, POST chat/:chatId/review, closeFraudAsks; the cached window follows every write.
 */
import { BadRequestException } from '@nestjs/common';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { PaymentProofSchema } from '../schemas/payment-proof.schema';
import { PaymentProofsService } from '../payment-proofs.service';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);
const ud = (chatId: string, profile: string, over: Record<string, unknown> = {}): any => ({
    chatId, profile, totalCount: 5, picCount: 0, lastMsgTimeStamp: NOW, limitTime: 0, paidCount: 0, prfCount: 0,
    canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0, ...over,
});
let seq = 0;
const proof = (chatId: string, over: Record<string, unknown> = {}): any => {
    seq++;
    return {
        _id: new Types.ObjectId(), chatId, profile: 'ramya', clientId: 'ramya1', telegramMsgId: seq, proofId: `ramya1-${chatId}-${seq}`,
        createdAt: at(600 - seq), time: { state: 'known', epochMs: at(602 - seq).getTime() }, imageSha256: `sha${seq}`, utr: `UTR00${seq}0000`,
        image: { host: 'ramya1', stored: true }, ...over,
    };
};
const credited = (chatId: string, amount: number, over: Record<string, unknown> = {}) =>
    proof(chatId, { servedAt: at(1), creditAmount: amount, amount, verdict: { outcome: 'credited', reasons: [], payee: 'ours', fakeScore: 0, fakeSignals: [] }, ...over });

describe('PaymentProofsService views', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let proofs: Model<any>;
    let userData: Model<UserDataDocument>;
    let service: PaymentProofsService;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'payment-proofs-views' }).asPromise();
        proofs = connection.model('PaymentProofViews', PaymentProofSchema, 'paymentProofs');
        userData = connection.model<UserDataDocument>('UserDataViews', UserDataSchema, 'userData');
        await userData.init();
    }, 120_000);
    afterAll(async () => { await connection.close(); await mongod.stop(); });
    beforeEach(async () => {
        seq = 0;
        await proofs.collection.deleteMany({});
        await userData.deleteMany({});
        await connection.collection('clients').deleteMany({});
        await connection.collection('clients').insertOne({ clientId: 'ramya1', repl: 'https://ramya1.example' });
        service = new PaymentProofsService(proofs as any, userData as any);
        await proofs.collection.insertMany([
            credited('100', 300), credited('100', 300), // repeated equal high credits
            credited('200', 50),
            proof('300', { amount: 100, verdict: { outcome: 'fraud_ask', reasons: ['NO_REAL_REFERENCE'], payee: 'ours', fakeScore: 0 } }),
            credited('400', 150), proof('400', { amount: 100, verdict: { outcome: 'fake_blocked', reasons: ['PERSONA_PAYEE'], payee: 'persona' }, ask: { kind: 'fraud', state: 'open', reasons: ['PERSONA_PAYEE'], blockedAt: at(30) } }),
        ]);
        await userData.collection.insertMany([
            ud('100', 'ramya', { clientId: 'ramya1', username: 'payer100' }),
            ud('400', 'ramya', { canReply: 0 }),
            // marked long ago: no proof left in the window, still in the muted view
            ud('900', 'ramya', { canReply: 0, fakePaymentAt: at(20_000), fakePaymentBy: 'tg-chats', fakePaymentReason: 'marked fake from tg-chats', fakePaymentPrev: { payAmount: 200, canReply: 1 } }),
        ]);
    });

    it('view=check: one entry per chat with history and clientHost on every card', async () => {
        const r = await service.views({ view: 'check' }, NOW);
        expect(r.view).toBe('check');
        expect(r.counts).toEqual({ check: 2, muted: 2, refused: 1 });
        const e = (r.entries as any[]).find((x) => x.chatId === '100');
        expect(e).toMatchObject({ username: 'payer100', totalCredited: 600, highValue: true, fakeSignal: false });
        expect(e.history).toHaveLength(2);
        expect(e.history[0].clientHost).toBe('https://ramya1.example');
        expect((r.entries as any[]).map((x) => x.chatId)).toEqual(['400', '100']); // fake signal (sibling PERSONA_PAYEE) first
    });

    it('view=muted: fraud block and a marked chat outside the window', async () => {
        const r = await service.views({ view: 'muted' }, NOW);
        const by = new Map((r.entries as any[]).map((x) => [x.chatId, x]));
        expect(by.get('400')).toMatchObject({ source: 'fraud_block', reasonCodes: ['PERSONA_PAYEE'] });
        expect(by.get('400').evidence[0].clientHost).toBe('https://ramya1.example');
        expect(by.get('900')).toMatchObject({ source: 'operator_mark', preMarkCanReply: 1, creditedAmount: 0 });
    });

    it('view=refused and the client filter', async () => {
        const r = await service.views({ view: 'refused' }, NOW);
        expect((r.entries as any[]).map((x) => x.chatId)).toEqual(['300']);
        expect((await service.views({ view: 'refused', client: 'other1' }, NOW)).entries).toEqual([]);
    });

    it('rejects an unknown view or client', async () => {
        await expect(service.views({ view: 'x' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.views({ view: 'check', client: 'a b' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reviewChat marks the chat\'s credited unreviewed proofs, drops it from check (cache patched), idempotent', async () => {
        await service.views({ view: 'check' }, NOW); // fill the cache
        const res = await service.reviewChat('100', { by: 'ops' });
        expect([...res.reviewed].sort()).toEqual(['ramya1-100-1', 'ramya1-100-2']);
        expect((await service.views({ view: 'check' }, NOW)).entries.map((e: any) => e.chatId)).toEqual(['400']);
        expect((await service.reviewChat('100', { by: 'ops' })).reviewed).toEqual([]);
        const rows = await proofs.collection.find({ chatId: '100' }).toArray();
        expect(rows.every((x) => x.review?.state === 'ok' && x.review.by === 'ops')).toBe(true);
    });

    it('reviewChat with proofIds marks only those; rejects ids of another chat and a missing by', async () => {
        expect((await service.reviewChat('100', { by: 'ops', proofIds: ['ramya1-100-1'] })).reviewed).toEqual(['ramya1-100-1']);
        await expect(service.reviewChat('100', { by: 'ops', proofIds: ['ramya1-200-3'] })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.reviewChat('100', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('closeFraudAsks resolves the open fraud asks of the chat; the muted view then shows source unknown', async () => {
        await service.views({ view: 'muted' }, NOW);
        const res = await service.closeFraudAsks('400', 'ops', new Date(NOW));
        expect(res).toEqual({ proofIds: ['ramya1-400-6'], blocked: 1 });
        const r = await service.views({ view: 'muted' }, NOW);
        expect((r.entries as any[]).find((x) => x.chatId === '400').source).toBe('unknown');
        expect(await service.closeFraudAsks('400', 'ops')).toEqual({ proofIds: [], blocked: 0 });
    });
});
