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

// ─── buildConversionAwareSortStages (real Mongo — conversion-aware join-sort pipeline) ──────
describe('ChannelIntelligenceReadService.buildConversionAwareSortStages', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let ciModel: any;       // channelIntelligence
  let chanModel: any;     // the source collection we sort
  let service: ChannelIntelligenceReadService;

  const Bare = () => new Schema({}, { strict: false });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'sortStages' }).asPromise();
    ciModel = connection.model('channelIntelligence', new Schema({}, { strict: false, collection: 'channelIntelligence' }));
    chanModel = connection.model('srcChan', new Schema({}, { strict: false, collection: 'srcChan' }));
    service = new ChannelIntelligenceReadService(ciModel);

    // Source channels to sort (only channelId matters for the lookup):
    await chanModel.create([
      { channelId: 'untried' },      // no CI doc  -> neutral 1.0 x 1.0
      { channelId: 'dead' },         // 200 sends, 0 DMs -> conversion toward WEIGHT_MIN
      { channelId: 'converter' },    // high credited/attempted -> conversion toward WEIGHT_MAX
      { channelId: 'deletey' },      // 40% deleted (under 50% hard gate) -> sendQuality toward SQ_MIN
    ]);
    await ciModel.create([
      { channelId: 'dead',      outcomes: { attempted: 200, survived: 180, deleted: 5 },  DMs: { credited: 0 } },
      { channelId: 'converter', outcomes: { attempted: 100, survived: 95,  deleted: 2 },  DMs: { credited: 30 } },
      { channelId: 'deletey',   outcomes: { attempted: 100, survived: 55,  deleted: 40 }, DMs: { credited: 3 } },
    ]);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  // Helper: run the builder's stages and expose the computed weights instead of dropping them.
  async function weights(prior: { PRIOR_RATE: number; SQ_PRIOR_RATE: number }) {
    const stages = service.buildConversionAwareSortStages(prior);
    // Re-project the intermediate weights for assertion by appending a debug $addFields
    // that recomputes nothing — we instead inspect sortScore bounds and relative order.
    const rows = await chanModel.aggregate([...stages, { $project: { channelId: 1, sortScore: 1 } }]).exec();
    return Object.fromEntries(rows.map((r: any) => [r.channelId, r.sortScore]));
  }

  it('untried channel (no CI doc) contributes neutral weights (sortScore in (0,1], no penalty)', async () => {
    const s = await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    // sortScore = rand * conv(1.0) * sq(1.0) => in (0,1].
    expect(s['untried']).toBeGreaterThan(0);
    expect(s['untried']).toBeLessThanOrEqual(1);
  });

  it('proven-dead channel weight ceiling is far below an untried channel ceiling', async () => {
    // Run many draws; the max achievable sortScore reflects the weight product.
    const maxDead = Math.max(...await Promise.all([...Array(200)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['dead'])));
    const maxUntried = Math.max(...await Promise.all([...Array(200)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['untried'])));
    // dead conv ~0.2, sq ~1.0 => ceiling ~0.2 ; untried ceiling ~1.0
    expect(maxDead).toBeLessThan(maxUntried);
    expect(maxDead).toBeLessThanOrEqual(0.2 * 1.1 + 0.02); // WEIGHT_MIN * SQ_MAX ceiling + slack
  });

  it('proven converter can exceed neutral ceiling (weight > 1 possible)', async () => {
    const maxConv = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['converter'])));
    expect(maxConv).toBeGreaterThan(1); // WEIGHT_MAX(1.3) * SQ_MAX(1.1) ceiling ~1.43
  });

  it('delete-heavy channel (under 50% hard gate) is send-quality penalized vs a clean channel', async () => {
    // deletey survival ~0.55 shrunk => sq < 1 ; converter survival ~0.95 => sq ~1.1
    const maxDeletey = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['deletey'])));
    // deletey conv is modest (3/100 ~ prior) and sq is depressed -> ceiling well under converter's
    const maxConv = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['converter'])));
    expect(maxDeletey).toBeLessThan(maxConv);
  });

  // ─── Tightened / added coverage (adversarial-review follow-up 2026-08-01) ───────────────
  // The tests above assert only bounds/relative order. These pin the exact load-bearing
  // invariants the design flags as critical: untried==1.0, live self-calibration, PRIOR_RATE=0
  // guard, and send-quality isolated from conversion. Each would fail on a plausible regression
  // the earlier bound-only tests let pass.

  // The weight product conv×sq for a channel == the supremum of sortScore over rand∈[0,1).
  // Estimate it by the max over many draws; the true ceiling is approached from below and never
  // exceeded, so `max` is a tight lower bound and `<= ceiling` is exact.
  async function productCeiling(channelId: string, prior: { PRIOR_RATE: number; SQ_PRIOR_RATE: number }, draws = 800) {
    const vals = await Promise.all([...Array(draws)].map(async () => (await weights(prior))[channelId]));
    return Math.max(...vals);
  }

  it('untried channel weight product is EXACTLY 1.0 (spec test #1 — pins neutrality, not just <=1)', async () => {
    // A regression that made untried normalize to e.g. 0.6×0.6=0.36 would still satisfy the
    // (0,1] bound above; this pins the ceiling to ~1.0 so such a regression fails here.
    const ceil = await productCeiling('untried', { PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    expect(ceil).toBeGreaterThan(0.95);   // max of 800 U(0,1) draws sits just under the true 1.0
    expect(ceil).toBeLessThanOrEqual(1);  // conv(1.0)×sq(1.0) can never exceed 1.0
  });

  it('is self-calibrating: the SAME channel’s weight shifts when the live prior shifts (spec test #11)', async () => {
    // 'deletey' (credited=3, attempted=100). At the fallback prior 0.03 its conversion is neutral
    // (~1.0). Feed a HIGHER live prior (0.06): the same channel now looks below-average, so its
    // conversion weight (and thus its ceiling) must DROP. If the builder ignored `prior` and
    // hardcoded 0.03/0.82, both ceilings would be identical and this fails.
    const ceilLowPrior  = await productCeiling('deletey', { PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const ceilHighPrior = await productCeiling('deletey', { PRIOR_RATE: 0.06, SQ_PRIOR_RATE: 0.82 });
    expect(ceilHighPrior).toBeLessThan(ceilLowPrior);
  });

  it('guards a zero PRIOR_RATE (no NaN/Infinity — spec "PRIOR_RATE resolving to 0")', async () => {
    // getFleetPrior can hand PRIOR_RATE=0 when the fleet has sends but zero credited DMs.
    // The builder’s `prior.PRIOR_RATE > 0 ? : FALLBACK` guard must keep every sortScore finite.
    const s = await weights({ PRIOR_RATE: 0, SQ_PRIOR_RATE: 0 } as any);
    for (const id of ['untried', 'dead', 'converter', 'deletey']) {
      expect(Number.isFinite(s[id])).toBe(true);
      expect(s[id]).toBeGreaterThanOrEqual(0);
      expect(s[id]).toBeLessThanOrEqual(1.5); // within the clamp product ceiling (1.3×1.1)
    }
  });

  it('send-quality is isolated: SAME-conversion clean vs delete-heavy differ ONLY by survival (spec test #9)', async () => {
    // Two channels with IDENTICAL conversion evidence (credited=3, attempted=100 -> conv neutral)
    // but different survival. Ranking difference is therefore attributable to sendQualityWeight
    // alone — a regression that flattened sendQualityWeight to 1.0 would make these ceilings equal.
    const clean = 'sq-clean', dirty = 'sq-dirty';
    await chanModel.create([{ channelId: clean }, { channelId: dirty }]);
    await ciModel.create([
      { channelId: clean, outcomes: { attempted: 100, survived: 98, deleted: 1 },  DMs: { credited: 3 } },
      { channelId: dirty, outcomes: { attempted: 100, survived: 55, deleted: 40 }, DMs: { credited: 3 } },
    ]);
    const ceilClean = await productCeiling(clean, { PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const ceilDirty = await productCeiling(dirty, { PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    expect(ceilDirty).toBeLessThan(ceilClean);
  });

  it('excludes blocked, repeated-error, and high-delete channels inside the aggregation before the caller limit', async () => {
    const good = 'ci-good';
    const blocked = 'ci-blocked';
    const erroring = 'ci-erroring';
    const deleteHeavy = 'ci-delete-heavy';
    await chanModel.create([
      { channelId: good },
      { channelId: blocked },
      { channelId: erroring },
      { channelId: deleteHeavy },
    ]);
    await ciModel.create([
      { channelId: good, outcomes: { attempted: 20, survived: 18, deleted: 1 }, DMs: { credited: 1 } },
      { channelId: blocked, safety: { status: 'blocked' }, outcomes: { attempted: 20, survived: 18, deleted: 1 } },
      { channelId: erroring, safety: { consecutiveErrors: 3 }, outcomes: { attempted: 20, survived: 18, deleted: 1 } },
      { channelId: deleteHeavy, outcomes: { attempted: 10, survived: 3, deleted: 6 } },
    ]);

    const stages = service.buildConversionAwareSortStages({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const rows = await chanModel.aggregate([
      { $match: { channelId: { $in: [good, blocked, erroring, deleteHeavy] } } },
      ...stages,
      { $limit: 4 },
      { $project: { channelId: 1 } },
    ]).exec();

    expect(rows.map((row: any) => row.channelId)).toEqual([good]);
    const exclusionStageIndex = stages.findIndex((stage: any) => stage.$match?._ciExcluded);
    const projectStageIndex = stages.findIndex((stage: any) => stage.$project?._ciExcluded === 0);
    expect(exclusionStageIndex).toBeGreaterThan(-1);
    expect(projectStageIndex).toBeGreaterThan(exclusionStageIndex);

    await chanModel.deleteMany({ channelId: { $in: [good, blocked, erroring, deleteHeavy] } });
    await ciModel.deleteMany({ channelId: { $in: [good, blocked, erroring, deleteHeavy] } });
  });

  it('buildRandomOnlySortStages: pure $rand sort, NO $lookup (fail-open fallback has no cross-collection failure surface)', async () => {
    const stages = service.buildRandomOnlySortStages();
    const json = JSON.stringify(stages);
    expect(json).toContain('$rand');
    expect(json).not.toContain('$lookup');            // must not share the conversion sort's failure surface
    expect(json).not.toContain('channelIntelligence');
    // It actually sorts a real collection without needing any CI docs.
    const rows = await chanModel.aggregate([...stages, { $sort: { sortScore: -1 } }, { $project: { channelId: 1, sortScore: 1 } }]).exec();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) { expect(r.sortScore).toBeGreaterThanOrEqual(0); expect(r.sortScore).toBeLessThan(1); }
  });

  it('POISON-DOC ROBUSTNESS: a malformed CI field (string/bool/array) does NOT throw — the doc degrades to neutral (spec: no fleet-wide crash)', async () => {
    // channelIntelligence is written by a sibling service into a strict:false collection, so a
    // numeric field can arrive wrong-typed. $ifNull would let it through and $add/$divide would
    // THROW, aborting the whole aggregation. $convert(onError/onNull:0) must neutralize it instead.
    const poison = 'poison-ch';
    await chanModel.create({ channelId: poison });
    await ciModel.create({
      channelId: poison,
      outcomes: { attempted: '50', survived: [1, 2], deleted: 5 }, // string + array = hostile types
      DMs: { credited: true },                                     // bool = hostile type
    });
    const stages = service.buildConversionAwareSortStages({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    // The whole channel set (including the poison doc) aggregates WITHOUT throwing.
    let rows: any[] = [];
    await expect((async () => {
      rows = await chanModel.aggregate([...stages, { $project: { channelId: 1, sortScore: 1 } }]).exec();
    })()).resolves.toBeUndefined();
    const poisonRow = rows.find((r) => r.channelId === poison);
    expect(poisonRow).toBeTruthy();
    // Malformed fields -> all coerce to 0 -> weights shrink to exactly neutral (1.0×1.0) -> sortScore ∈ (0,1].
    expect(Number.isFinite(poisonRow.sortScore)).toBe(true);
    expect(poisonRow.sortScore).toBeGreaterThan(0);
    expect(poisonRow.sortScore).toBeLessThanOrEqual(1);
    // And the other (well-formed) channels still sorted fine alongside it.
    expect(rows.length).toBeGreaterThan(1);
    // cleanup so later tests in this describe aren't affected
    await chanModel.deleteOne({ channelId: poison });
    await ciModel.deleteOne({ channelId: poison });
  });
});

describe('ChannelIntelligenceReadService.getFleetPrior', () => {
  it('computes live fleet prior from Σcredited/Σattempted and Σsurvived/Σattempted', async () => {
    const docs = [
      { outcomes: { attempted: 100, survived: 80 }, DMs: { credited: 5 } },
      { outcomes: { attempted: 100, survived: 84 }, DMs: { credited: 1 } },
    ]; // Σattempted=200, Σcredited=6 -> 0.03 ; Σsurvived=164 -> 0.82
    const model = {
      aggregate: () => ({ exec: async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }] }),
    } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBeCloseTo(0.03, 5);
    expect(prior.SQ_PRIOR_RATE).toBeCloseTo(0.82, 5);
  });

  it('falls back to literals when the fleet has zero sends', async () => {
    const model = { aggregate: () => ({ exec: async () => [{ totalCredited: 0, totalAttempted: 0, totalSurvived: 0 }] }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBe(0.03);
    expect(prior.SQ_PRIOR_RATE).toBe(0.82);
  });

  it('fails open to fallback when the aggregation throws', async () => {
    const model = { aggregate: () => ({ exec: async () => { throw new Error('boom'); } }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBe(0.03);
    expect(prior.SQ_PRIOR_RATE).toBe(0.82);
  });

  it('caches within TTL: a second call inside the window does not re-query', async () => {
    const exec = jest.fn(async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }]);
    const model = { aggregate: () => ({ exec }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    await svc.getFleetPrior(60_000);
    await svc.getFleetPrior(60_000);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('ttl=0 recomputes every call', async () => {
    const exec = jest.fn(async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }]);
    const model = { aggregate: () => ({ exec }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    await svc.getFleetPrior(0);
    await svc.getFleetPrior(0);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  // Real-Mongo: proves the $group actually runs the $convert coercion (mock models above skip the pipeline).
  describe('real $group coercion', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let ciModel: any;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
      connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'fleetPriorCoerce' }).asPromise();
      ciModel = connection.model('channelIntelligence', new Schema({}, { strict: false, collection: 'channelIntelligence' }));
    });
    afterAll(async () => {
      if (connection) { await connection.dropDatabase(); await connection.close(); }
      if (mongod) await mongod.stop();
    });

    it('computes the prior from real docs AND is not skewed/crashed by a poison doc', async () => {
      await ciModel.create([
        { outcomes: { attempted: 100, survived: 80 }, DMs: { credited: 5 } },
        { outcomes: { attempted: 100, survived: 84 }, DMs: { credited: 1 } },
        // poison doc: string attempted + array survived + bool credited. $convert(onError:0) must
        // drop all three to 0 for THIS doc symmetrically, so it neither throws nor skews the ratios.
        { outcomes: { attempted: 'NaN', survived: [1] }, DMs: { credited: true } },
      ]);
      const svc = new ChannelIntelligenceReadService(ciModel);
      const prior = await svc.getFleetPrior(0); // Σattempted=200, Σcredited=6->0.03, Σsurvived=164->0.82
      expect(prior.PRIOR_RATE).toBeCloseTo(0.03, 5);   // poison contributed 0/0/0, no upward skew
      expect(prior.SQ_PRIOR_RATE).toBeCloseTo(0.82, 5);
    });
  });
});
