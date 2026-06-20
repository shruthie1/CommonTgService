import { NotFoundException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { StatService } from '../stat.service';
import { StatController } from '../stat.controller';
import { StatSchema, StatDocument } from '../stat.schema';

function makeStatData(overrides: Partial<any> = {}): any {
    return {
        chatId: 'chat-1',
        count: 1,
        payAmount: 100,
        demoGiven: false,
        demoGivenToday: false,
        newUser: true,
        paidReply: false,
        name: 'tester',
        secondShow: false,
        didPay: null,
        client: 'client-1',
        profile: 'profile-1',
        ...overrides,
    };
}

describe('StatService (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<StatDocument>;
    let service: StatService;

    beforeAll(async () => {
        ctx = await startMongo('stat-svc-test');
        connection = ctx.connection;
        model = connection.model<StatDocument>('StatGroupB', StatSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
    });

    beforeEach(() => {
        service = new StatService(model);
    });

    test('create persists a stat', async () => {
        const created = await service.create(makeStatData());
        expect(created.chatId).toBe('chat-1');
        expect(await model.countDocuments()).toBe(1);
    });

    test('findAll returns all stats', async () => {
        await service.create(makeStatData({ chatId: 'a', client: 'c1' }));
        await service.create(makeStatData({ chatId: 'b', client: 'c2' }));
        const all = await service.findAll();
        expect(all).toHaveLength(2);
    });

    test('findByChatIdAndProfile returns matching stat', async () => {
        await service.create(makeStatData({ chatId: 'find-me', profile: 'p1' }));
        const found = await service.findByChatIdAndProfile('find-me', 'p1');
        expect(found.chatId).toBe('find-me');
    });

    test('findByChatIdAndProfile throws NotFound when missing', async () => {
        await expect(service.findByChatIdAndProfile('nope', 'p')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update modifies and returns the stat', async () => {
        await service.create(makeStatData({ chatId: 'up', profile: 'p1', count: 1 }));
        const updated = await service.update('up', 'p1', { count: 99 } as any);
        expect(updated.count).toBe(99);
    });

    test('update throws NotFound when missing', async () => {
        await expect(service.update('nope', 'p', { count: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('deleteOne removes a stat', async () => {
        await service.create(makeStatData({ chatId: 'del', profile: 'p1' }));
        await service.deleteOne('del', 'p1');
        expect(await model.countDocuments()).toBe(0);
    });

    test('deleteOne throws NotFound when missing', async () => {
        await expect(service.deleteOne('nope', 'p')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('deleteAll removes everything', async () => {
        await service.create(makeStatData({ chatId: 'a', client: 'c1' }));
        await service.create(makeStatData({ chatId: 'b', client: 'c2' }));
        await service.deleteAll();
        expect(await model.countDocuments()).toBe(0);
    });
});

describe('StatController', () => {
    const svc = {
        create: jest.fn(),
        findByChatIdAndProfile: jest.fn(),
        update: jest.fn(),
        deleteOne: jest.fn(),
        deleteAll: jest.fn(),
    };
    const controller = new StatController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('create delegates', async () => {
        svc.create.mockResolvedValue({ ok: 1 });
        const dto = makeStatData();
        expect(await controller.create(dto)).toEqual({ ok: 1 });
        expect(svc.create).toHaveBeenCalledWith(dto);
    });

    test('findByChatIdAndProfile delegates', async () => {
        svc.findByChatIdAndProfile.mockResolvedValue({ chatId: 'x' });
        expect(await controller.findByChatIdAndProfile('x', 'p')).toEqual({ chatId: 'x' });
        expect(svc.findByChatIdAndProfile).toHaveBeenCalledWith('x', 'p');
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ count: 5 });
        expect(await controller.update('x', 'p', { count: 5 } as any)).toEqual({ count: 5 });
        expect(svc.update).toHaveBeenCalledWith('x', 'p', { count: 5 });
    });

    test('deleteOne delegates', async () => {
        svc.deleteOne.mockResolvedValue(undefined);
        await controller.deleteOne('x', 'p');
        expect(svc.deleteOne).toHaveBeenCalledWith('x', 'p');
    });

    test('deleteAll delegates', async () => {
        svc.deleteAll.mockResolvedValue(undefined);
        await controller.deleteAll();
        expect(svc.deleteAll).toHaveBeenCalled();
    });
});
