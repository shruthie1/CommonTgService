import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClient, BufferClientSchema } from '../schemas/buffer-client.schema';

describe('BufferClient Mongo integration', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let BufferClientModel: Model<BufferClient>;

  const createBufferClient = (overrides: Partial<BufferClient> = {}) => ({
    tgId: `tg-${Math.random().toString(36).slice(2, 10)}`,
    mobile: `+1555${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`,
    session: `session-${Math.random().toString(36).slice(2, 12)}`,
    availableDate: '2026-04-11',
    channels: 0,
    clientId: 'main-client-1',
    ...overrides,
  });

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({
      instance: {
        ip: '127.0.0.1',
      },
    });
    connection = await mongoose.createConnection(mongod.getUri(), {
      dbName: 'buffer-client-integration',
    }).asPromise();
    BufferClientModel = connection.model<BufferClient>('BufferClientIntegration', BufferClientSchema);
    await BufferClientModel.init();
  });

  afterEach(async () => {
    if (BufferClientModel) {
      await BufferClientModel.deleteMany({});
    }
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  it('applies schema defaults and timestamps when creating a buffer client', async () => {
    const created = await BufferClientModel.create(createBufferClient());
    const found = await BufferClientModel.findById(created._id).lean();

    expect(found).toBeTruthy();
    expect(found?.message).toBe('Account is functioning properly');
    expect(found?.status).toBe('active');
    expect(found?.inUse).toBe(false);
    expect(found?.failedUpdateAttempts).toBe(0);
    expect(found?.warmupJitter).toBe(0);
    expect(found?.assignedProfilePics).toEqual([]);
    expect(found?.username).toBeNull();
    expect(found?.enrolledAt).toBeNull();
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.updatedAt).toBeInstanceOf(Date);
  });

  it('matches both null and missing warmup dates with `{ enrolledAt: null }`', async () => {
    await BufferClientModel.create(createBufferClient({
      mobile: '+155500000001',
      session: 'session-null',
      enrolledAt: null,
    }));

    await connection.db.collection('bufferClients').insertOne(createBufferClient({
      mobile: '+155500000002',
      session: 'session-missing',
      clientId: 'main-client-2',
    }));

    const matches = await BufferClientModel.find({ enrolledAt: null }).lean();
    const matchedMobiles = matches.map((doc) => doc.mobile).sort();

    expect(matchedMobiles).toEqual(['+155500000001', '+155500000002']);
  });

  it('persists warmup progress through findOneAndUpdate', async () => {
    const created = await BufferClientModel.create(createBufferClient({
      mobile: '+155500000003',
      session: 'session-update',
    }));
    const stepCompletedAt = new Date('2026-04-11T10:00:00.000Z');

    const updated = await BufferClientModel.findOneAndUpdate(
      { _id: created._id },
      {
        $set: {
          warmupPhase: 'settling',
          privacyUpdatedAt: stepCompletedAt,
          lastUpdateAttempt: stepCompletedAt,
        },
      },
      { new: true },
    ).lean();

    expect(updated?.warmupPhase).toBe('settling');
    expect(updated?.privacyUpdatedAt?.toISOString()).toBe(stepCompletedAt.toISOString());
    expect(updated?.lastUpdateAttempt?.toISOString()).toBe(stepCompletedAt.toISOString());
    expect(updated?.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces the partial unique client reservation index only when inUse is true', async () => {
    await BufferClientModel.create(createBufferClient({
      mobile: '+155500000004',
      session: 'session-free-1',
      clientId: 'main-client-unique',
      inUse: false,
    }));
    await BufferClientModel.create(createBufferClient({
      mobile: '+155500000005',
      session: 'session-free-2',
      clientId: 'main-client-unique',
      inUse: false,
    }));
    await BufferClientModel.create(createBufferClient({
      mobile: '+155500000006',
      session: 'session-busy-1',
      clientId: 'main-client-unique',
      inUse: true,
    }));

    await expect(
      BufferClientModel.create(createBufferClient({
        mobile: '+155500000007',
        session: 'session-busy-2',
        clientId: 'main-client-unique',
        inUse: true,
      })),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
