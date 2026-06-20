import { NotFoundException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { PromoteMsgsService } from '../promote-msgs.service';
import { PromoteMsgsController } from '../promote-msgs.controller';
import { PromoteMsgSchema, PromoteMsg } from '../promote-msgs.schema';

describe('PromoteMsgsService (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<PromoteMsg>;
    let service: PromoteMsgsService;

    beforeAll(async () => {
        ctx = await startMongo('promote-msgs-svc-test');
        connection = ctx.connection;
        model = connection.model<PromoteMsg>('PromoteMsgGroupB', PromoteMsgSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
    });

    beforeEach(() => {
        service = new PromoteMsgsService(model);
    });

    test('OnModuleInit logs without error', async () => {
        await expect(service.OnModuleInit()).resolves.toBeUndefined();
    });

    test('findOne throws NotFound when empty', async () => {
        await expect(service.findOne()).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update upserts a document', async () => {
        const updated = await service.update({ greeting: 'hi', _id: 'should-be-stripped' } as any);
        expect((updated as any).greeting).toBe('hi');
        expect(await model.countDocuments()).toBe(1);
    });

    test('findOne returns existing document (without _id)', async () => {
        await service.update({ greeting: 'hello' } as any);
        const found = await service.findOne();
        expect(found.greeting).toBe('hello');
        expect(found._id).toBeUndefined();
    });

    test('update modifies an existing document', async () => {
        await service.update({ greeting: 'one' } as any);
        const updated = await service.update({ greeting: 'two' } as any);
        expect((updated as any).greeting).toBe('two');
        expect(await model.countDocuments()).toBe(1);
    });
});

describe('PromoteMsgsController', () => {
    const svc = { findOne: jest.fn(), update: jest.fn() };
    const controller = new PromoteMsgsController(svc as any);

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
