// Mock true externals (network/bots/logbots) used by buffer-client.service paths.
jest.mock('../../../utils/logbots', () => ({
  notifbot: () => 'https://api.telegram.org/botX/sendMessage?chat_id=1',
}));
const mockFetchWithTimeout = jest.fn(async () => undefined);
jest.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: any[]) => (mockFetchWithTimeout as any)(...args),
}));
// Mock the Telegram connection manager (true external — GramJS network).
const mockGetClient = jest.fn(async () => ({ client: {}, hasPassword: async () => false }));
const mockUnregister = jest.fn(async () => undefined);
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: {
    getClient: (...a: any[]) => (mockGetClient as any)(...a),
    unregisterClient: (...a: any[]) => (mockUnregister as any)(...a),
  },
  unregisterClient: (...a: any[]) => (mockUnregister as any)(...a),
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BufferClientService } from '../buffer-client.service';
import { BufferClient, BufferClientSchema, BufferClientDocument } from '../schemas/buffer-client.schema';
import { __resetEnrollmentLocks } from '../../shared/enrollment-lock';

// ─── helpers ─────────────────────────────────────────────────────────────────
function bufferDoc(overrides: Partial<BufferClient> = {}) {
  return {
    tgId: `tg-${Math.random().toString(36).slice(2, 10)}`,
    mobile: `1555${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`,
    session: `session-${Math.random().toString(36).slice(2, 12)}`,
    availableDate: '2026-04-11',
    channels: 0,
    clientId: 'main-client-1',
    ...overrides,
  };
}

describe('BufferClientService (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<BufferClientDocument>;
  let service: BufferClientService;

  // collaborator stubs
  let botsService: any;
  let telegramService: any;
  let usersService: any;
  let activeChannelsService: any;
  let clientService: any;
  let channelsService: any;
  let sessionService: any;
  let promoteClientService: any;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'bufferClientSvc' }).asPromise();
    model = connection.model<BufferClientDocument>('bufferClientModule', BufferClientSchema);
    await model.init();
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetEnrollmentLocks();
    await model.deleteMany({});

    botsService = { sendMessageByCategory: jest.fn(async () => undefined) };
    telegramService = {
      hasActiveClientSetup: jest.fn(() => false),
      getChannelInfo: jest.fn(async () => ({ ids: [] })),
      updateUsernameForAClient: jest.fn(async () => 'someusername'),
    };
    usersService = {
      search: jest.fn(async () => []),
      expireAccount: jest.fn(async () => undefined),
    };
    activeChannelsService = { getActiveChannels: jest.fn(async () => []) };
    promoteClientService = {
      existsByMobile: jest.fn(async () => false),
      model: { find: jest.fn(() => ({ lean: jest.fn(async () => []) })) },
    };
    clientService = {
      findAll: jest.fn(async () => []),
      getActiveClientAssignment: jest.fn(async () => null),
    };
    channelsService = { getActiveChannels: jest.fn(async () => []) };
    sessionService = {};

    service = new BufferClientService(
      model as any,
      telegramService,
      usersService,
      activeChannelsService,
      clientService,
      channelsService,
      promoteClientService,
      sessionService,
      botsService,
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('setPrimaryInUse', () => {
    test('assigns the target mobile as the sole in-use primary and revokes the old one', async () => {
      await model.create(bufferDoc({ mobile: '15550000001', clientId: 'c1', inUse: true }));
      await model.create(bufferDoc({ mobile: '15550000002', clientId: 'c1', inUse: false }));

      const res = await service.setPrimaryInUse('c1', '15550000002');
      expect(res.inUse).toBe(true);

      const old = await model.findOne({ mobile: '15550000001' });
      const neu = await model.findOne({ mobile: '15550000002' });
      expect(old?.inUse).toBe(false);
      expect(neu?.inUse).toBe(true);
      const inUseCount = await model.countDocuments({ clientId: 'c1', inUse: true });
      expect(inUseCount).toBe(1);
    });

    test('does NOT revoke the old primary when the new target mobile does not exist (atomicity)', async () => {
      await model.create(bufferDoc({ mobile: '15550000010', clientId: 'c2', inUse: true }));

      await expect(service.setPrimaryInUse('c2', '15550000099')).rejects.toBeInstanceOf(NotFoundException);

      // The old primary should still be in-use — we threw without a replacement, so
      // leaving the client with ZERO in-use primaries is a regression.
      const old = await model.findOne({ mobile: '15550000010' });
      expect(old?.inUse).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('create cross-pool dedup (enrollment lock)', () => {
    test('two concurrent creates of the same mobile do not both succeed (one rejected as duplicate)', async () => {
      const dto = (clientId: string) => ({
        tgId: 'tgX',
        mobile: '15551230001',
        session: 'sess-x',
        availableDate: '2026-04-11',
        channels: 0,
        clientId,
      });
      const results = await Promise.allSettled([
        service.create(dto('cc1') as any),
        service.create(dto('cc2') as any),
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      const docs = await model.find({ mobile: '15551230001' });
      // The mobile unique index guarantees at most one doc; both should not silently succeed.
      expect(docs.length).toBe(1);
      expect(fulfilled).toBe(1);
    });

    test('create rejects when mobile already enrolled in promoteClients (cross-pool guard)', async () => {
      promoteClientService.existsByMobile = jest.fn(async () => true);
      await expect(service.create({
        tgId: 'tgY', mobile: '15551230002', session: 's', availableDate: '2026-04-11', channels: 0, clientId: 'cc3',
      } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('setAsBufferClient cross-pool guard', () => {
    test('refuses to enroll a mobile that already lives in the promote pool', async () => {
      // Source user exists with a session; the mobile is already a promote client.
      usersService.search = jest.fn(async () => [{ tgId: 'tgZ', session: 'usersession', mobile: '15557770001' }]);
      promoteClientService.existsByMobile = jest.fn(async () => true);
      telegramService.getChannelInfo = jest.fn(async () => ({ ids: ['a', 'b'] }));

      // Enrolling the same account as BOTH a buffer and a promote client produces TWO
      // live sessions on one Telegram account => SESSION_REVOKED (permanent loss).
      await expect(service.setAsBufferClient('15557770001', 'mainC')).rejects.toBeInstanceOf(BadRequestException);

      const created = await model.findOne({ mobile: '15557770001' });
      expect(created).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('update activation guard', () => {
    test('cannot activate a buffer client that has no stored session', async () => {
      // Insert an inactive doc with an empty session bypassing the create-path guard.
      await model.collection.insertOne({
        tgId: 't', mobile: '15559990001', session: '', availableDate: '2026-04-11',
        channels: 0, clientId: 'u1', status: 'inactive', inUse: false,
      });
      await expect(service.update('15559990001', { status: 'active' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
