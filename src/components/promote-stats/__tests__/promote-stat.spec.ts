import { NotFoundException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { PromoteStatService } from '../promote-stat.service';
import { PromoteStatController } from '../promote-stat.controller';
import { PromoteStatSchema, PromoteStatDocument } from '../schemas/promote-stat.schema';

function makeData(overrides: Partial<any> = {}): any {
    return {
        client: 'client-1',
        data: { 'ch1': 5 },
        totalCount: 10,
        uniqueChannels: 3,
        releaseDay: 1000,
        isActive: true,
        lastUpdatedTimeStamp: 2000,
        channels: ['ch1', 'ch2'],
        ...overrides,
    };
}

describe('PromoteStatService (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<PromoteStatDocument>;
    let service: PromoteStatService;

    beforeAll(async () => {
        ctx = await startMongo('promote-stat-svc-test');
        connection = ctx.connection;
        model = connection.model<PromoteStatDocument>('PromoteStatGroupB', PromoteStatSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
    });

    beforeEach(() => {
        // ClientService dependency is unused by the methods under test.
        service = new PromoteStatService(model, {} as any);
    });

    test('create persists a promote stat', async () => {
        const created = await service.create(makeData());
        expect(created.client).toBe('client-1');
    });

    test('findAll returns stats sorted by totalCount desc', async () => {
        await service.create(makeData({ client: 'low', totalCount: 5 }));
        await service.create(makeData({ client: 'high', totalCount: 50 }));
        const all = await service.findAll();
        expect(all).toHaveLength(2);
        expect(all[0].client).toBe('high');
    });

    test('findByClient returns matching stat', async () => {
        await service.create(makeData({ client: 'find-me' }));
        const found = await service.findByClient('find-me');
        expect(found.client).toBe('find-me');
    });

    test('findByClient throws NotFound when missing', async () => {
        await expect(service.findByClient('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update modifies and returns the stat', async () => {
        await service.create(makeData({ client: 'up', totalCount: 1 }));
        const updated = await service.update('up', { totalCount: 999 } as any);
        expect(updated.totalCount).toBe(999);
    });

    test('update throws NotFound when missing', async () => {
        await expect(service.update('nope', { totalCount: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('deleteOne removes a stat', async () => {
        await service.create(makeData({ client: 'del' }));
        await service.deleteOne('del');
        expect(await model.countDocuments()).toBe(0);
    });

    test('deleteOne throws NotFound when missing', async () => {
        await expect(service.deleteOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('deleteAll removes everything', async () => {
        await service.create(makeData({ client: 'a' }));
        await service.create(makeData({ client: 'b' }));
        await service.deleteAll();
        expect(await model.countDocuments()).toBe(0);
    });

    test('reinitPromoteStats resets counters for every client', async () => {
        await service.create(makeData({ client: 'r1', totalCount: 10, uniqueChannels: 4 }));
        await service.create(makeData({ client: 'r2', totalCount: 20, uniqueChannels: 7 }));
        await service.reinitPromoteStats();
        const all = await service.findAll();
        for (const stat of all) {
            expect(stat.totalCount).toBe(0);
            expect(stat.uniqueChannels).toBe(0);
        }
    });
});

describe('PromoteStatController', () => {
    const svc = {
        create: jest.fn(),
        findByClient: jest.fn(),
        update: jest.fn(),
        deleteOne: jest.fn(),
        deleteAll: jest.fn(),
    };
    const controller = new PromoteStatController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('create delegates', async () => {
        svc.create.mockResolvedValue({ ok: 1 });
        const dto = makeData();
        expect(await controller.create(dto)).toEqual({ ok: 1 });
        expect(svc.create).toHaveBeenCalledWith(dto);
    });

    test('findByClient delegates', async () => {
        svc.findByClient.mockResolvedValue({ client: 'x' });
        expect(await controller.findByClient('x')).toEqual({ client: 'x' });
        expect(svc.findByClient).toHaveBeenCalledWith('x');
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ totalCount: 5 });
        expect(await controller.update('x', { totalCount: 5 } as any)).toEqual({ totalCount: 5 });
        expect(svc.update).toHaveBeenCalledWith('x', { totalCount: 5 });
    });

    test('deleteOne delegates', async () => {
        svc.deleteOne.mockResolvedValue(undefined);
        await controller.deleteOne('x');
        expect(svc.deleteOne).toHaveBeenCalledWith('x');
    });

    test('deleteAll delegates', async () => {
        svc.deleteAll.mockResolvedValue(undefined);
        await controller.deleteAll();
        expect(svc.deleteAll).toHaveBeenCalled();
    });
});
