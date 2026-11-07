/**
 * Payments review redesign phase 1 (owner approved 2026-11-07): Mark fake records who / why / which proofs and an audit
 * history; "Not fake" undoes an operator mark (history kept) or a payment-check fraud block / unknown mute (canReply 1,
 * limitTime 0, open fraud asks closed). cheatCount is never written. Real Mongo (mongodb-memory-server) for userData and
 * paymentProofs; Postgres is a recording fake.
 */
import { BadRequestException } from '@nestjs/common';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../../user-data/schemas/user-data.schema';
import { PaymentProofSchema } from '../../payment-proofs/schemas/payment-proof.schema';
import { PaymentProofsService } from '../../payment-proofs/payment-proofs.service';
import { FakePaymentService } from '../fake-payment.service';

jest.mock('../../../utils', () => ({ ...jest.requireActual('../../../utils'), getBotsServiceInstance: jest.fn(() => null) }));

const CHAT = '1118622422';
const row = (chatId: string, profile: string, over: Record<string, unknown> = {}): any => ({
    chatId, profile, totalCount: 5, picCount: 0, lastMsgTimeStamp: Date.now(), limitTime: 0, paidCount: 0, prfCount: 0,
    canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0, ...over,
});

class FakePg {
    calls: string[] = [];
    async query(sql: string) {
        this.calls.push(sql);
        if (sql.includes('fake_payment_mark')) return [{ marked_now: 1, payments: 1, amount_marked: 300, payer_days: 1, payer_days_skipped: 0 }];
        if (sql.includes('fake_payment_unmark')) return [{ unmarked_now: 1, amount_restored: 300, payer_days: 1 }];
        return [];
    }
}

describe('FakePaymentService: mark details, history and Not fake', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let userData: Model<UserDataDocument>;
    let proofs: Model<any>;
    let pg: FakePg;
    let service: FakePaymentService;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'fake-payment-not-fake' }).asPromise();
        userData = connection.model<UserDataDocument>('UserDataNotFake', UserDataSchema, 'userData');
        proofs = connection.model('PaymentProofNotFake', PaymentProofSchema, 'paymentProofs');
        await userData.init();
    }, 120_000);
    afterAll(async () => { await connection.dropDatabase(); await connection.close(); await mongod.stop(); });
    beforeEach(async () => {
        await userData.deleteMany({});
        await proofs.collection.deleteMany({});
        pg = new FakePg();
        service = new FakePaymentService(userData as any, pg as any, new PaymentProofsService(proofs as any, userData as any));
    });

    const raw = (profile: string, chatId = CHAT) => userData.collection.findOne({ chatId, profile }) as Promise<any>;
    const proof = (n: number, over: Record<string, unknown> = {}) => ({
        _id: new Types.ObjectId(), chatId: CHAT, profile: 'ramya', clientId: 'ramya1', telegramMsgId: n, proofId: `ramya1-${CHAT}-${n}`,
        createdAt: new Date(), ...over,
    });

    describe('mark', () => {
        beforeEach(async () => {
            await userData.create([row(CHAT, 'ramya', { clientId: 'ramya1', payAmount: 300, canReply: 1, cheatCount: 3 }), row(CHAT, 'kavya', { canReply: 1 })]);
        });

        it('stores by, reason and proofIds, and appends a mark entry to the history on every row', async () => {
            await service.mark(CHAT, { by: 'sai', reason: 'edited', proofIds: [`ramya1-${CHAT}-7`] });
            const r = await raw('ramya');
            expect(r).toMatchObject({ fakePaymentBy: 'sai', fakePaymentReason: 'edited', fakePaymentProofIds: [`ramya1-${CHAT}-7`], cheatCount: 3 });
            expect(r.fakePaymentHistory).toEqual([expect.objectContaining({ action: 'mark', by: 'sai', reason: 'edited', proofIds: [`ramya1-${CHAT}-7`] })]);
            expect((await raw('kavya')).fakePaymentHistory).toHaveLength(1);
        });

        it("falls back to 'tg-chats' when by is missing; a repeat mark adds no history", async () => {
            await service.mark(CHAT, { reason: 'template' });
            await service.mark(CHAT, { by: 'x', reason: 'again' });
            const r = await raw('ramya');
            expect(r.fakePaymentBy).toBe('tg-chats');
            expect(r.fakePaymentHistory).toHaveLength(1);
        });

        it('rejects proofIds that are not proof ids of this chat', async () => {
            await expect(service.mark(CHAT, { by: 'a', reason: 'r', proofIds: ['ramya1-999-1'] })).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.mark(CHAT, { by: 'a', reason: 'r', proofIds: 'x' as any })).rejects.toBeInstanceOf(BadRequestException);
            expect((await raw('ramya')).fakePaymentAt).toBeUndefined();
        });
    });

    describe('notFake on an operator mark', () => {
        it('restores like unmark, keeps the history (mark + unmark), cheatCount untouched, Postgres unmarked; idempotent', async () => {
            await userData.create([row(CHAT, 'ramya', { payAmount: 300, highestPayAmount: 300, canReply: 1, cheatCount: 2 })]);
            await service.mark(CHAT, { by: 'sai', reason: 'edited', proofIds: [`ramya1-${CHAT}-7`] });
            const res = await service.notFake(CHAT, { by: 'lead', reason: 'bank confirmed' });
            expect(res).toMatchObject({ chatId: CHAT, source: 'operator_mark', changed: true });
            const r = await raw('ramya');
            expect([r.payAmount, r.canReply, r.cheatCount]).toEqual([300, 1, 2]);
            for (const f of ['fakePaymentAt', 'fakePaymentBy', 'fakePaymentReason', 'fakePaymentPrev', 'fakePaymentProofIds']) expect(r).not.toHaveProperty(f);
            expect(r.fakePaymentHistory.map((h: any) => [h.action, h.by, h.reason])).toEqual([['mark', 'sai', 'edited'], ['unmark', 'lead', 'bank confirmed']]);
            expect(r.fakePaymentHistory[1].proofIds).toEqual([`ramya1-${CHAT}-7`]);
            expect(pg.calls.some((s) => s.includes('fake_payment_unmark'))).toBe(true);

            const again = await service.notFake(CHAT, { by: 'lead' });
            expect(again).toMatchObject({ source: 'none', changed: false });
            expect((await raw('ramya')).fakePaymentHistory).toHaveLength(2);
        });

        it('a mark made before history existed gets its mark entry rebuilt from fakePaymentAt / By / Reason on unmark', async () => {
            const at = new Date('2026-11-06T16:10:00Z');
            await userData.collection.insertOne(row(CHAT, 'ramya', {
                canReply: 0, payAmount: 0, fakePaymentAt: at, fakePaymentBy: 'tg-chats', fakePaymentReason: 'marked fake from tg-chats',
                fakePaymentPrev: { payAmount: 150, canReply: 1 }, highestPayAmount: 150,
            }));
            await service.notFake(CHAT, { by: 'lead', reason: 'mistake' });
            const r = await raw('ramya');
            expect(r.fakePaymentHistory.map((h: any) => [h.action, h.by, new Date(h.at).toISOString()])).toEqual([
                ['mark', 'tg-chats', at.toISOString()], ['unmark', 'lead', expect.any(String)],
            ]);
            expect([r.canReply, r.payAmount]).toEqual([1, 150]);
        });
    });

    describe('notFake on a payment-check fraud block / unknown mute', () => {
        it('fraud block: canReply 1 + limitTime 0 on muted rows, open fraud asks closed (resolved, closedAt, closedBy), history appended, cheatCount untouched', async () => {
            await userData.create([
                row(CHAT, 'ramya', { canReply: 0, limitTime: Date.now() + 3600_000, cheatCount: 4 }),
                row(CHAT, 'kavya', { canReply: 1, limitTime: 123 }),
                row('999', 'ramya', { canReply: 0 }),
            ]);
            await proofs.collection.insertMany([
                proof(1, { ask: { kind: 'fraud', state: 'open', reasons: ['PERSONA_PAYEE'], openedAt: new Date(), blockedAt: new Date() } }),
                proof(2, { ask: { kind: 'old_time', state: 'open' } }),
                proof(3, { chatId: '999', ask: { kind: 'fraud', state: 'open', blockedAt: new Date() } }),
            ]);
            const res = await service.notFake(CHAT, { by: 'lead', reason: 'real payment' });
            expect(res).toMatchObject({ source: 'fraud_block', changed: true, rowsUnmuted: 1, asksClosed: [`ramya1-${CHAT}-1`] });
            const r = await raw('ramya');
            expect([r.canReply, r.limitTime, r.cheatCount]).toEqual([1, 0, 4]);
            expect(r.fakePaymentHistory).toEqual([expect.objectContaining({ action: 'unmute', by: 'lead', reason: 'real payment', source: 'fraud_block', proofIds: [`ramya1-${CHAT}-1`] })]);
            const k = await raw('kavya');
            expect(k.limitTime).toBe(123); // not muted: untouched apart from the history
            const asks = await proofs.collection.find({}).sort({ telegramMsgId: 1 }).toArray();
            expect(asks[0].ask).toMatchObject({ state: 'resolved', closedBy: 'lead' });
            expect(asks[0].ask.closedAt).toBeInstanceOf(Date);
            expect(asks[1].ask.state).toBe('open'); // not a fraud ask
            expect(asks[2].ask.state).toBe('open'); // another chat
            expect((await raw('ramya', '999')).canReply).toBe(0);
            expect(pg.calls).toHaveLength(0);

            const again = await service.notFake(CHAT, { by: 'lead' });
            expect(again).toMatchObject({ source: 'none', changed: false, rowsUnmuted: 0, asksClosed: [] });
            expect((await raw('ramya')).fakePaymentHistory).toHaveLength(1);
        });

        it("unknown mute (nothing recorded): unmutes and records source 'unknown'; by falls back to 'tg-chats'", async () => {
            await userData.create([row(CHAT, 'ramya', { canReply: 0, limitTime: Date.now() + 1800_000, cheatCount: 0 })]);
            const res = await service.notFake(CHAT, {});
            expect(res).toMatchObject({ source: 'unknown', changed: true, rowsUnmuted: 1 });
            const r = await raw('ramya');
            expect([r.canReply, r.limitTime, r.cheatCount]).toEqual([1, 0, 0]);
            expect(r.fakePaymentHistory[0]).toMatchObject({ action: 'unmute', by: 'tg-chats', source: 'unknown' });
        });

        it('validates the chat id', async () => {
            await expect(service.notFake('abc', {})).rejects.toBeInstanceOf(BadRequestException);
        });
    });
});
