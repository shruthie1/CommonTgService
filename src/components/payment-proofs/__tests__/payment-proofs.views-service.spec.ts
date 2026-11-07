/**
 * PaymentProofsService views + chat actions (redesign 2026-11-07) over real Mongo (mongodb-memory-server):
 * GET ?view=check|muted|refused, POST chat/:chatId/review, closeFraudAsks; the cached window follows every write.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        // 400 (canReply 0) is in muted only; 900 (marked, no proof left) is hidden: nothing to stamp.
        expect(r.counts).toEqual({ check: 1, muted: 1, refused: 1 });
        const e = (r.entries as any[]).find((x) => x.chatId === '100');
        expect(e).toMatchObject({ username: 'payer100', totalCredited: 600, highValue: true, fakeSignal: false });
        expect(e.history).toHaveLength(2);
        expect(e.history[0].clientHost).toBe('https://ramya1.example');
        expect((r.entries as any[]).map((x) => x.chatId)).toEqual(['100']);
        expect(e.stamp).toBeNull();
    });

    it('view=muted: fraud block and (includeReviewed only) a marked chat outside the window', async () => {
        expect((await service.views({ view: 'muted' }, NOW)).entries.map((e: any) => e.chatId)).toEqual(['400']);
        const r = await service.views({ view: 'muted', includeReviewed: '1' }, NOW);
        expect(r.counts.muted).toBe(1);
        const by = new Map((r.entries as any[]).map((x) => [x.chatId, x]));
        expect(by.get('400')).toMatchObject({ source: 'fraud_block', reasonCodes: ['PERSONA_PAYEE'] });
        expect(by.get('400').evidence[0].clientHost).toBe('https://ramya1.example');
        expect(by.get('900')).toMatchObject({ source: 'operator_mark', preMarkCanReply: 1, creditedAmount: 0 });
    });

    it('name = userData.username when the person has no Telegram handle (it is then a first name), else null', async () => {
        await connection.collection('userIdentity').deleteMany({});
        expect((await service.views({ view: 'check' }, NOW)).entries[0]).toMatchObject({ chatId: '100', username: 'payer100', name: null }); // no identity row
        await connection.collection('userIdentity').insertOne({ chatId: '100', displayNames: ['payer100'] });
        const noHandle = new PaymentProofsService(proofs as any, userData as any);
        expect((await noHandle.views({ view: 'check' }, NOW)).entries[0]).toMatchObject({ name: 'payer100' });
        await connection.collection('userIdentity').updateOne({ chatId: '100' }, { $set: { handle: 'payer100' } });
        const withHandle = new PaymentProofsService(proofs as any, userData as any);
        expect((await withHandle.views({ view: 'check' }, NOW)).entries[0]).toMatchObject({ name: null });
        await connection.collection('userIdentity').deleteMany({});
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
        expect((await service.views({ view: 'check' }, NOW)).entries).toEqual([]);
        expect((await service.reviewChat('100', { by: 'ops' })).reviewed).toEqual([]);
        const rows = await proofs.collection.find({ chatId: '100' }).toArray();
        expect(rows.every((x) => x.review?.decision === 'fine' && !('by' in x.review))).toBe(true);
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

    describe('stamp (POST chat/:chatId/actions)', () => {
        const ids100 = ['ramya1-100-1', 'ramya1-100-2'];

        it('stamps exactly the given proofs; hidden by default, shown with its stamp by includeReviewed; counts exclude it', async () => {
            await service.views({ view: 'check' }, NOW); // fill the cache
            const stampAt = new Date(NOW);
            expect(await service.stampChat('100', { decision: 'fine', proofIds: ids100 }, stampAt)).toEqual({ chatId: '100', decision: 'fine', stamped: 2 });
            const rows = await proofs.collection.find({ chatId: '100' }).toArray();
            expect(rows.map((x) => x.review)).toEqual([{ decision: 'fine', at: stampAt }, { decision: 'fine', at: stampAt }]);
            const hidden = await service.views({ view: 'check' }, NOW);
            expect(hidden.entries).toEqual([]);
            expect(hidden.counts.check).toBe(0);
            const all = await service.views({ view: 'check', includeReviewed: '1' }, NOW);
            expect((all.entries as any[]).map((e) => [e.chatId, e.stamp])).toEqual([['100', { decision: 'fine', at: stampAt.toISOString() }]]);
            expect(all.counts.check).toBe(0);
        });

        it('a proof that arrived after the card loaded stays unreviewed and brings the chat back', async () => {
            const late = credited('100', 300);
            await proofs.collection.insertOne(late);
            await service.stampChat('100', { decision: 'fine', proofIds: ids100 }, new Date(NOW));
            expect((await proofs.collection.findOne({ _id: late._id }))?.review).toBeUndefined();
            const r = await service.views({ view: 'check' }, NOW);
            expect((r.entries as any[]).map((e) => [e.chatId, e.stamp])).toEqual([['100', null]]);
        });

        it('a fraud block after the stamp brings the chat back', async () => {
            await service.stampChat('100', { decision: 'fine', proofIds: ids100 }, new Date(NOW - 60 * 60_000));
            await proofs.collection.updateOne({ proofId: 'ramya1-100-2' }, { $set: { ask: { kind: 'fraud', state: 'open', blockedAt: new Date(NOW - 45 * 60_000) } } });
            const fresh = new PaymentProofsService(proofs as any, userData as any);
            expect((await fresh.views({ view: 'check' }, NOW)).entries.map((e: any) => e.chatId)).toEqual(['100']);
        });

        it('rejects a bad decision, ids of another chat, empty or over 200 ids; 404 when no proof matches', async () => {
            await expect(service.stampChat('100', { decision: 'past', proofIds: ids100 })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.stampChat('100', { decision: 'ok', proofIds: ids100 })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.stampChat('100', { decision: 'fine', proofIds: ['ramya1-200-3'] })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.stampChat('100', { decision: 'fine', proofIds: [] })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.stampChat('100', { decision: 'fine', proofIds: Array.from({ length: 201 }, (_, i) => `ramya1-100-${i + 1}`) })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.stampChat('100', { decision: 'fine', proofIds: ['ramya1-100-99'] })).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
