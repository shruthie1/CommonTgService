// Mock true externals BEFORE importing the service under test.
const mockGetClient = jest.fn();
const mockUnregisterClient = jest.fn();
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: {
    getClient: (...args: any[]) => mockGetClient(...args),
    unregisterClient: (...args: any[]) => mockUnregisterClient(...args),
  },
}));

const mockGenerateTGConfig = jest.fn((..._args: any[]) => Promise.resolve({ apiId: 1, apiHash: 'h', params: {} }));
jest.mock('../../Telegram/utils/generateTGConfig', () => ({
  generateTGConfig: (...args: any[]) => mockGenerateTGConfig(...args),
}));

// Avoid real network / GramJS in createVerifiedSessionClient etc.
jest.mock('telegram', () => ({
  TelegramClient: jest.fn(),
  Api: {
    photos: { GetUserPhotos: class {} },
    account: { GetPassword: class {}, GetPasswordSettings: class {}, GetAuthorizations: class {} },
    help: { GetAppConfig: class {} },
  },
}));
jest.mock('telegram/sessions', () => ({ StringSession: jest.fn() }));
jest.mock('telegram/Password', () => ({ computeCheck: jest.fn() }));

// Make sleep instant so queue tests don't take minutes.
jest.mock('telegram/Helpers', () => ({ sleep: jest.fn(async () => {}) }));

jest.mock('../organic-activity', () => ({
  performOrganicActivity: jest.fn(async () => {}),
  OrganicIntensity: {},
}));

jest.mock('../../../utils/isPermanentError', () => ({
  __esModule: true,
  default: jest.fn(() => false),
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClientSchema, BufferClientDocument } from '../../buffer-clients/schemas/buffer-client.schema';
import {
  BaseClientService,
  BaseClientDocument,
  BaseClientUpdate,
  ClientConfig,
  ClientStatusType,
} from '../base-client.service';
import { Client } from '../../clients';

const DEFAULT_CONFIG: ClientConfig = {
  joinChannelInterval: 60000,
  leaveChannelInterval: 60000,
  leaveChannelBatchSize: 10,
  channelProcessingDelay: 0,
  channelTarget: 200,
  maxJoinsPerSession: 10,
  maxNewClientsPerTrigger: 5,
  minTotalClients: 10,
  maxMapSize: 500,
  cooldownHours: 4,
  clientProcessingDelay: 0,
  maxChannelJoinsPerDay: 20,
  joinsPerMobilePerRound: 3,
};

// Minimal concrete subclass over a real Mongoose model.
class TestClientService extends BaseClientService<BufferClientDocument> {
  constructor(
    private readonly _model: Model<BufferClientDocument>,
    deps: {
      telegramService?: any;
      usersService?: any;
      activeChannelsService?: any;
      clientService?: any;
      channelsService?: any;
      sessionService?: any;
      botsService?: any;
    } = {},
  ) {
    super(
      deps.telegramService || ({} as any),
      deps.usersService || ({} as any),
      deps.activeChannelsService || ({} as any),
      deps.clientService || ({} as any),
      deps.channelsService || ({} as any),
      deps.sessionService || ({} as any),
      deps.botsService || ({ sendMessageByCategory: jest.fn() } as any),
      'TestClientService',
    );
  }

  get model(): Model<BufferClientDocument> {
    return this._model;
  }
  get clientType(): 'buffer' | 'promote' {
    return 'buffer';
  }
  get config(): ClientConfig {
    return DEFAULT_CONFIG;
  }
  async updateNameAndBio(): Promise<number> {
    return 1;
  }
  async updateUsername(): Promise<number> {
    return 1;
  }
  async findOne(mobile: string): Promise<BufferClientDocument | null> {
    return this._model.findOne({ mobile }).exec();
  }
  async update(mobile: string, updateDto: BaseClientUpdate): Promise<BufferClientDocument> {
    return this._model.findOneAndUpdate({ mobile }, { $set: updateDto }, { new: true }).exec() as any;
  }
  async markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument | null> {
    return this._model.findOneAndUpdate({ mobile }, { $set: { status: 'inactive', message: reason } }, { new: true }).exec();
  }
  async updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<BufferClientDocument> {
    return this._model.findOneAndUpdate({ mobile }, { $set: { status, message } }, { new: true }).exec() as any;
  }
  async refillJoinQueue(): Promise<number> {
    return 0;
  }

  // Expose protected members for direct testing.
  public callProcessLeaveSeq() {
    return this.processLeaveChannelSequentially();
  }
  public callProcessJoinSeq() {
    return this.processJoinChannelSequentially();
  }
  public setLeaveMap(mobile: string, channels: string[]) {
    this.leaveChannelMap.set(mobile, channels);
  }
  public setJoinMap(mobile: string, channels: any[]) {
    this.joinChannelMap.set(mobile, channels);
  }
  public getJoinMap() {
    return this.joinChannelMap;
  }
  public getJoinFailureCount(mobile: string): number {
    return this.joinFailureCounts.get(mobile) || 0;
  }
  public getLeaveMap() {
    return this.leaveChannelMap;
  }
}

describe('BaseClientService (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<BufferClientDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'baseClientSvc' }).asPromise();
    model = connection.model<BufferClientDocument>('BufferClientTest', BufferClientSchema as any);
  });

  afterAll(async () => {
    if (connection) {
      await connection.dropDatabase();
      await connection.close();
    }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await model.deleteMany({});
    mockUnregisterClient.mockResolvedValue(undefined);
  });

  async function seed(overrides: Partial<BaseClientDocument> = {}) {
    return model.create({
      tgId: `tg_${Math.random().toString(36).slice(2)}`,
      mobile: `91${Math.floor(1000000000 + Math.random() * 8000000000)}`,
      session: 'sess',
      availableDate: '2020-01-01',
      channels: 100,
      clientId: `cid_${Math.random().toString(36).slice(2)}`,
      status: 'active',
      ...overrides,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  describe('processLeaveChannelSequentially channel-count accounting', () => {
    test('BUG: channels can go negative when leftCount exceeds stored channel count', async () => {
      const doc = await seed({ channels: 3 });
      const mobile = doc.mobile;

      // leaveChannels reports leaving 10 channels (e.g. stored count was stale/low).
      const leaveChannels = jest.fn(async () => ({ successCount: 10, skipCount: 0 }));
      mockGetClient.mockResolvedValue({ leaveChannels });

      const svc = new TestClientService(model);
      svc.setLeaveMap(mobile, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']);

      await svc.callProcessLeaveSeq();

      const after = await model.findOne({ mobile }).exec();
      // channels must never go negative — a negative channel count corrupts every
      // downstream readiness/refill query that compares channels >= threshold.
      expect(after!.channels).toBeGreaterThanOrEqual(0);
    });

    test('decrements only by channels actually left (not the full attempted batch)', async () => {
      const doc = await seed({ channels: 100 });
      const mobile = doc.mobile;

      // Client attempts 5, but only 2 actually left (3 were already gone / skipped).
      const leaveChannels = jest.fn(async () => ({ successCount: 2, skipCount: 3 }));
      mockGetClient.mockResolvedValue({ leaveChannels });

      const svc = new TestClientService(model);
      svc.setLeaveMap(mobile, ['c1', 'c2', 'c3', 'c4', 'c5']);

      await svc.callProcessLeaveSeq();

      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(98);
    });

    test('transient leave failure restores channels to queue and does NOT decrement count', async () => {
      const doc = await seed({ channels: 100 });
      const mobile = doc.mobile;

      const leaveChannels = jest.fn(async () => { throw new Error('TIMEOUT'); });
      mockGetClient.mockResolvedValue({ leaveChannels });

      const svc = new TestClientService(model);
      svc.setLeaveMap(mobile, ['c1', 'c2', 'c3']);

      await svc.callProcessLeaveSeq();

      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(100); // no decrement on failure
      expect(svc.getLeaveMap().get(mobile)).toEqual(['c1', 'c2', 'c3']); // restored
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('processJoinChannelSequentially channel-count accounting', () => {
    test('increments channels only by successful joins', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      const tryJoiningChannel = jest.fn(async () => {});
      const telegramService = {
        tryJoiningChannel,
        getChannelInfo: jest.fn(async () => ({ ids: [] })),
      };
      const activeChannelsService = {
        findOne: jest.fn(async () => null),
        incrementClientsJoined: jest.fn(async () => {}),
      };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      const mkCh = (id: string) => ({ channelId: id, username: `u${id}`, canSendMsgs: true });
      svc.setJoinMap(mobile, [mkCh('1'), mkCh('2'), mkCh('3')]);

      await svc.callProcessJoinSeq();

      const after = await model.findOne({ mobile }).exec();
      // joinsPerMobilePerRound = 3 → all 3 join → 50 + 3 = 53
      expect(after!.channels).toBe(53);
    });

    test('BUG: successful joins before a mid-round transient error are still counted', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      // First two joins succeed; the third throws a transient (non-permanent, non-flood) error.
      const tryJoiningChannel = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('TIMEOUT'));
      const telegramService = {
        tryJoiningChannel,
        getChannelInfo: jest.fn(async () => ({ ids: [] })),
      };
      const activeChannelsService = {
        findOne: jest.fn(async () => null),
        incrementClientsJoined: jest.fn(async () => {}),
      };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      const mkCh = (id: string) => ({ channelId: id, username: `u${id}`, canSendMsgs: true });
      svc.setJoinMap(mobile, [mkCh('1'), mkCh('2'), mkCh('3')]);

      await svc.callProcessJoinSeq();

      const after = await model.findOne({ mobile }).exec();
      // 2 channels were actually joined on Telegram before the 3rd failed.
      // The stored count must reflect those 2 successful joins (50 + 2 = 52),
      // otherwise the DB channel count drifts below reality and the
      // growing→maturing readiness gate is mis-evaluated.
      expect(after!.channels).toBe(52);
    });

    test('dead channel (USERNAME_INVALID) is NOT re-queued and NOT counted as a failure', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      // Single channel that fails with a dead-channel error on join.
      const err: any = new Error('USERNAME_INVALID'); err.errorMessage = 'USERNAME_INVALID';
      const tryJoiningChannel = jest.fn().mockRejectedValue(err);
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null), incrementClientsJoined: jest.fn(async () => {}) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [{ channelId: 'dead1', username: 'udead1', canSendMsgs: true }]);

      await svc.callProcessJoinSeq();

      // NOT re-queued: the mobile's channel list must not contain the dead channel again.
      const remaining = svc.getJoinMap().get(mobile) || [];
      expect(remaining.find((c: any) => c.channelId === 'dead1')).toBeUndefined();
      // NOT counted as a transient failure (that would wrongly quarantine a healthy account).
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
    });

    test('INVITE_REQUEST_SENT counts as success (channel incremented), not re-queued, no failure', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      const err: any = new Error('INVITE_REQUEST_SENT'); err.errorMessage = 'INVITE_REQUEST_SENT';
      const tryJoiningChannel = jest.fn().mockRejectedValue(err);
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null), incrementClientsJoined: jest.fn(async () => {}) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [{ channelId: 'approval1', username: 'uapproval1', canSendMsgs: true }]);

      await svc.callProcessJoinSeq();

      // Treated as a successful join attempt → channel count incremented (50 + 1 = 51).
      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(51);
      // Not re-queued, not a failure.
      const remaining = svc.getJoinMap().get(mobile) || [];
      expect(remaining.find((c: any) => c.channelId === 'approval1')).toBeUndefined();
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
    });

    test('genuine transient error (TIMEOUT) IS re-queued and counted as failure (regression guard)', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      const tryJoiningChannel = jest.fn().mockRejectedValue(new Error('TIMEOUT'));
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null), incrementClientsJoined: jest.fn(async () => {}) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [{ channelId: 'flaky1', username: 'uflaky1', canSendMsgs: true }]);

      await svc.callProcessJoinSeq();

      // Transient: channel restored to the front of the queue AND failure counted.
      const remaining = svc.getJoinMap().get(mobile) || [];
      expect(remaining.find((c: any) => c.channelId === 'flaky1')).toBeDefined();
      expect(svc.getJoinFailureCount(mobile)).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('session rotation distinctness (session-survival)', () => {
    test('createDistinctSessionString never returns the active session', async () => {
      const ACTIVE = 'ACTIVE_SESSION';
      const createNewSession = jest
        .fn()
        .mockResolvedValueOnce(ACTIVE) // first attempt: duplicate
        .mockResolvedValueOnce('FRESH_DISTINCT'); // second attempt: distinct
      const svc = new TestClientService(model, { telegramService: { createNewSession } } as any);

      const result = await (svc as any).createDistinctSessionString('91999', [ACTIVE]);
      expect(result).toBe('FRESH_DISTINCT');
    });

    test('createDistinctSessionString returns null when all attempts duplicate (no bad backup persisted)', async () => {
      const ACTIVE = 'ACTIVE_SESSION';
      const createNewSession = jest.fn().mockResolvedValue(ACTIVE);
      const svc = new TestClientService(model, { telegramService: { createNewSession } } as any);

      const result = await (svc as any).createDistinctSessionString('91999', [ACTIVE]);
      expect(result).toBeNull();
    });
  });
});
