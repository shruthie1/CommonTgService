/** PaymentProofsController over real HTTP (controller alone; the global AuthGuard is tested in auth.guard.spec). */
import { BadRequestException, INestApplication } from '@nestjs/common';
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
        reviewChat: async (chatId: string, body: any) => { calls.push(['reviewChat', chatId, body]); return { chatId, reviewed: [] }; },
        review: async (id: string, body: any) => {
            calls.push(['review', id, body]);
            if (body.state === 'bad') throw new BadRequestException('state');
            return { proofId: id, review: null };
        },
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
        const res = await request(app.getHttpServer()).get('/payment-proofs?state=flagged&client=ramya1&limit=10&since=2026-11-01T00:00:00Z&minAmount=300&cursor=abc');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ items: [], nextCursor: null, counts: {}, truncated: false });
        expect(calls).toEqual([['list', { state: 'flagged', client: 'ramya1', limit: '10', since: '2026-11-01T00:00:00Z', minAmount: '300', cursor: 'abc' }]]);
    });

    it('POST /payment-proofs/:proofId/review returns 200 and maps service 400s', async () => {
        const ok = await request(app.getHttpServer()).post('/payment-proofs/ramya1-111-3/review').send({ state: 'ok', by: 'ops' });
        expect(ok.status).toBe(200);
        expect(calls[0]).toEqual(['review', 'ramya1-111-3', { state: 'ok', by: 'ops' }]);
        const bad = await request(app.getHttpServer()).post('/payment-proofs/ramya1-111-3/review').send({ state: 'bad' });
        expect(bad.status).toBe(400);
    });

    it('GET /payment-proofs?view= goes to the views (old list untouched without view)', async () => {
        const res = await request(app.getHttpServer()).get('/payment-proofs?view=muted&client=ramya1');
        expect(res.status).toBe(200);
        expect(res.body.view).toBe('check');
        expect(calls).toEqual([['views', { view: 'muted', client: 'ramya1' }]]);
    });

    it('POST /payment-proofs/chat/:chatId/review marks the chat looks fine', async () => {
        const res = await request(app.getHttpServer()).post('/payment-proofs/chat/111/review').send({ by: 'ops', proofIds: ['ramya1-111-3'] });
        expect(res.status).toBe(200);
        expect(calls).toEqual([['reviewChat', '111', { by: 'ops', proofIds: ['ramya1-111-3'] }]]);
    });
});
