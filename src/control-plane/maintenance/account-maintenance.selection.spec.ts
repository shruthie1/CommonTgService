jest.mock('telegram/Helpers', () => ({
  ...jest.requireActual('telegram/Helpers'),
  sleep: jest.fn(async () => undefined),
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AccountMaintenanceService } from './account-maintenance.service';
import { connectionManager } from '../../components';
import { UsersService } from '../../components/users/users.service';
import { UserSchema } from '../../components/users/schemas/user.schema';

// Runs the real selection query and the real UsersService.updateByFilter against
// mongodb-memory-server, so the users schema (canonicalizeMobile setter, timestamps)
// behaves exactly as in production.
describe('AccountMaintenanceService raw-user selection and retry state', () => {
  const HOUR = 60 * 60 * 1000;
  const old = new Date('2026-01-01T00:00:00Z');
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<any>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'account-maintenance-test' }).asPromise();
    model = connection.model<any>('MaintenanceUsers', UserSchema);
    await model.init();
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
    await mongod.stop();
  });

  function makeManager(phone: string) {
    const dialogs: any = [];
    dialogs.total = 0;
    return {
      getLastForeignActiveDate: jest.fn().mockResolvedValue(null),
      getMe: jest.fn().mockResolvedValue({ phone, firstName: 'A', id: { toString: () => '777' } }),
      getSelfMSgsInfo: jest.fn().mockResolvedValue({ total: 0 }),
      getDialogs: jest.fn().mockResolvedValue(dialogs),
      getContacts: jest.fn().mockResolvedValue({ savedCount: 0 }),
      hasPassword: jest.fn().mockResolvedValue(true),
      getCallLogStats: jest.fn().mockResolvedValue(null),
      setOnlineStatus: jest.fn().mockResolvedValue(undefined),
    };
  }

  function createService() {
    // Real UsersService methods over the test model; the telegram lookup in the
    // default list query is best-effort (wrapped in try/catch) in the real code.
    const usersService = Object.assign(Object.create(UsersService.prototype), {
      userModel: model,
      telegramService: { getOwnAccountMobiles: jest.fn().mockResolvedValue([]) },
      delete: jest.fn().mockResolvedValue(undefined),
    });
    const pool = { findAll: jest.fn().mockResolvedValue([]) };
    const channels = {
      createMultiple: jest.fn().mockResolvedValue('ok'),
      findExistingChannelIds: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountMaintenanceService(
      usersService,
      channels as any,
      channels as any,
      pool as any,
      pool as any,
    );
    return { service, usersService };
  }

  async function seed(docs: Array<Record<string, unknown>>) {
    await model.collection.insertMany(
      docs.map((doc, i) => ({
        tgId: '777',
        session: `session-${i}-${Math.random()}`,
        expired: false,
        createdAt: old,
        updatedAt: old,
        ...doc,
      })),
    );
  }

  it('logs into a mobile with 8 duplicate docs once and processes its newest doc', async () => {
    await seed(Array.from({ length: 8 }, (_, i) => ({
      mobile: '919999996221',
      updatedAt: new Date(old.getTime() + i * 1000),
    })));
    const getClient = jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeManager('919999996221') as any);
    jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
    const { service } = createService();
    const updateUser = jest.spyOn(service as any, 'updateUser');

    const result = await service.processEligibleUsers(400, 0);

    expect(getClient).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
    expect((updateUser.mock.calls[0][0] as any).updatedAt).toEqual(new Date(old.getTime() + 7000));
  });

  it('counts the limit in mobiles, not in duplicate docs', async () => {
    await seed([
      { mobile: '919999990001' }, { mobile: '919999990001' }, { mobile: '919999990001' },
      { mobile: '919999990002', tgId: '778' }, { mobile: '919999990002', tgId: '778' },
      { mobile: '919999990003', tgId: '779' },
    ]);
    const getClient = jest.spyOn(connectionManager, 'getClient').mockImplementation(async (mobile) => makeManager(mobile) as any);
    jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
    const { service } = createService();

    await service.processEligibleUsers(2, 0);

    expect(getClient.mock.calls.map(([mobile]) => mobile)).toEqual(['919999990001', '919999990002']);
  });

  it('refreshes the doc when getMe returns an empty phone instead of failing on the mobile setter', async () => {
    await seed([{ mobile: '919999996221' }]);
    jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeManager('') as any);
    jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
    const { service } = createService();

    await expect((service as any).updateUser(await model.collection.findOne({}))).resolves.toBeUndefined();

    const stored: any = await model.collection.findOne({});
    expect(stored.updatedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(stored.mobile).toBe('919999996221');
    expect(stored.firstName).toBe('A');
    expect(stored.maintenanceFailures).toBe(0);
  });

  it('records exponential backoff on a transient failure and the next selection skips the row', async () => {
    await seed([{ mobile: '919999996221' }, { mobile: '919999996221' }]);
    jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('500: INTERDC_4_CALL_ERROR'));
    const { service, usersService } = createService();
    const findEligible = () => (service as any).findEligibleUsers(400, 0);

    const before = Date.now();
    await service.processEligibleUsers(400, 0);

    const docs: any[] = await model.collection.find({}).toArray();
    for (const doc of docs) {
      expect(doc.maintenanceFailures).toBe(1);
      expect(doc.maintenanceRetryAt.getTime()).toBeGreaterThanOrEqual(before + 3 * HOUR);
      expect(doc.maintenanceRetryAt.getTime()).toBeLessThan(before + 3 * HOUR + 60_000);
    }
    expect(usersService.delete).not.toHaveBeenCalled();

    // Isolate the retry gate from the staleness window: put updatedAt back.
    await model.collection.updateMany({}, { $set: { updatedAt: old } });
    expect(await findEligible()).toHaveLength(0);

    await model.collection.updateMany({}, { $set: { maintenanceRetryAt: new Date(Date.now() - 1000) } });
    expect(await findEligible()).toHaveLength(1);

    // Second failure doubles the delay.
    await service.processEligibleUsers(400, 0);
    const second: any = await model.collection.findOne({});
    expect(second.maintenanceFailures).toBe(2);
    expect(second.maintenanceRetryAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 6 * HOUR - 60_000);

    // Hard stop: after 5 failures the row is never selected again.
    await model.collection.updateMany({}, { $set: { updatedAt: old, maintenanceFailures: 5, maintenanceRetryAt: new Date(0) } });
    expect(await findEligible()).toHaveLength(0);
  });

  it('caps the backoff delay at 7 days', () => {
    const { service } = createService();
    const delay = (failures: number) => (service as any).maintenanceRetryDelayMs(failures);
    expect(delay(1)).toBe(3 * HOUR);
    expect(delay(4)).toBe(24 * HOUR);
    expect(delay(10)).toBe(7 * 24 * HOUR);
  });

  it('backs off a legacy 10-digit stored mobile that fails before login', async () => {
    await seed([{ mobile: '9876549574' }]);
    jest.spyOn(connectionManager, 'getClient').mockRejectedValue(
      new Error('mobile must include country code and contain 11-15 digits'),
    );
    const { service } = createService();

    await service.processEligibleUsers(400, 0);

    const stored: any = await model.collection.findOne({});
    expect(stored.maintenanceFailures).toBe(1);
    expect(stored.maintenanceRetryAt.getTime()).toBeGreaterThan(Date.now());
    await model.collection.updateMany({}, { $set: { updatedAt: old } });
    expect(await (service as any).findEligibleUsers(400, 0)).toHaveLength(0);
  });

  it('clears the retry state after a successful refresh', async () => {
    await seed([{ mobile: '919999996221', maintenanceFailures: 3, maintenanceRetryAt: new Date(Date.now() - 1000) }]);
    jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeManager('919999996221') as any);
    jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
    const { service } = createService();

    await service.processEligibleUsers(400, 0);

    const stored: any = await model.collection.findOne({});
    expect(stored.maintenanceFailures).toBe(0);
    expect(stored.maintenanceRetryAt).toBeNull();
  });
});
