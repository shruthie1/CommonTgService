/** PaymentProofsController over real HTTP (controller alone; the global AuthGuard is tested in auth.guard.spec). */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PaymentProofsController } from '../payment-proofs.controller';
import { PaymentProofsService } from '../payment-proofs.service';

describe('PaymentProofsController', () => {
    let app: INestApplication;
    const calls: unknown[] = [];
    const service = {
        list: async (q: unknown) => { calls.push(['list', q]); return { items: [], nextCursor: null, counts: {}, truncated: false }; },
        views: async (q: unknown) => { calls.push(['views', q]); return { view: 'check', entries: [], counts: { check: 0, muted: 0, refused: 0 }, truncated: false }; },
        stampChat: async (chatId: string, body: any) => { calls.push(['stampChat', chatId, body]); return { chatId, decision: body.decision, stamped: 1 }; },
    };
    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [PaymentProofsController],
            providers: [{ provide: PaymentProofsService, useValue: service }],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });
    afterAll(async () => { await app.close(); });
    beforeEach(() => { calls.length = 0; });

    it('GET /payment-proofs passes the query through', async () => {
        const res = await request(app.getHttpServer()).get('/payment-proofs?state=all&client=ramya1&limit=10&since=2026-11-01T00:00:00Z&minAmount=300&cursor=abc');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ items: [], nextCursor: null, counts: {}, truncated: false });
        expect(calls).toEqual([['list', { state: 'all', client: 'ramya1', limit: '10', since: '2026-11-01T00:00:00Z', minAmount: '300', cursor: 'abc' }]]);
    });

    it('the old review endpoints are gone (404)', async () => {
        expect((await request(app.getHttpServer()).post('/payment-proofs/ramya1-111-3/review').send({ state: 'ok', by: 'ops' })).status).toBe(404);
        expect((await request(app.getHttpServer()).post('/payment-proofs/chat/111/review').send({ by: 'ops' })).status).toBe(404);
        expect(calls).toEqual([]);
    });

    it('GET /payment-proofs?view= goes to the views (old list untouched without view)', async () => {
        const res = await request(app.getHttpServer()).get('/payment-proofs?view=muted&client=ramya1');
        expect(res.status).toBe(200);
        expect(res.body.view).toBe('check');
        expect(calls).toEqual([['views', { view: 'muted', client: 'ramya1' }]]);
    });

    it('POST /payment-proofs/chat/:chatId/actions stamps; includeReviewed passes through to the views', async () => {
        const res = await request(app.getHttpServer()).post('/payment-proofs/chat/111/actions').send({ decision: 'fake', proofIds: ['ramya1-111-3'] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ chatId: '111', decision: 'fake', stamped: 1 });
        await request(app.getHttpServer()).get('/payment-proofs?view=check&includeReviewed=1');
        expect(calls).toEqual([['stampChat', '111', { decision: 'fake', proofIds: ['ramya1-111-3'] }], ['views', { view: 'check', includeReviewed: '1' }]]);
    });
});
