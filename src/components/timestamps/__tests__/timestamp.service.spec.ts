/**
 * TimestampService integration tests.
 *
 * Real MongoDB (mongodb-memory-server) + real service logic.
 * ClientService is a stub (true external dependency).
 */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Timestamp, TimestampSchema } from '../timestamps.schema';
import { TimestampService } from '../timestamp.service';
import { ClientService } from '../../clients/client.service';

describe('TimestampService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<Timestamp>;
    let clientService: { findOne: jest.Mock };
    let service: TimestampService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'timestamp-svc-test' }).asPromise();
        model = connection.model<Timestamp>('TimestampSvcTest', TimestampSchema);
        await model.init();
    });

    beforeEach(() => {
        clientService = { findOne: jest.fn() };
        service = new TimestampService(model as any, clientService as any);
    });

    afterEach(async () => {
        await model.deleteMany({});
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await connection.close();
        await mongod.stop();
    });

    describe('findOne', () => {
        it('returns the doc without _id', async () => {
            await model.collection.insertOne({ clientA: 123 });
            const res = await service.findOne();
            expect(res.clientA).toBe(123);
            expect(res._id).toBeUndefined();
        });

        it('throws NotFound when no doc exists', async () => {
            await expect(service.findOne()).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('getTimeDifferences', () => {
        it('includes numeric fields over threshold and skips _id/non-numeric', async () => {
            const old = Date.now() - 10 * 60 * 1000; // 10 min ago
            const recent = Date.now() - 1000; // 1 sec ago
            await model.collection.insertOne({ clientA: old, clientB: recent, label: 'string-skip' });
            const res = await service.getTimeDifferences(); // default 3 min
            expect(res.clientA).toBeGreaterThan(3 * 60 * 1000);
            expect(res.clientB).toBeUndefined(); // under threshold
            expect(res.label).toBeUndefined(); // non-numeric skipped
            expect(res._id).toBeUndefined();
        });

        it('throws NotFound when no doc exists', async () => {
            await expect(service.getTimeDifferences()).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('getClientsWithTimeDifference', () => {
        it('returns [] when there are no differences', async () => {
            const recent = Date.now() - 1000;
            await model.collection.insertOne({ clientA: recent });
            const res = await service.getClientsWithTimeDifference();
            expect(res).toEqual([]);
        });

        it('pushes repl when no suffix, promoteRepl when "_" suffix present, skips null clients, catches errors', async () => {
            const old = Date.now() - 10 * 60 * 1000;
            await model.collection.insertOne({
                clientA: old,        // -> repl
                clientB_1: old,      // -> promoteRepl (clientParams[1] present)
                clientC: old,        // -> null client, skipped
                clientD: old,        // -> throws, caught
            });
            clientService.findOne.mockImplementation(async (id: string) => {
                if (id === 'clientA') return { repl: 'repl-A', promoteRepl: 'promo-A' };
                if (id === 'clientB') return { repl: 'repl-B', promoteRepl: 'promo-B' };
                if (id === 'clientC') return null;
                if (id === 'clientD') throw new Error('lookup failed');
                return null;
            });
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const res = await service.getClientsWithTimeDifference();
            expect(res).toContain('repl-A');
            expect(res).toContain('promo-B');
            expect(res).toHaveLength(2);
            expect(errSpy).toHaveBeenCalled();
            errSpy.mockRestore();
        });
    });

    describe('update', () => {
        it('upserts, strips _id from input and response', async () => {
            const input = { clientA: 555, _id: 'evil' };
            const res = await service.update(input);
            expect(res.clientA).toBe(555);
            expect(res._id).toBeUndefined();
            const stored = await model.collection.findOne({});
            expect(stored.clientA).toBe(555);
        });
    });

    describe('_id-less document handling (defensive branches)', () => {
        // A storage/serialization layer that strips _id (e.g. a projection or a lean view that
        // already omitted it) must still be handled - the `if (doc._id)` guards take their
        // false side and the methods return the doc untouched.
        function modelReturning(doc: any): any {
            return {
                findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(doc) }) }),
                findOneAndUpdate: () => ({ exec: () => Promise.resolve(doc) }),
                updateOne: () => ({ exec: () => Promise.resolve({}) }),
            };
        }

        it('findOne returns a doc that already lacks _id without touching the delete guard', async () => {
            const svc = new TimestampService(modelReturning({ clientA: 1 }), clientService as any);
            const res = await svc.findOne();
            expect(res).toEqual({ clientA: 1 });
        });

        it('update returns an _id-less updated doc as-is', async () => {
            const svc = new TimestampService(modelReturning({ clientA: 2 }), clientService as any);
            const res = await svc.update({ clientA: 2 });
            expect(res).toEqual({ clientA: 2 });
        });

        it('clear re-fetches an _id-less doc after unsetting extra keys', async () => {
            // First findOne yields a doc with extra keys (so the unset path runs); the re-fetch
            // yields a doc without _id, exercising the `updated && updated._id` false side.
            let call = 0;
            const model2: any = {
                findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(call++ === 0 ? { clientA: 1 } : { clientB: 2 }) }) }),
                updateOne: () => ({ exec: () => Promise.resolve({}) }),
            };
            const svc = new TimestampService(model2, clientService as any);
            const res = await svc.clear();
            expect(res).toEqual({ clientB: 2 });
        });

        it('clear returns {} when the re-fetch yields nothing', async () => {
            let call = 0;
            const model2: any = {
                findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(call++ === 0 ? { clientA: 1 } : null) }) }),
                updateOne: () => ({ exec: () => Promise.resolve({}) }),
            };
            const svc = new TimestampService(model2, clientService as any);
            const res = await svc.clear();
            expect(res).toEqual({});
        });

        it('clear strips _id from a freshly created empty doc whose toObject is unavailable', async () => {
            // create() returns a raw object (no toObject) -> the spread fallback path runs.
            const model2: any = {
                findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(null) }) }),
                create: () => Promise.resolve({ _id: 'abc', foo: 'bar' }),
            };
            const svc = new TimestampService(model2, clientService as any);
            const res = await svc.clear();
            expect(res._id).toBeUndefined();
            expect(res.foo).toBe('bar');
        });
    });

    describe('update - not found edge', () => {
        it('throws NotFound when findOneAndUpdate resolves null (e.g. upsert suppressed)', async () => {
            // Real findOneAndUpdate with upsert never returns null, so simulate a storage layer
            // that yields null (e.g. a write-concern/upsert edge) to exercise the guard.
            const nullModel: any = {
                findOneAndUpdate: () => ({ exec: () => Promise.resolve(null) }),
            };
            const svc = new TimestampService(nullModel, clientService as any);
            await expect(svc.update({ clientA: 1 })).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('forwardRef ClientService binding', () => {
        it('resolves the ClientService dependency injected into the service', () => {
            // The forwardRef(() => ClientService) factory is the lazy resolver Nest invokes;
            // calling it confirms the wiring used by getClientsWithTimeDifference.
            expect((service as any).clientService).toBe(clientService);
        });

        it('is constructed by the Nest DI container with the forwardRef ClientService resolved', async () => {
            // Drive real Nest DI so the forwardRef(() => ClientService) lazy resolver fires.
            // ClientService (and its model token) are provided as stubs - true external deps.
            const moduleRef = await Test.createTestingModule({
                providers: [
                    TimestampService,
                    { provide: getModelToken('timestampModule'), useValue: model },
                    { provide: ClientService, useValue: { findOne: jest.fn() } },
                ],
            }).compile();

            const resolved = moduleRef.get(TimestampService);
            expect(resolved).toBeInstanceOf(TimestampService);
            expect((resolved as any).clientService).toBeDefined();
            await moduleRef.close();
        });
    });

    describe('clear', () => {
        it('creates an empty doc when none exists and returns it without _id', async () => {
            const res = await service.clear();
            expect(res._id).toBeUndefined();
            const count = await model.collection.countDocuments();
            expect(count).toBe(1);
        });

        it('returns a copy without _id when doc has only _id (no other keys)', async () => {
            await model.collection.insertOne({});
            const res = await service.clear();
            expect(res._id).toBeUndefined();
        });

        it('unsets extra keys and re-fetches when doc has extra keys', async () => {
            await model.collection.insertOne({ clientA: 1, clientB: 2 });
            const res = await service.clear();
            expect(res._id).toBeUndefined();
            const stored = await model.collection.findOne({});
            expect(stored.clientA).toBeUndefined();
            expect(stored.clientB).toBeUndefined();
        });
    });
});
