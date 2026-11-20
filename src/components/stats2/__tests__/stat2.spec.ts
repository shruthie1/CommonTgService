import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { UpdateStat2Dto } from '../update-stat2.dto';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { Stat2Service } from '../stat2.service';
import { Stat2Controller } from '../stat2.controller';
import { StatSchema, Stat2Document } from '../stat2.schema';

function makeStatData(overrides: Partial<any> = {}): any {
    return {
        chatId: 'chat-1',
        count: 1,
        payAmount: 0,
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

describe('Stat2Service (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<Stat2Document>;
    let service: Stat2Service;

    beforeAll(async () => {
        ctx = await startMongo('stat2-svc-test');
        connection = ctx.connection;
        model = connection.model<Stat2Document>('Stat2GroupB', StatSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
    });

    beforeEach(() => {
        service = new Stat2Service(model);
    });

    test('create persists a stat', async () => {
        const created = await service.create(makeStatData());
        expect(created.chatId).toBe('chat-1');
    });

    test('findAll returns all stats', async () => {
        await service.create(makeStatData({ chatId: 'a', client: 'c1' }));
        await service.create(makeStatData({ chatId: 'b', client: 'c2' }));
        expect(await service.findAll()).toHaveLength(2);
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
        await service.deleteAll();
        expect(await model.countDocuments()).toBe(0);
    });
});

describe('Stat2Controller', () => {
    const svc = {
        create: jest.fn(),
        findByChatIdAndProfile: jest.fn(),
        update: jest.fn(),
        deleteOne: jest.fn(),
        deleteAll: jest.fn(),
    };
    const controller = new Stat2Controller(svc as any);

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

describe('Stat2Service sibling clients (stats2 audit A4): every single-row op matches client too', () => {
    let ctx: MongoTestContext;
    let model: Model<Stat2Document>;
    let service: Stat2Service;

    beforeAll(async () => {
        ctx = await startMongo('stat2-sibling-a4');
        model = ctx.connection.model<Stat2Document>('Stat2SiblingA4', StatSchema);
        await model.syncIndexes();
    });
    afterAll(async () => { await stopMongo(ctx); });
    beforeEach(async () => {
        await model.deleteMany({}).exec();
        service = new Stat2Service(model);
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

describe('Stat2Controller requires ?client= on the single-row routes', () => {
    const svc = { findByChatIdAndProfile: jest.fn(), update: jest.fn(), deleteOne: jest.fn() };
    const controller = new Stat2Controller(svc as any);
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

describe('Stat2Service payAmount is paid-today (owner 2026-11-20): the HTTP writes cannot set it', () => {
    let ctx: MongoTestContext;
    let model: Model<Stat2Document>;
    let service: Stat2Service;

    beforeAll(async () => {
        ctx = await startMongo('stat2-payamount');
        model = ctx.connection.model<Stat2Document>('Stat2PayAmount', StatSchema);
    });
    afterAll(async () => { await stopMongo(ctx); });
    beforeEach(async () => {
        await model.deleteMany({}).exec();
        service = new Stat2Service(model);
    });

    test('create with a non-zero payAmount is a 400 and writes nothing; 0 is accepted', async () => {
        await expect(service.create(makeStatData({ chatId: 'pa', payAmount: 150 }))).rejects.toBeInstanceOf(BadRequestException);
        expect(await model.countDocuments()).toBe(0);
        await service.create(makeStatData({ chatId: 'pa', payAmount: 0 }));
        expect(await model.countDocuments()).toBe(1);
    });

    test('update carrying payAmount (any value) is a 400 and leaves the stored amount unchanged', async () => {
        await service.create(makeStatData({ chatId: 'pb', payAmount: 0 }));
        await model.updateOne({ chatId: 'pb' }, { $set: { payAmount: 50 } }).exec(); // a credit, as tg-aut writes it
        for (const payAmount of [0, 10, 500]) {
            await expect(service.update('pb', 'profile-1', 'client-1', { payAmount } as any)).rejects.toBeInstanceOf(BadRequestException);
        }
        expect((await model.findOne({ chatId: 'pb' }).lean().exec())?.payAmount).toBe(50);
        const updated = await service.update('pb', 'profile-1', 'client-1', { count: 7 } as any);
        expect([updated.count, updated.payAmount]).toEqual([7, 50]);
    });

    test('an update operator in the body, through the app ValidationPipe, is a 400 and leaves the amount (Codex r2)', async () => {
        // Same options as src/main.ts: transform, implicit conversion, no whitelist.
        const pipe = new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } });
        const viaPipe = (body: unknown) => pipe.transform(body, { type: 'body', metatype: UpdateStat2Dto });
        await service.create(makeStatData({ chatId: 'pc', payAmount: 0 }));
        await model.updateOne({ chatId: 'pc' }, { $set: { payAmount: 50 } }).exec();
        for (const body of [{ $set: { payAmount: 500 } }, { count: 2, $inc: { payAmount: 100 } }, { $max: { payAmount: 999 } }]) {
            const dto = await viaPipe(body);
            await expect(service.update('pc', 'profile-1', 'client-1', dto)).rejects.toBeInstanceOf(BadRequestException);
        }
        const stored = await model.findOne({ chatId: 'pc' }).lean().exec();
        expect([stored?.payAmount, stored?.count]).toEqual([50, 1]);
        const updated = await service.update('pc', 'profile-1', 'client-1', await viaPipe({ count: 3, paidReply: true, junk: 1 }));
        expect([updated.count, updated.paidReply, updated.payAmount, (updated as any).junk]).toEqual([3, true, 50, undefined]);
    });
});
