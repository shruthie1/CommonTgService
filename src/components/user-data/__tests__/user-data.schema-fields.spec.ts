/**
 * UserData schema contract: the six tg-platform-owned fields must be declared (kept),
 * and undeclared fields must NOT be persisted (strict mode stays on).
 * Real MongoDB (mongodb-memory-server) through the real service.
 */
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserDataDocument, UserDataSchema } from '../schemas/user-data.schema';
import { UserDataService } from '../user-data.service';

const base = (chatId: string): any => ({
    chatId, profile: 'p1', totalCount: 1, picCount: 0, lastMsgTimeStamp: Date.now(), limitTime: 0,
    paidCount: 0, prfCount: 0, canReply: 1, payAmount: 0, highestPayAmount: 0, cheatCount: 0, callTime: 0,
});
const OWNED = { lifetimePaid: 499, lifetimeCredits: 2, creditKeys: ['k1', 'k2'], firstPaidAt: 1760000000000, msgCount: 7, windowCount: 3 };

describe('UserData schema field contract', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<UserDataDocument>;
    let service: UserDataService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'user-data-schema-fields' }).asPromise();
        model = connection.model<UserDataDocument>('UserDataSchemaFields', UserDataSchema);
        await model.init();
        service = new UserDataService(model as any);
    });
    afterEach(async () => { await model.deleteMany({}); });
    afterAll(async () => { await connection.dropDatabase(); await connection.close(); await mongod.stop(); });

    const raw = (chatId: string) => model.collection.findOne({ chatId });

    it('keeps all six tg-platform fields on create', async () => {
        await service.create({ ...base('c1'), ...OWNED } as any);
        const row: any = await raw('c1');
        for (const [k, v] of Object.entries(OWNED)) expect(row[k]).toEqual(v);
    });

    it('keeps all six tg-platform fields on update', async () => {
        await service.create(base('c2') as any);
        await service.update('p1', 'c2', { ...OWNED } as any);
        const row: any = await raw('c2');
        for (const [k, v] of Object.entries(OWNED)) expect(row[k]).toEqual(v);
    });

    it('does not materialise the optional fields on a plain create (no phantom defaults)', async () => {
        await service.create(base('c3') as any);
        const row: any = await raw('c3');
        for (const k of Object.keys(OWNED)) expect(row).not.toHaveProperty(k);
    });

    it('does not persist an undeclared field on create', async () => {
        await service.create({ ...base('c4'), evilField: 'x' } as any);
        expect(await raw('c4')).not.toHaveProperty('evilField');
    });

    it('does not persist an undeclared field on update', async () => {
        await service.create(base('c5') as any);
        await service.update('p1', 'c5', { evilField: 'x' } as any);
        expect(await raw('c5')).not.toHaveProperty('evilField');
    });
});
