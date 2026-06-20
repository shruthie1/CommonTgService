jest.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(async () => undefined),
}));
jest.mock('../../../utils/logbots', () => ({
  notifbot: () => 'https://api.telegram.org/botX/sendMessage?chat_id=1',
}));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: {
    getClient: jest.fn(),
    unregisterClient: jest.fn(async () => undefined),
    shutdown: jest.fn(async () => undefined),
  },
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException } from '@nestjs/common';
import { PromoteClientService } from '../promote-client.service';
import { PromoteClient, PromoteClientSchema, PromoteClientDocument } from '../schemas/promote-client.schema';

function makePromoteDoc(overrides: Partial<PromoteClient> = {}): any {
  return {
    tgId: `tg-${Math.random().toString(36).slice(2)}`,
    mobile: `15550${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`,
    lastActive: 'default',
    availableDate: '2026-06-20',
    channels: 100,
    clientId: 'cid-1',
    status: 'active',
    session: `sess-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

describe('PromoteClientService (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<PromoteClientDocument>;
  let service: PromoteClientService;
  let botsService: any;

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'promoteSvc' }).asPromise();
    model = connection.model<PromoteClientDocument>('PromoteClientSvcTest', PromoteClientSchema);
    await model.init();
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await model.deleteMany({});
    botsService = { sendMessageByCategory: jest.fn(async () => undefined) };
    const noop = () => ({});
    const telegramService: any = { hasActiveClientSetup: jest.fn(() => false) };
    const usersService: any = { search: jest.fn(async () => []), expireAccount: jest.fn(async () => undefined) };
    const activeChannelsService: any = {};
    const clientService: any = { findAll: jest.fn(async () => []), getActiveClientAssignment: jest.fn(async () => null) };
    const channelsService: any = {};
    const bufferClientService: any = { existsByMobile: jest.fn(async () => false), model: { find: () => ({ lean: async () => [] }) } };
    const sessionService: any = {};
    service = new PromoteClientService(
      model as any, telegramService, usersService, activeChannelsService,
      clientService, channelsService, bufferClientService, sessionService, botsService,
    );
    void noop;
  });

  // ── create / session guard ───────────────────────────────────────────────
  describe('create', () => {
    test('active promote client requires a session', async () => {
      await expect(service.create(makePromoteDoc({ session: undefined, status: 'active' }) as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    test('rejects whitespace session for active client', async () => {
      await expect(service.create(makePromoteDoc({ session: '   ', status: 'active' }) as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── update / session guard ───────────────────────────────────────────────
  describe('update', () => {
    test('does not overwrite stored session with whitespace', async () => {
      await model.create(makePromoteDoc({ mobile: '15551110001', session: 'GOOD' }));
      await expect(service.update('15551110001', { session: '   ' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      const after = await model.findOne({ mobile: '15551110001' }).lean();
      expect(after?.session).toBe('GOOD');
    });

    test('lastUsed update on active client with stored session succeeds', async () => {
      await model.create(makePromoteDoc({ mobile: '15551110002', session: 'GOOD', status: 'active' }));
      const r = await service.update('15551110002', { lastUsed: new Date() } as any);
      expect(r.mobile).toBe('15551110002');
    });
  });

  // ── markAsActive: must not resurrect a permanently-retired (banned) account ──
  describe('markAsActive / status transitions', () => {
    test('markAsActive flips an inactive promote client back to active', async () => {
      // Baseline behavior documentation: with a stored session, markAsActive succeeds.
      await model.create(makePromoteDoc({ mobile: '15551110003', session: 'S', status: 'inactive' }));
      const r = await service.markAsActive('15551110003');
      expect(r.status).toBe('active');
    });
  });

  // ── createOrUpdate ───────────────────────────────────────────────────────
  describe('createOrUpdate', () => {
    test('updates an existing doc rather than creating a duplicate', async () => {
      await model.create(makePromoteDoc({ mobile: '15551110004', channels: 100, session: 'S' }));
      await service.createOrUpdate('15551110004', { channels: 250 } as any);
      const docs = await model.find({ mobile: '15551110004' });
      expect(docs.length).toBe(1);
      expect(docs[0].channels).toBe(250);
    });
  });

  // ── availableDate normalization ──────────────────────────────────────────
  describe('availableDate', () => {
    test('a stored ISO datetime is normalized to date-only so $lte:today selection still matches', async () => {
      await model.create(makePromoteDoc({ mobile: '15551110005', availableDate: '2026-06-12T18:30:00Z' as any }));
      const doc = await model.findOne({ mobile: '15551110005' }).lean();
      expect(doc?.availableDate).toBe('2026-06-12');
    });
  });

  // ── getLeastRecentlyUsedPromoteClients eligibility ───────────────────────
  describe('getLeastRecentlyUsedPromoteClients eligibility', () => {
    test('excludes inUse / non-session_rotated / future-availableDate accounts; returns only ready ones', async () => {
      const today = new Date().toISOString().split('T')[0];
      const future = '2999-01-01';
      // eligible
      await model.create(makePromoteDoc({ mobile: '15552220001', clientId: 'c-lru', status: 'active', inUse: false, warmupPhase: 'session_rotated' as any, availableDate: today, session: 'S1' }));
      // not session_rotated
      await model.create(makePromoteDoc({ mobile: '15552220002', clientId: 'c-lru', status: 'active', inUse: false, warmupPhase: 'ready' as any, availableDate: today, session: 'S2' }));
      // inUse
      await model.create(makePromoteDoc({ mobile: '15552220003', clientId: 'c-lru', status: 'active', inUse: true, warmupPhase: 'session_rotated' as any, availableDate: today, session: 'S3' }));
      // future availableDate
      await model.create(makePromoteDoc({ mobile: '15552220004', clientId: 'c-lru', status: 'active', inUse: false, warmupPhase: 'session_rotated' as any, availableDate: future, session: 'S4' }));
      // inactive
      await model.create(makePromoteDoc({ mobile: '15552220005', clientId: 'c-lru', status: 'inactive', inUse: false, warmupPhase: 'session_rotated' as any, availableDate: today, session: 'S5' }));

      const r = await service.getLeastRecentlyUsedPromoteClients('c-lru', 10);
      const mobiles = r.map((d: any) => d.mobile).sort();
      expect(mobiles).toEqual(['15552220001']);
    });
  });

  // ── search ───────────────────────────────────────────────────────────────
  describe('search', () => {
    test('canonicalizes mobile and returns the right client', async () => {
      await model.create(makePromoteDoc({ mobile: '15551110006', session: 'S' }));
      const r = await service.search({ mobile: '+15551110006' } as any);
      expect(r.length).toBe(1);
      expect(r[0].mobile).toBe('15551110006');
    });
  });
});
