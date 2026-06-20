// Mock true externals. Network notify + fetch are stubbed so no real HTTP happens.
jest.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(async () => undefined),
}));
jest.mock('../../../utils/logbots', () => ({
  notifbot: () => 'https://api.telegram.org/botX/sendMessage?chat_id=1',
}));
// connectionManager touches GramJS / network — stub it.
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: {
    getClient: jest.fn(),
    unregisterClient: jest.fn(async () => undefined),
    shutdown: jest.fn(async () => undefined),
  },
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientService } from '../client.service';
import { Client, ClientSchema, ClientDocument } from '../schemas/client.schema';

function makeClientDoc(overrides: Partial<Client> = {}): any {
  return {
    channelLink: 'https://t.me/chan',
    dbcoll: 'coll1',
    link: 'https://example.com/x',
    name: 'Alice',
    mobile: `15550${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`,
    password: 'Ajtdmwajt1@',
    repl: 'https://example.com/repl',
    promoteRepl: 'https://example.com/promote',
    session: `sess-${Math.random().toString(36).slice(2)}`,
    username: `user_${Math.random().toString(36).slice(2, 8)}`,
    clientId: `cid-${Math.random().toString(36).slice(2, 8)}`,
    deployKey: 'https://example.com/deploy',
    product: 'prod',
    ...overrides,
  };
}

describe('ClientService (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<ClientDocument>;
  let service: ClientService;
  let telegramService: any;
  let bufferClientService: any;
  let usersService: any;

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'clientSvc' }).asPromise();
    model = connection.model<ClientDocument>('ClientSvcTest', ClientSchema);
    await model.init();
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await model.deleteMany({});
    telegramService = {
      getActiveClientSetup: jest.fn(),
      setActiveClientSetup: jest.fn(),
      clearActiveClientSetup: jest.fn(),
      hasActiveClientSetup: jest.fn(() => false),
    };
    bufferClientService = {
      executeQuery: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      createOrUpdate: jest.fn(async () => ({})),
      setPrimaryInUse: jest.fn(async () => ({})),
      getOrEnsureDistinctUsersBackupSession: jest.fn(),
      model: { findOne: () => ({ lean: async () => null }), find: () => ({ lean: async () => [] }) },
    };
    usersService = {
      expireAccount: jest.fn(async () => undefined),
      search: jest.fn(async () => []),
    };
    service = new ClientService(model as any, telegramService, bufferClientService, usersService);
    // Mark initialized without starting timers/refresh loops.
    (service as any).isInitialized = true;
  });

  // ── update / session write integrity ─────────────────────────────────────
  describe('update session-write integrity', () => {
    test('rejects overwriting a good session with a blank/whitespace session (account loss guard)', async () => {
      const doc = makeClientDoc({ clientId: 'cid-blank', session: 'GOOD-SESSION' });
      await model.create(doc);
      (service as any).clientsMap.set('cid-blank', doc);

      // Attempt to write a whitespace-only session — must NOT replace the good one.
      await expect(service.update('cid-blank', { session: '   ' } as any))
        .rejects.toBeInstanceOf(BadRequestException);

      const after = await model.findOne({ clientId: 'cid-blank' }).lean();
      expect(after?.session).toBe('GOOD-SESSION');
    });

    test('rejects a null session overwrite as well (account loss guard)', async () => {
      const doc = makeClientDoc({ clientId: 'cid-null', session: 'GOOD-SESSION' });
      await model.create(doc);
      (service as any).clientsMap.set('cid-null', doc);
      await expect(service.update('cid-null', { session: null } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      const after = await model.findOne({ clientId: 'cid-null' }).lean();
      expect(after?.session).toBe('GOOD-SESSION');
    });

    test('update throws NotFound (not phantom upsert) when clientId does not exist', async () => {
      await expect(service.update('does-not-exist', { name: 'X' } as any))
        .rejects.toBeInstanceOf(BadRequestException); // wrapped
      const count = await model.countDocuments({ clientId: 'does-not-exist' });
      expect(count).toBe(0);
    });
  });

  // ── search returns right client / injection ──────────────────────────────
  describe('search', () => {
    test('search by clientId returns the matching client only', async () => {
      await model.create(makeClientDoc({ clientId: 'cid-aaa', name: 'AAA' }));
      await model.create(makeClientDoc({ clientId: 'cid-bbb', name: 'BBB' }));
      const r = await service.search({ clientId: 'cid-aaa' } as any);
      expect(r.length).toBe(1);
      expect(r[0].clientId).toBe('cid-aaa');
    });
  });

  // ── executeQuery pagination ──────────────────────────────────────────────
  describe('executeQuery', () => {
    test('honors limit', async () => {
      await model.create(makeClientDoc({ clientId: 'cid-q1' }));
      await model.create(makeClientDoc({ clientId: 'cid-q2' }));
      const r = await service.executeQuery({}, undefined, 1, 0);
      expect(r.length).toBe(1);
    });
  });

  // ── updateClientSession cutover ──────────────────────────────────────────
  describe('updateClientSession cutover', () => {
    test('rejects an empty replacement session before committing the cutover (no half-swap)', async () => {
      const existing = makeClientDoc({ clientId: 'cid-cut', mobile: '15551110000', session: 'OLD-SESSION', username: 'oldname' });
      await model.create(existing);
      (service as any).clientsMap.set('cid-cut', existing);

      telegramService.getActiveClientSetup.mockReturnValue({
        archiveOld: false,
        clientId: 'cid-cut',
        existingMobile: '15551110000',
        formalities: false,
        newMobile: '15552220000',
        reason: undefined,
        days: 0,
      });
      const { connectionManager } = require('../../Telegram/utils/connection-manager');
      connectionManager.getClient.mockResolvedValue({
        getMe: async () => ({ username: 'newtg' }),
        client: { invoke: async () => ({}) },
      });

      await expect(service.updateClientSession('   ', '15552220000'))
        .rejects.toBeInstanceOf(BadRequestException);

      // Old session must remain intact and mobile unchanged.
      const after = await model.findOne({ clientId: 'cid-cut' }).lean();
      expect(after?.session).toBe('OLD-SESSION');
      expect(after?.mobile).toBe('15551110000');
    });
  });
});
