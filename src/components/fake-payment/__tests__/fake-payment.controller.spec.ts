/**
 * FakePaymentController write-key check (review 2026-11-02): the global AuthGuard accepts the public legacy x-api-key,
 * so mark / unmark must also require x-ops-write-key = env OPS_WRITE_KEY. Real HTTP through Nest (no global guard
 * here: this tests the controller's own check); the service is a recorder.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FakePaymentController } from '../fake-payment.controller';
import { FakePaymentService } from '../fake-payment.service';

describe('FakePaymentController: x-ops-write-key on mark and unmark', () => {
    let app: INestApplication;
    const calls: string[] = [];
    const service = {
        mark: async (chatId: string) => { calls.push(`mark:${chatId}`); return { chatId, marked: true }; },
        unmark: async (chatId: string) => { calls.push(`unmark:${chatId}`); return { chatId, marked: false }; },
        status: async (chatId: string) => ({ chatId, marked: false }),
    };
    const saved = process.env.OPS_WRITE_KEY;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [FakePaymentController],
            providers: [{ provide: FakePaymentService, useValue: service }],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });
    afterAll(async () => {
        await app.close();
        if (saved === undefined) delete process.env.OPS_WRITE_KEY; else process.env.OPS_WRITE_KEY = saved;
    });
    beforeEach(() => { calls.length = 0; });

    const body = { by: 'ops', reason: 'edited receipt' };

    it.each(['mark', 'unmark'])('%s: 503 when OPS_WRITE_KEY is unset, service not called', async (action) => {
        delete process.env.OPS_WRITE_KEY;
        const res = await request(app.getHttpServer()).post(`/fake-payment/1118622422/${action}`).set('x-ops-write-key', 'anything').send(body);
        expect(res.status).toBe(503);
        expect(calls).toEqual([]);
    });

    it.each(['mark', 'unmark'])('%s: 401 when the header is missing or wrong (the legacy api key alone is not enough)', async (action) => {
        process.env.OPS_WRITE_KEY = 's3cret';
        const missing = await request(app.getHttpServer()).post(`/fake-payment/1118622422/${action}`).set('x-api-key', 'santoor').send(body);
        const wrong = await request(app.getHttpServer()).post(`/fake-payment/1118622422/${action}`).set('x-ops-write-key', 's3cret2').send(body);
        expect(missing.status).toBe(401);
        expect(wrong.status).toBe(401);
        expect(calls).toEqual([]);
    });

    it.each(['mark', 'unmark'])('%s: the right key reaches the service', async (action) => {
        process.env.OPS_WRITE_KEY = 's3cret';
        const res = await request(app.getHttpServer()).post(`/fake-payment/1118622422/${action}`).set('x-ops-write-key', 's3cret').send(body);
        expect(res.status).toBe(200);
        expect(calls).toEqual([`${action}:1118622422`]);
    });

    it('status (read-only GET) needs no write key', async () => {
        delete process.env.OPS_WRITE_KEY;
        const res = await request(app.getHttpServer()).get('/fake-payment/1118622422');
        expect(res.status).toBe(200);
    });
});
