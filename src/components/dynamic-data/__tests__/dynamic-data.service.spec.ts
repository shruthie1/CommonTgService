import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DynamicData, DynamicDataSchema, DynamicDataDocument } from '../dynamic-data.schema';
import { DynamicDataService } from '../dynamic-data.service';
import { ArrayOperationType } from '../dto/update-dynamic-data.dto';

// Wrap a REAL mongoose session (needed so model.save({ session }) works) but
// neutralise the transaction methods, since mongodb-memory-server standalone
// does not support transactions. We attach jest spies so tests can assert calls.
async function makeRealSessionStub(conn: Connection) {
    const real = await conn.startSession();
    real.startTransaction = jest.fn().mockReturnValue(undefined) as any;
    real.commitTransaction = jest.fn().mockResolvedValue(undefined) as any;
    real.abortTransaction = jest.fn().mockResolvedValue(undefined) as any;
    const realEnd = real.endSession.bind(real);
    real.endSession = jest.fn(async () => { await realEnd(); }) as any;
    return real;
}

describe('DynamicDataService', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<DynamicDataDocument>;
    let fakeSession: any;
    let stubConnection: any;
    let service: DynamicDataService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'dyn-data-test' }).asPromise();
        model = connection.model<DynamicDataDocument>('DynamicDataSvcTest', DynamicDataSchema);
        await model.init();
    });

    beforeEach(async () => {
        fakeSession = await makeRealSessionStub(connection);
        stubConnection = { startSession: jest.fn().mockResolvedValue(fakeSession) };
        service = new DynamicDataService(model as any, stubConnection as any);
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

    // ==================== create ====================
    describe('create', () => {
        it('creates a doc and returns .data', async () => {
            const result = await service.create({ configKey: 'k1', data: { a: 1 } } as any);
            expect(result).toEqual({ a: 1 });
            expect(fakeSession.startTransaction).toHaveBeenCalled();
            expect(fakeSession.commitTransaction).toHaveBeenCalled();
            expect(fakeSession.endSession).toHaveBeenCalled();
        });

        it('throws ConflictException on duplicate configKey', async () => {
            await model.create({ configKey: 'dup', data: { x: 1 } });
            await expect(service.create({ configKey: 'dup', data: { y: 2 } } as any))
                .rejects.toBeInstanceOf(ConflictException);
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });

        it('throws BadRequestException on generic error and aborts', async () => {
            const badModel: any = {
                findOne: () => ({ session: jest.fn().mockRejectedValue(new Error('boom')) }),
            };
            const svc = new DynamicDataService(badModel, stubConnection as any);
            await expect(svc.create({ configKey: 'k', data: {} } as any))
                .rejects.toBeInstanceOf(BadRequestException);
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });
    });

    // ==================== findOne ====================
    describe('findOne', () => {
        it('returns the full doc data', async () => {
            await model.create({ configKey: 'f1', data: { nested: { v: 5 }, list: [1, 2] } });
            const result = await service.findOne('f1');
            expect(result).toEqual({ nested: { v: 5 }, list: [1, 2] });
        });

        it('returns data at a path', async () => {
            await model.create({ configKey: 'f2', data: { nested: { v: 5 } } });
            const result = await service.findOne('f2', 'nested.v');
            expect(result).toBe(5);
        });

        it('throws NotFound when doc missing', async () => {
            await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('throws NotFound when path missing', async () => {
            await model.create({ configKey: 'f3', data: { a: 1 } });
            await expect(service.findOne('f3', 'b.c')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ==================== update ====================
    describe('update', () => {
        it('performs a full data update (self-managed session)', async () => {
            await model.create({ configKey: 'u1', data: { a: 1 } });
            const result = await service.update('u1', { value: { b: 2 } } as any);
            expect(result.data).toEqual({ b: 2 });
            expect(fakeSession.commitTransaction).toHaveBeenCalled();
            expect(fakeSession.endSession).toHaveBeenCalled();
        });

        it('performs a path update', async () => {
            await model.create({ configKey: 'u2', data: { a: { b: 1 } } });
            const result = await service.update('u2', { path: 'a.b', value: 99 } as any);
            expect(result.data.a.b).toBe(99);
            // prove persistence to the DB (Mixed markModified fix)
            const persisted = await model.findOne({ configKey: 'u2' }).lean();
            expect(persisted!.data.a.b).toBe(99);
        });

        it('throws NotFound when path missing on update', async () => {
            await model.create({ configKey: 'u3', data: { a: 1 } });
            await expect(service.update('u3', { path: 'x.y', value: 1 } as any))
                .rejects.toBeInstanceOf(NotFoundException);
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });

        it('throws NotFound when doc missing', async () => {
            await expect(service.update('nope', { value: {} } as any))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        it('routes to array operation (PUSH)', async () => {
            await model.create({ configKey: 'u4', data: { arr: [1] } });
            const result = await service.update('u4', {
                path: 'arr',
                value: 2,
                arrayOperation: { type: ArrayOperationType.PUSH },
            } as any);
            expect(result.data.arr).toEqual([1, 2]);
        });

        it('throws BadRequest when array operation has no path', async () => {
            await model.create({ configKey: 'u5', data: { arr: [1] } });
            await expect(service.update('u5', {
                value: 2,
                arrayOperation: { type: ArrayOperationType.PUSH },
            } as any)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('uses an externally-provided session (no self-managed txn)', async () => {
            await model.create({ configKey: 'u6', data: { a: 1 } });
            const externalSession = await makeRealSessionStub(connection);
            const result = await service.update('u6', { value: { c: 3 } } as any, externalSession as any);
            expect(result.data).toEqual({ c: 3 });
            // external session: should NOT start/commit/end via service
            expect(externalSession.startTransaction).not.toHaveBeenCalled();
            expect(externalSession.commitTransaction).not.toHaveBeenCalled();
            expect(externalSession.endSession).not.toHaveBeenCalled();
            // and should not have started a new session on the connection
            expect(stubConnection.startSession).not.toHaveBeenCalled();
        });

        it('rethrows and aborts on save error', async () => {
            const fakeDoc: any = {
                data: { a: 1 },
                markModified: jest.fn(),
                save: jest.fn().mockRejectedValue(new Error('save fail')),
                toJSON: jest.fn(),
            };
            const badModel: any = {
                findOne: () => ({ session: jest.fn().mockResolvedValue(fakeDoc) }),
            };
            const svc = new DynamicDataService(badModel, stubConnection as any);
            await expect(svc.update('x', { value: { z: 1 } } as any))
                .rejects.toThrow('save fail');
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });
    });

    // ==================== handleArrayOperation (via update) ====================
    describe('handleArrayOperation', () => {
        const arrUpdate = (op: any) =>
            service.update('arr1', { path: 'arr', value: op.value, arrayOperation: op } as any);

        beforeEach(async () => {
            await model.create({ configKey: 'arr1', data: { arr: [10, 20, 30] } });
        });

        it('POP', async () => {
            const r = await arrUpdate({ type: ArrayOperationType.POP });
            expect(r.data.arr).toEqual([10, 20]);
            // prove persistence to the DB (Mixed markModified fix)
            const persisted = await model.findOne({ configKey: 'arr1' }).lean();
            expect(persisted!.data.arr).toEqual([10, 20]);
        });

        it('INSERT valid index', async () => {
            const r = await arrUpdate({ type: ArrayOperationType.INSERT, index: 1, value: 15 });
            expect(r.data.arr).toEqual([10, 15, 20, 30]);
        });

        it('INSERT invalid index', async () => {
            await expect(arrUpdate({ type: ArrayOperationType.INSERT, index: 99, value: 1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('REMOVE valid index', async () => {
            const r = await arrUpdate({ type: ArrayOperationType.REMOVE, index: 0 });
            expect(r.data.arr).toEqual([20, 30]);
        });

        it('REMOVE invalid index', async () => {
            await expect(arrUpdate({ type: ArrayOperationType.REMOVE, index: -1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('UPDATE valid index', async () => {
            const r = await arrUpdate({ type: ArrayOperationType.UPDATE, index: 2, value: 99 });
            expect(r.data.arr).toEqual([10, 20, 99]);
        });

        it('UPDATE invalid index', async () => {
            await expect(arrUpdate({ type: ArrayOperationType.UPDATE, index: 5, value: 1 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('default invalid type', async () => {
            await expect(arrUpdate({ type: 'NOPE' as any }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('throws BadRequest when path is not an array', async () => {
            await model.create({ configKey: 'notarr', data: { v: 5 } });
            await expect(service.update('notarr', {
                path: 'v', value: 1, arrayOperation: { type: ArrayOperationType.PUSH },
            } as any)).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ==================== remove ====================
    describe('remove', () => {
        it('removes data at path', async () => {
            await model.create({ configKey: 'r1', data: { a: 1, b: 2 } });
            await service.remove('r1', 'a');
            const doc = await model.findOne({ configKey: 'r1' }).lean();
            expect(doc!.data).toEqual({ b: 2 });
            expect(fakeSession.commitTransaction).toHaveBeenCalled();
        });

        it('throws NotFound when path missing', async () => {
            await model.create({ configKey: 'r2', data: { a: 1 } });
            await expect(service.remove('r2', 'x')).rejects.toBeInstanceOf(NotFoundException);
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });

        it('deletes whole doc', async () => {
            await model.create({ configKey: 'r3', data: { a: 1 } });
            await service.remove('r3');
            const doc = await model.findOne({ configKey: 'r3' }).lean();
            expect(doc).toBeNull();
        });

        it('throws NotFound when doc missing', async () => {
            await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
        });

        it('rethrows and aborts on error', async () => {
            const badModel: any = {
                findOne: () => ({ session: jest.fn().mockRejectedValue(new Error('find fail')) }),
            };
            const svc = new DynamicDataService(badModel, stubConnection as any);
            await expect(svc.remove('x')).rejects.toThrow('find fail');
            expect(fakeSession.abortTransaction).toHaveBeenCalled();
        });
    });

    // ==================== findAll ====================
    describe('findAll', () => {
        it('reduces all docs into a keyed record', async () => {
            await model.create({ configKey: 'a1', data: { x: 1 } });
            await model.create({ configKey: 'a2', data: { y: 2 } });
            const result = await service.findAll();
            expect(result).toEqual({ a1: { x: 1 }, a2: { y: 2 } });
        });

        it('rethrows on error', async () => {
            const badModel: any = {
                find: () => ({ exec: jest.fn().mockRejectedValue(new Error('find all fail')) }),
            };
            const svc = new DynamicDataService(badModel, stubConnection as any);
            await expect(svc.findAll()).rejects.toThrow('find all fail');
        });
    });
});
