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
import { JoinRequestSchema, JoinRequestDocument } from '../../join-requests/join-request.schema';

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
    return this._model.findOneAndUpdate({ mobile }, { $set: updateDto }, { returnDocument: 'after' }).exec() as any;
  }
  async markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument | null> {
    return this._model.findOneAndUpdate({ mobile }, { $set: { status: 'inactive', message: reason } }, { returnDocument: 'after' }).exec();
  }
  async updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<BufferClientDocument> {
    return this._model.findOneAndUpdate({ mobile }, { $set: { status, message } }, { returnDocument: 'after' }).exec() as any;
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
  let joinRequestModel: Model<JoinRequestDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'baseClientSvc' }).asPromise();
    model = connection.model<BufferClientDocument>('BufferClientTest', BufferClientSchema as any);
    joinRequestModel = connection.model<JoinRequestDocument>('JoinRequestTest', JoinRequestSchema as any);
    await joinRequestModel.init();
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
    await joinRequestModel.deleteMany({});
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

    // Real GramJS errors, built exactly as the client does (RPCMessageToError), so the
    // message is "400: INVITE_REQUEST_SENT (caused by channels.JoinChannel)".
    const realRpcError = (code: string, errorCode = 400) =>
      jest.requireActual('telegram/errors').RPCMessageToError(
        { errorMessage: code, errorCode },
        { className: 'channels.JoinChannel' },
      );

    test('real-format error fixture matches the live log format', () => {
      const err = realRpcError('INVITE_REQUEST_SENT');
      expect(err.message).toBe('400: INVITE_REQUEST_SENT (caused by channels.JoinChannel)');
      expect(err.errorMessage).toBe('INVITE_REQUEST_SENT');
    });

    test('INVITE_REQUEST_SENT (real GramJS format) is pending: no channels++, not re-queued, no failure, counts toward daily cap, upserts joinRequests, flags channel', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;

      const tryJoiningChannel = jest.fn().mockRejectedValue(realRpcError('INVITE_REQUEST_SENT'));
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = {
        findOne: jest.fn(async () => null),
        markJoinRequestRequired: jest.fn(async () => undefined),
      };
      const channelsService = { markJoinRequestRequired: jest.fn(async () => undefined) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService, channelsService } as any);
      (svc as any).joinRequestModel = joinRequestModel;
      svc.setJoinMap(mobile, [
        { channelId: 'approval1', username: 'uapproval1', canSendMsgs: true },
        { channelId: 'next1', username: 'unext1', canSendMsgs: true },
      ]);

      await svc.callProcessJoinSeq();

      // Pending request is NOT a joined channel.
      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(50);
      // Not re-queued, not a failure (no quarantine progress).
      const remaining = svc.getJoinMap().get(mobile) || [];
      expect(remaining.find((c: any) => c.channelId === 'approval1')).toBeUndefined();
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
      // Counts toward the per-account daily join cap.
      expect((svc as any).getDailyJoinCount(mobile)).toBe(1);
      // Persisted as a pending join request.
      const rows = await joinRequestModel.find({ mobile }).lean().exec();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ mobile, channelId: 'approval1', username: 'uapproval1', pool: 'buffer' });
      expect(rows[0].requestedAt).toBeInstanceOf(Date);
      // Channel flagged approval-only.
      expect(activeChannelsService.markJoinRequestRequired).toHaveBeenCalledWith('approval1');
      expect(channelsService.markJoinRequestRequired).toHaveBeenCalledWith('approval1');
    });

    test('INVITE_REQUEST_SENT is not logged as a "Join Channel Error"; the pending line is debug-level', async () => {
      const doc = await seed({ channels: 50 });
      const tryJoiningChannel = jest.fn().mockRejectedValue(realRpcError('INVITE_REQUEST_SENT'));
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null), markJoinRequestRequired: jest.fn(async () => undefined) };
      const channelsService = { markJoinRequestRequired: jest.fn(async () => undefined) };
      mockGetClient.mockResolvedValue({});
      const svc = new TestClientService(model, { telegramService, activeChannelsService, channelsService } as any);
      (svc as any).joinRequestModel = joinRequestModel;
      const handleError = jest.spyOn(svc as any, 'handleError');
      const log = jest.spyOn((svc as any).logger, 'log');
      const debug = jest.spyOn((svc as any).logger, 'debug');
      svc.setJoinMap(doc.mobile, [{ channelId: 'approval1', username: 'uapproval1', canSendMsgs: true }]);

      await svc.callProcessJoinSeq();

      expect(handleError.mock.calls.filter((c: any[]) => String(c[1]).includes('Join Channel Error'))).toHaveLength(0);
      const pending = `${doc.mobile} join request sent (pending approval) for @uapproval1`;
      expect(debug).toHaveBeenCalledWith(pending);
      expect(log).not.toHaveBeenCalledWith(pending);
    });

    test('INVITE_REQUEST_SENT twice for the same mobile+channel keeps one joinRequests row', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      const tryJoiningChannel = jest.fn().mockRejectedValue(realRpcError('INVITE_REQUEST_SENT'));
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null), markJoinRequestRequired: jest.fn(async () => undefined) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      (svc as any).joinRequestModel = joinRequestModel;
      svc.setJoinMap(mobile, [{ channelId: 'dup1', username: 'udup1', canSendMsgs: true }]);
      await svc.callProcessJoinSeq();
      svc.setJoinMap(mobile, [{ channelId: 'dup1', username: 'udup1', canSendMsgs: true }]);
      await svc.callProcessJoinSeq();

      expect(await joinRequestModel.countDocuments({ mobile, channelId: 'dup1' })).toBe(1);
    });

    test('1 successful join then INVITE_REQUEST_SENT in the same round: channels +1 persisted via $inc and joinRequests upserted', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      const tryJoiningChannel = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(realRpcError('INVITE_REQUEST_SENT'));
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = {
        findOne: jest.fn(async () => null),
        incrementClientsJoined: jest.fn(async () => {}),
        markJoinRequestRequired: jest.fn(async () => undefined),
      };
      mockGetClient.mockResolvedValue({});
      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      (svc as any).joinRequestModel = joinRequestModel;
      const incSpy = jest.spyOn(model, 'updateOne');
      svc.setJoinMap(mobile, [
        { channelId: 'ok1', username: 'uok1', canSendMsgs: true },
        { channelId: 'approval2', username: 'uapproval2', canSendMsgs: true },
      ]);

      await svc.callProcessJoinSeq();

      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(51);
      expect(incSpy).toHaveBeenCalledWith({ mobile }, { $inc: { channels: 1 } });
      const rows = await joinRequestModel.find({ mobile }).lean().exec();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ mobile, channelId: 'approval2' });
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
      incSpy.mockRestore();
    });

    test('recordJoinRequest upsert throws: loop continues, daily count still incremented, no crash', async () => {
      const docA = await seed({ channels: 50 });
      const docB = await seed({ channels: 70 });
      const tryJoiningChannel = jest.fn(async (mobile: string) => {
        if (mobile === docA.mobile) throw realRpcError('INVITE_REQUEST_SENT');
        return undefined;
      });
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: [] })) };
      const activeChannelsService = {
        findOne: jest.fn(async () => null),
        incrementClientsJoined: jest.fn(async () => {}),
        markJoinRequestRequired: jest.fn(async () => undefined),
      };
      mockGetClient.mockResolvedValue({});
      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      const upsert = jest.fn(() => ({ exec: jest.fn().mockRejectedValue(new Error('mongo down')) }));
      (svc as any).joinRequestModel = { updateOne: upsert };
      svc.setJoinMap(docA.mobile, [{ channelId: 'approval3', username: 'uapproval3', canSendMsgs: true }]);
      svc.setJoinMap(docB.mobile, [{ channelId: 'ok3', username: 'uok3', canSendMsgs: true }]);

      await expect(svc.callProcessJoinSeq()).resolves.not.toThrow();

      expect(upsert).toHaveBeenCalledTimes(1);
      expect((svc as any).getDailyJoinCount(docA.mobile)).toBe(1);
      expect(svc.getJoinFailureCount(docA.mobile)).toBe(0);
      expect(activeChannelsService.markJoinRequestRequired).toHaveBeenCalledWith('approval3');
      // The other mobile in the queue was still processed.
      expect(tryJoiningChannel).toHaveBeenCalledWith(docB.mobile, expect.objectContaining({ channelId: 'ok3' }));
      expect((await model.findOne({ mobile: docB.mobile }).exec())!.channels).toBe(71);
      expect((await model.findOne({ mobile: docA.mobile }).exec())!.channels).toBe(50);
    });

    test('CHANNELS_TOO_MUCH (real GramJS format) removes the mobile from the join queue and is not a transient failure', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      const tryJoiningChannel = jest.fn().mockRejectedValue(realRpcError('CHANNELS_TOO_MUCH'));
      const getChannelInfo = jest.fn(async () => ({ ids: Array.from({ length: 499 }, (_, i) => `c${i}`) }));
      const telegramService = { tryJoiningChannel, getChannelInfo };
      const activeChannelsService = { findOne: jest.fn(async () => null) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [
        { channelId: 'full1', username: 'ufull1', canSendMsgs: true },
        { channelId: 'full2', username: 'ufull2', canSendMsgs: true },
      ]);

      await svc.callProcessJoinSeq();

      expect(svc.getJoinMap().has(mobile)).toBe(false);
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
      expect(getChannelInfo).toHaveBeenCalledWith(mobile, true);
      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(499);
    });

    test('CHANNELS_TOO_MUCH (real format) on the follow-up channel count sets channels=500', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      const tryJoiningChannel = jest.fn().mockRejectedValue(realRpcError('CHANNELS_TOO_MUCH'));
      const getChannelInfo = jest.fn().mockRejectedValue(realRpcError('CHANNELS_TOO_MUCH'));
      const telegramService = { tryJoiningChannel, getChannelInfo };
      const activeChannelsService = { findOne: jest.fn(async () => null) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [{ channelId: 'full1', username: 'ufull1', canSendMsgs: true }]);

      await svc.callProcessJoinSeq();

      const after = await model.findOne({ mobile }).exec();
      expect(after!.channels).toBe(500);
    });

    test('FloodWaitError (real GramJS class) removes the mobile from the join queue (regression guard)', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      const flood = realRpcError('FLOOD_WAIT_30', 420);
      expect(flood.message).toBe('A wait of 30 seconds is required (caused by channels.JoinChannel)');
      const tryJoiningChannel = jest.fn().mockRejectedValue(flood);
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: ['a'] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [
        { channelId: 'f1', username: 'uf1', canSendMsgs: true },
        { channelId: 'f2', username: 'uf2', canSendMsgs: true },
      ]);

      await svc.callProcessJoinSeq();

      expect(svc.getJoinMap().has(mobile)).toBe(false);
      expect(svc.getJoinFailureCount(mobile)).toBe(0);
    });

    test('flood wait whose class name was lost (plain Error with the real GramJS message) is still treated as flood', async () => {
      const doc = await seed({ channels: 50 });
      const mobile = doc.mobile;
      // e.g. re-wrapped by a timeout/proxy layer: same text, no FloodWaitError class.
      const wrapped = new Error('A wait of 30 seconds is required (caused by channels.JoinChannel)');
      const tryJoiningChannel = jest.fn().mockRejectedValue(wrapped);
      const telegramService = { tryJoiningChannel, getChannelInfo: jest.fn(async () => ({ ids: ['a'] })) };
      const activeChannelsService = { findOne: jest.fn(async () => null) };
      mockGetClient.mockResolvedValue({});

      const svc = new TestClientService(model, { telegramService, activeChannelsService } as any);
      svc.setJoinMap(mobile, [
        { channelId: 'f1', username: 'uf1', canSendMsgs: true },
        { channelId: 'f2', username: 'uf2', canSendMsgs: true },
      ]);

      await svc.callProcessJoinSeq();

      expect(svc.getJoinMap().has(mobile)).toBe(false);
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
