/**
 * FakePaymentController (owner 2026-11-03): the separate x-ops-write-key was removed. mark / unmark are protected only
 * by the global CMS AuthGuard (x-api-key) like every other CMS route; a sent x-ops-write-key header is ignored.
 * Real HTTP through Nest (no global guard here: this tests the controller alone); the service is a recorder.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FakePaymentController } from '../fake-payment.controller';
import { FakePaymentService } from '../fake-payment.service';

describe('FakePaymentController: mark / unmark need no write key', () => {
    let app: INestApplication;
    const calls: string[] = [];
    const service = {
        mark: async (chatId: string) => { calls.push(`mark:${chatId}`); return { chatId, marked: true }; },
        unmark: async (chatId: string) => { calls.push(`unmark:${chatId}`); return { chatId, marked: false }; },
        status: async (chatId: string) => ({ chatId, marked: false }),
        notFake: async (chatId: string, body: any) => { calls.push(`notFake:${chatId}:${body.by ?? ''}`); return { chatId, changed: true }; },
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
    beforeEach(() => { calls.length = 0; delete process.env.OPS_WRITE_KEY; });

    const body = { by: 'ops', reason: 'edited receipt' };

    it.each(['mark', 'unmark'])('%s: works without x-ops-write-key and with OPS_WRITE_KEY unset', async (action) => {
        const res = await request(app.getHttpServer()).post(`/fake-payment/1118622422/${action}`).set('x-api-key', 'santoor').send(body);
        expect(res.status).toBe(200);
        expect(calls).toEqual([`${action}:1118622422`]);
    });

    it('mark: a stray x-ops-write-key header is ignored even when OPS_WRITE_KEY is set', async () => {
        process.env.OPS_WRITE_KEY = 's3cret';
        const res = await request(app.getHttpServer()).post('/fake-payment/1118622422/mark').set('x-ops-write-key', 'wrong').send(body);
        expect(res.status).toBe(200);
        expect(calls).toEqual(['mark:1118622422']);
    });

    it('status (read-only GET) works', async () => {
        const res = await request(app.getHttpServer()).get('/fake-payment/1118622422');
        expect(res.status).toBe(200);
    });

    it('POST /fake-payment/:chatId/not-fake passes the body through', async () => {
        const res = await request(app.getHttpServer()).post('/fake-payment/1118622422/not-fake').send({ by: 'ops', reason: 'real' });
        expect(res.status).toBe(200);
        expect(calls).toEqual(['notFake:1118622422:ops']);
    });
});
