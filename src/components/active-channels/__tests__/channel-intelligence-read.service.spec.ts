import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Schema } from 'mongoose';
import { ChannelIntelligenceReadService } from '../channel-intelligence-read.service';

describe('ChannelIntelligenceReadService.getExcludedChannelIds', () => {
  const docs = [
    { channelId: '1', safety: { status: 'blocked', consecutiveErrors: 0 }, outcomes: { attempted: 0, deleted: 0 } },
    { channelId: '2', safety: { status: 'active', consecutiveErrors: 3 }, outcomes: { attempted: 0, deleted: 0 } },
    { channelId: '3', safety: { status: 'active', consecutiveErrors: 0 }, outcomes: { attempted: 20, deleted: 15 } },
    { channelId: '4', safety: { status: 'active', consecutiveErrors: 0 }, outcomes: { attempted: 20, deleted: 2 } },
  ];
  const model = { find: () => ({ lean: () => ({ exec: async () => docs }) }) } as any;

  it('excludes blocked, high-error, high-deletion; keeps healthy', async () => {
    const svc = new ChannelIntelligenceReadService(model);
    const set = await svc.getExcludedChannelIds(['1', '2', '3', '4', '5']);
    expect([...set].sort()).toEqual(['1', '2', '3']);
  });

  it('returns an empty set for an empty candidate list without querying', async () => {
    const spyModel = { find: jest.fn() } as any;
    const svc = new ChannelIntelligenceReadService(spyModel);
    const set = await svc.getExcludedChannelIds([]);
    expect(set.size).toBe(0);
    expect(spyModel.find).not.toHaveBeenCalled();
  });

  it('treats missing/null doc fields as not excluded', async () => {
    const partialDocs = [
      { channelId: '10' },
      { channelId: '11', safety: null, outcomes: null },
      { channelId: '12', safety: { status: null, consecutiveErrors: null }, outcomes: { attempted: null, deleted: null } },
    ];
    const partialModel = { find: () => ({ lean: () => ({ exec: async () => partialDocs }) }) } as any;
    const svc = new ChannelIntelligenceReadService(partialModel);
    const set = await svc.getExcludedChannelIds(['10', '11', '12']);
    expect(set.size).toBe(0);
  });
});

// ─── getOutcomeAnalytics (real Mongo — aggregation pipeline correctness) ────────────────────
describe('ChannelIntelligenceReadService.getOutcomeAnalytics', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: any;
  let service: ChannelIntelligenceReadService;

  const ChannelIntelligenceSchema = new Schema({}, { strict: false, collection: 'channelIntelligence' });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'ciAnalyticsSvc' }).asPromise();
    model = connection.model('ChannelIntelligenceGroupA', ChannelIntelligenceSchema);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    service = new ChannelIntelligenceReadService(model);
  });

  function doc(overrides: any) {
    return {
      channelId: overrides.channelId,
      messagePool: overrides.messagePool ?? [],
      outcomes: {
        attempted: 0,
        survived: 0,
        deleted: 0,
        freeformDeleted: 0,
        followUpDeleted: 0,
        ...overrides.outcomes,
      },
    };
  }

  it('returns zeroed shape for an empty collection', async () => {
    const a = await service.getOutcomeAnalytics();
    expect(a).toEqual({
      messageStats: {
        totalSent: 0, totalFailed: 0, totalDeleted: 0, successRate: 0,
        channelsWithSends: 0, channelsWithFailures: 0, channelsWithDeleted: 0,
        avgSent: 0, avgFailed: 0,
      },
      restrictionStats: {
        freeformDeletionChannels: 0, followUpDeletionChannels: 0,
        totalFreeformDeletions: 0, totalFollowUpDeletions: 0,
      },
      successRateDistribution: [],
      topBySuccess: [],
      topByFailure: [],
      topByDeleted: [],
    });
  });

  it('sources messageStats from outcomes.survived/deleted + summed messagePool[].channelSideFailed', async () => {
    await model.insertMany([
      doc({
        channelId: 'c1',
        outcomes: { attempted: 12, survived: 10, deleted: 2 },
        messagePool: [
          { key: 'k1', text: 't1', source: 'ai', attempted: 6, survived: 5, deleted: 1, channelSideFailed: 1, lastSentAtMs: 1, lastValidatedAtMs: 1, state: 'active' },
          { key: 'k2', text: 't2', source: 'ai', attempted: 6, survived: 5, deleted: 1, channelSideFailed: 2, lastSentAtMs: 1, lastValidatedAtMs: 1, state: 'active' },
        ],
      }),
      doc({
        channelId: 'c2',
        outcomes: { attempted: 5, survived: 0, deleted: 5 },
        messagePool: [
          { key: 'k3', text: 't3', source: 'legacy', attempted: 5, survived: 0, deleted: 5, channelSideFailed: 0, lastSentAtMs: 1, lastValidatedAtMs: 1, state: 'active' },
        ],
      }),
    ]);

    const a = await service.getOutcomeAnalytics();
    // totalSent = sum(outcomes.survived) = 10 + 0
    expect(a.messageStats.totalSent).toBe(10);
    // totalFailed = sum(messagePool[].channelSideFailed) = (1+2) + 0
    expect(a.messageStats.totalFailed).toBe(3);
    // totalDeleted = sum(outcomes.deleted) = 2 + 5
    expect(a.messageStats.totalDeleted).toBe(7);
    expect(a.messageStats.channelsWithSends).toBe(1);
    expect(a.messageStats.channelsWithFailures).toBe(1);
    expect(a.messageStats.channelsWithDeleted).toBe(2);
    // successRate = totalSent / (totalSent + totalFailed) = 10 / 13 ≈ 77%
    expect(a.messageStats.successRate).toBe(77);
  });

  it('sources restrictionStats from outcomes.freeformDeleted/followUpDeleted', async () => {
    await model.insertMany([
      doc({ channelId: 'c1', outcomes: { freeformDeleted: 3, followUpDeleted: 0 } }),
      doc({ channelId: 'c2', outcomes: { freeformDeleted: 0, followUpDeleted: 2 } }),
      doc({ channelId: 'c3', outcomes: { freeformDeleted: 1, followUpDeleted: 1 } }),
    ]);

    const a = await service.getOutcomeAnalytics();
    expect(a.restrictionStats).toEqual({
      freeformDeletionChannels: 2,
      followUpDeletionChannels: 2,
      totalFreeformDeletions: 4,
      totalFollowUpDeletions: 3,
    });
  });

  it('buckets successRateDistribution from outcomes.survived / outcomes.attempted', async () => {
    await model.insertMany([
      doc({ channelId: 'c1', outcomes: { attempted: 10, survived: 10, deleted: 0 } }), // 100% -> 80-101%
      doc({ channelId: 'c2', outcomes: { attempted: 10, survived: 1, deleted: 9 } }),  // 10% -> 0-20%
      doc({ channelId: 'c3', outcomes: { attempted: 0, survived: 0, deleted: 0 } }),   // no attempts -> excluded
    ]);

    const a = await service.getOutcomeAnalytics();
    const ranges = a.successRateDistribution.map((b) => b.range).sort();
    expect(ranges).toEqual(['0-20%', '80-100%'].sort());
    expect(a.successRateDistribution.reduce((s, b) => s + b.count, 0)).toBe(2);
  });

  it('topBySuccess/topByFailure/topByDeleted sort+limit and only include channels with a positive metric', async () => {
    await model.insertMany([
      doc({ channelId: 'top-survived', outcomes: { survived: 50, deleted: 0 } }),
      doc({ channelId: 'zero-survived', outcomes: { survived: 0, deleted: 0 } }),
      doc({
        channelId: 'top-failed',
        outcomes: { survived: 0 },
        messagePool: [{ key: 'k', text: 't', source: 'ai', attempted: 5, survived: 0, deleted: 0, channelSideFailed: 9, lastSentAtMs: 1, lastValidatedAtMs: 1, state: 'active' }],
      }),
      doc({ channelId: 'top-deleted', outcomes: { deleted: 20 } }),
    ]);

    const a = await service.getOutcomeAnalytics();
    expect(a.topBySuccess.map((c: any) => c.channelId)).toEqual(['top-survived']);
    expect(a.topByFailure.map((c: any) => c.channelId)).toEqual(['top-failed']);
    expect(a.topByDeleted.map((c: any) => c.channelId)).toEqual(['top-deleted']);
  });

  it('fails open (returns zeroed stats) if the aggregation errors', async () => {
    const brokenModel = { aggregate: () => { throw new Error('mongo down'); } } as any;
    const svc = new ChannelIntelligenceReadService(brokenModel);
    const a = await svc.getOutcomeAnalytics();
    expect(a.messageStats.totalSent).toBe(0);
    expect(a.topBySuccess).toEqual([]);
  });
});
