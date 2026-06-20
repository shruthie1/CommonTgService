import { NotFoundException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { BuildService } from '../build.service';
import { BuildController } from '../build.controller';
import { BuildSchema, Build } from '../builds.schema';

describe('BuildService (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<Build>;
    let service: BuildService;

    beforeAll(async () => {
        ctx = await startMongo('build-svc-test');
        connection = ctx.connection;
        model = connection.model<Build>('BuildGroupB', BuildSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
    });

    beforeEach(() => {
        service = new BuildService(model);
    });

    test('OnModuleInit logs without error', async () => {
        await expect(service.OnModuleInit()).resolves.toBeUndefined();
    });

    test('findOne throws NotFound when empty', async () => {
        await expect(service.findOne()).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update upserts a document', async () => {
        const updated = await service.update({ version: '1.0.0', _id: 'strip' } as any);
        expect((updated as any).version).toBe('1.0.0');
        expect(await model.countDocuments()).toBe(1);
    });

    test('findOne returns existing document', async () => {
        await service.update({ version: '2.0.0' } as any);
        const found = await service.findOne();
        expect((found as any).version).toBe('2.0.0');
    });

    test('update modifies an existing document', async () => {
        await service.update({ version: 'a' } as any);
        const updated = await service.update({ version: 'b' } as any);
        expect((updated as any).version).toBe('b');
        expect(await model.countDocuments()).toBe(1);
    });
});

describe('BuildController', () => {
    const svc = { findOne: jest.fn(), update: jest.fn() };
    const controller = new BuildController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('findOne delegates', async () => {
        svc.findOne.mockResolvedValue({ a: 1 });
        expect(await controller.findOne()).toEqual({ a: 1 });
        expect(svc.findOne).toHaveBeenCalled();
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ b: 2 });
        expect(await controller.update({ b: 2 })).toEqual({ b: 2 });
        expect(svc.update).toHaveBeenCalledWith({ b: 2 });
    });
});
