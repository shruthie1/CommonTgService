import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        const found = await service.findByChatIdAndProfile('find-me', 'p1', 'client-1');
        expect(found.chatId).toBe('find-me');
    });

    test('findByChatIdAndProfile throws NotFound when missing', async () => {
        await expect(service.findByChatIdAndProfile('nope', 'p', 'client-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update modifies and returns the stat', async () => {
        await service.create(makeStatData({ chatId: 'up', profile: 'p1', count: 1 }));
        const updated = await service.update('up', 'p1', 'client-1', { count: 99 } as any);
        expect(updated.count).toBe(99);
    });

    test('update throws NotFound when missing', async () => {
        await expect(service.update('nope', 'p', 'client-1', { count: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('deleteOne removes a stat', async () => {
        await service.create(makeStatData({ chatId: 'del', profile: 'p1' }));
        await service.deleteOne('del', 'p1', 'client-1');
        expect(await model.countDocuments()).toBe(0);
    });

    test('deleteOne throws NotFound when missing', async () => {
        await expect(service.deleteOne('nope', 'p', 'client-1')).rejects.toBeInstanceOf(NotFoundException);
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
        expect(await controller.findByChatIdAndProfile('x', 'p', 'c1')).toEqual({ chatId: 'x' });
        expect(svc.findByChatIdAndProfile).toHaveBeenCalledWith('x', 'p', 'c1');
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ count: 5 });
        expect(await controller.update('x', 'p', 'c1', { count: 5 } as any)).toEqual({ count: 5 });
        expect(svc.update).toHaveBeenCalledWith('x', 'p', 'c1', { count: 5 });
    });

    test('deleteOne delegates', async () => {
        svc.deleteOne.mockResolvedValue(undefined);
        await controller.deleteOne('x', 'p', 'c1');
        expect(svc.deleteOne).toHaveBeenCalledWith('x', 'p', 'c1');
    });

    test('deleteAll delegates', async () => {
        svc.deleteAll.mockResolvedValue(undefined);
        await controller.deleteAll();
        expect(svc.deleteAll).toHaveBeenCalled();
    });
});

describe('StatService sibling clients (stats2 audit A4): every single-row op matches client too', () => {
    let ctx: MongoTestContext;
    let model: Model<StatDocument>;
    let service: StatService;

    beforeAll(async () => {
        ctx = await startMongo('stat-sibling-a4');
        model = ctx.connection.model<StatDocument>('StatSiblingA4', StatSchema);
        await model.syncIndexes();
    });
    afterAll(async () => { await stopMongo(ctx); });
    beforeEach(async () => {
        await model.deleteMany({}).exec();
        service = new StatService(model);
        // Two sibling clients of one persona, the same user: two distinct rows under the unique triple key.
        await service.create(makeStatData({ chatId: 'sib', profile: 'shruthi', client: 'shruthi1', count: 1 }));
        await service.create(makeStatData({ chatId: 'sib', profile: 'shruthi', client: 'shruthi2', count: 2 }));
    });

    test('get returns the named client row, never the sibling', async () => {
        expect((await service.findByChatIdAndProfile('sib', 'shruthi', 'shruthi2')).count).toBe(2);
        expect((await service.findByChatIdAndProfile('sib', 'shruthi', 'shruthi1')).count).toBe(1);
        await expect(service.findByChatIdAndProfile('sib', 'shruthi', 'shruthi3')).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update and deleteOne touch the named client row only', async () => {
        await service.update('sib', 'shruthi', 'shruthi2', { count: 9 } as any);
        await service.deleteOne('sib', 'shruthi', 'shruthi1');
        const rows = await model.find({ chatId: 'sib' }).lean().exec();
        expect(rows.map((r: any) => [r.client, r.count])).toEqual([['shruthi2', 9]]);
    });
});

describe('StatController requires ?client= on the single-row routes', () => {
    const svc = { findByChatIdAndProfile: jest.fn(), update: jest.fn(), deleteOne: jest.fn() };
    const controller = new StatController(svc as any);
    afterEach(() => jest.clearAllMocks());

    test.each([undefined, '', '   '])('client %p is a 400 and reaches no service call', async (client) => {
        await expect(controller.findByChatIdAndProfile('x', 'p', client as any)).rejects.toBeInstanceOf(BadRequestException);
        await expect(controller.update('x', 'p', client as any, { count: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);
        await expect(controller.deleteOne('x', 'p', client as any)).rejects.toBeInstanceOf(BadRequestException);
        expect(svc.findByChatIdAndProfile).not.toHaveBeenCalled();
        expect(svc.update).not.toHaveBeenCalled();
        expect(svc.deleteOne).not.toHaveBeenCalled();
    });

    test('the client is trimmed and passed through', async () => {
        await controller.findByChatIdAndProfile('x', 'p', ' c1 ');
        expect(svc.findByChatIdAndProfile).toHaveBeenCalledWith('x', 'p', 'c1');
    });
});
