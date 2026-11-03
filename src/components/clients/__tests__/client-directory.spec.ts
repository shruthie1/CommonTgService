import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';
import { Client } from '../schemas/client.schema';

describe('GET /clients/directory', () => {
    describe('ClientService.findDirectory', () => {
        function serviceWith(docs: any[]) {
            const exec = jest.fn().mockResolvedValue(docs);
            const lean = jest.fn().mockReturnValue({ exec });
            const sort = jest.fn().mockReturnValue({ lean });
            const find = jest.fn().mockReturnValue({ sort });
            const svc: any = Object.create(ClientService.prototype);
            svc.clientModel = { find };
            svc.directoryCache = null;
            return { svc: svc as ClientService, find, sort };
        }

        it('projects only clientId, mobile, swappedAt and returns exactly three keys per item', async () => {
            const swapped = new Date('2026-11-01T10:00:00.000Z');
            // The model mock ignores the projection, so leaked fields would show up here.
            const { svc, find, sort } = serviceWith([
                { clientId: 'a1', mobile: '919000000001', swappedAt: swapped, session: 'SECRET', password: 'pw', deployKey: 'dk', name: 'x' },
                { clientId: 'b1', session: 'SECRET2' },
            ]);
            const res = await (svc as any).findDirectory();
            expect(find).toHaveBeenCalledWith({}, { _id: 0, clientId: 1, mobile: 1, swappedAt: 1 });
            expect(sort).toHaveBeenCalledWith({ clientId: 1 });
            expect(res).toEqual({
                items: [
                    { clientId: 'a1', mobile: '919000000001', lastSwapAt: '2026-11-01T10:00:00.000Z' },
                    { clientId: 'b1', mobile: null, lastSwapAt: null },
                ],
            });
            for (const item of res.items) expect(Object.keys(item).sort()).toEqual(['clientId', 'lastSwapAt', 'mobile']);
            expect(JSON.stringify(res)).not.toMatch(/SECRET|session|password|deployKey/);
        });

        it('sorts by clientId even if the store returns unsorted rows', async () => {
            const { svc } = serviceWith([{ clientId: 'z9' }, { clientId: 'a1' }]);
            const res = await (svc as any).findDirectory();
            expect(res.items.map((i: any) => i.clientId)).toEqual(['a1', 'z9']);
        });
    });

    describe('routing', () => {
        let app: INestApplication;
        const stub = {
            findDirectory: jest.fn().mockResolvedValue({ items: [{ clientId: 'a1', mobile: '91900', lastSwapAt: null }] }),
            findOne: jest.fn().mockResolvedValue({ clientId: 'directory', session: 'SECRET' }),
        };

        beforeAll(async () => {
            const mod = await Test.createTestingModule({
                controllers: [ClientController],
                providers: [
                    { provide: ClientService, useValue: stub },
                    { provide: getModelToken(Client.name), useValue: {} },
                ],
            }).compile();
            app = mod.createNestApplication();
            await app.init();
        });

        afterAll(async () => { await app?.close(); });

        it('is served by findDirectory, not captured by /clients/:clientId', async () => {
            const res = await request(app.getHttpServer()).get('/clients/directory').expect(200);
            expect(res.body).toEqual({ items: [{ clientId: 'a1', mobile: '91900', lastSwapAt: null }] });
            expect(stub.findDirectory).toHaveBeenCalledTimes(1);
            expect(stub.findOne).not.toHaveBeenCalled();
            expect(String(res.headers['cache-control'] ?? '')).toMatch(/no-store/);
        });
    });
});
