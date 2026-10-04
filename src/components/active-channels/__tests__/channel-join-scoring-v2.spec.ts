import mongoose, { Connection, Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ChannelIntelligenceReadService } from '../channel-intelligence-read.service';

// Frozen output of the pre-V2 builder: stages for prior {0.03, 0.82} + the getFleetPrior $group pipeline.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const golden = require('./fixtures/join-scoring-v1-golden.json');

const FLAG = 'CHANNEL_JOIN_SCORING_V2';
const PRIOR = { PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 };
const rand1 = (stages: any[]) => JSON.parse(JSON.stringify(stages).split('{"$rand":{}}').join('1'));

describe('CHANNEL_JOIN_SCORING_V2', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let ciModel: any;
  let chanModel: any;
  let service: ChannelIntelligenceReadService;
  let saved: string | undefined;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'joinScoringV2' }).asPromise();
    ciModel = connection.model('channelIntelligence', new Schema({}, { strict: false, collection: 'channelIntelligence' }));
    chanModel = connection.model('srcChanV2', new Schema({}, { strict: false, collection: 'srcChanV2' }));
    service = new ChannelIntelligenceReadService(ciModel);

    await chanModel.create(
      ['untried', 'thin', 'fanout', 'proven', 'del40', 'del30', 'del40small'].map((channelId) => ({ channelId })),
    );
    await ciModel.create([
      // 2 resolved sends, 2 credited DMs: 100% "rate" on no evidence
      { channelId: 'thin', outcomes: { attempted: 2, survived: 2, deleted: 0 }, DMs: { credited: 2 } },
      // credited fanned out to a channel with ZERO validated sends
      { channelId: 'fanout', outcomes: { attempted: 0, survived: 0, deleted: 0 }, DMs: { credited: 5 } },
      // well-evidenced converter (30% credited/attempted)
      { channelId: 'proven', outcomes: { attempted: 100, survived: 98, deleted: 1 }, DMs: { credited: 30 } },
      // 40% deleted (0.3 < r <= 0.5), active
      { channelId: 'del40', outcomes: { attempted: 20, survived: 12, deleted: 8 }, DMs: { credited: 1 } },
      // exactly 30% deleted: not > 0.3, stays eligible
      { channelId: 'del30', outcomes: { attempted: 20, survived: 14, deleted: 6 }, DMs: { credited: 1 } },
      // 5/9 deleted but attempted < 10: below the sample gate, stays eligible
      { channelId: 'del40small', outcomes: { attempted: 9, survived: 4, deleted: 5 }, DMs: { credited: 0 } },
    ]);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  const RATIO = 'CHANNEL_JOIN_MAX_DELETE_RATIO';
  let savedRatio: string | undefined;
  beforeEach(() => { saved = process.env[FLAG]; delete process.env[FLAG]; savedRatio = process.env[RATIO]; delete process.env[RATIO]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG]; else process.env[FLAG] = saved;
    if (savedRatio === undefined) delete process.env[RATIO]; else process.env[RATIO] = savedRatio;
  });

  // Deterministic weights: $rand := 1 so sortScore == conversionWeight x sendQualityWeight.
  async function weights(): Promise<Record<string, number>> {
    const stages = rand1(service.buildConversionAwareSortStages(PRIOR));
    const rows = await chanModel.aggregate([...stages, { $project: { channelId: 1, sortScore: 1 } }]).exec();
    return Object.fromEntries(rows.map((r: any) => [r.channelId, r.sortScore]));
  }

  describe('flag OFF + CHANNEL_JOIN_MAX_DELETE_RATIO=0.5 (the rollback value) is byte-identical to the legacy builder', () => {
    beforeEach(() => { process.env[RATIO] = '0.5'; });
    it.each([undefined, 'false', '0', ''])('flag=%p: stages deep-equal the frozen legacy pipeline', (value) => {
      if (value !== undefined) process.env[FLAG] = value;
      expect(JSON.parse(JSON.stringify(service.buildConversionAwareSortStages(PRIOR)))).toEqual(golden.stages);
    });

    it('flag OFF: fleet-prior $group pipeline deep-equals the legacy pipeline', async () => {
      let captured: any;
      const model = { aggregate: (p: any) => { captured = p; return { exec: async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }] }; } } as any;
      await new ChannelIntelligenceReadService(model).getFleetPrior(0);
      expect(JSON.parse(JSON.stringify(captured))).toEqual(golden.priorPipeline);
    });

    it('legacy: 0.3-0.5 delete-ratio channel is still eligible; thin/fanout channels keep the 1.3 ceiling', async () => {
      const w = await weights();
      expect(w['del40']).toBeDefined();
      expect(w['thin']).toBeGreaterThan(1.2);
      expect(w['fanout']).toBeGreaterThan(1.2);
    });
  });

  describe('flag ON', () => {
    beforeEach(() => { process.env[FLAG] = 'true'; });

    it('flaw 1: under-validated channels no longer earn a conversion weight above neutral', async () => {
      const w = await weights();
      // thin: att 2 < MIN evidence -> conversion capped at 1.0; sq <= 1.1
      expect(w['thin']).toBeLessThanOrEqual(1.1 + 1e-9);
      // fan-out credit on a zero-send channel is clamped to 0 -> exactly neutral, same as untried
      expect(w['fanout']).toBeCloseTo(w['untried'], 9);
      expect(w['untried']).toBeCloseTo(1, 9);
      // a genuinely evidenced converter still exceeds neutral and outranks the thin channel
      expect(w['proven']).toBeGreaterThan(1.1);
      expect(w['proven']).toBeGreaterThan(w['thin']);
    });

    it('flaw 2: excludes deleted/attempted > 0.3 (attempted >= 10), keeps == 0.3 and the < 10 sample gate', async () => {
      const w = await weights();
      expect(w['del40']).toBeUndefined();
      expect(w['del30']).toBeDefined();
      expect(w['del40small']).toBeDefined();
    });

  });

  describe('delete-ratio exclusion (independent of the scoring flag)', () => {
    it('DEFAULT is 0.3 with the scoring flag OFF: >0.3 excluded, ==0.3 and the <10 sample gate kept', async () => {
      const w = await weights();
      expect(w['del40']).toBeUndefined();
      expect(w['del30']).toBeDefined();
      expect(w['del40small']).toBeDefined();
      // scoring unchanged with the flag off: thin/fanout keep the legacy 1.3 ceiling
      expect(w['thin']).toBeGreaterThan(1.2);
    });

    it('CHANNEL_JOIN_MAX_DELETE_RATIO=0.5 rolls back to legacy; invalid values fall back to 0.3', async () => {
      process.env[RATIO] = '0.5';
      expect((await weights())['del40']).toBeDefined();
      for (const bad of ['abc', '0', '-1', '2']) {
        process.env[RATIO] = bad;
        expect((await weights())['del40']).toBeUndefined();
      }
    });

    it('getExcludedChannelIds (fail-open fallback path) applies the same threshold', async () => {
      const docs = [
        { channelId: 'a', outcomes: { attempted: 20, deleted: 8 } },
        { channelId: 'b', outcomes: { attempted: 20, deleted: 6 } },
      ];
      const model = { find: () => ({ lean: () => ({ exec: async () => docs }) }) } as any;
      const svc = new ChannelIntelligenceReadService(model);
      expect([...(await svc.getExcludedChannelIds(['a', 'b']))]).toEqual(['a']);
      process.env[RATIO] = '0.5';
      expect([...(await svc.getExcludedChannelIds(['a', 'b']))]).toEqual([]);
    });

    it('fleet prior clamps credited to attempted per doc and is not served from a flag-OFF cache entry', async () => {
      await ciModel.deleteMany({});
      await ciModel.create([
        { channelId: 'p1', outcomes: { attempted: 0, survived: 0 }, DMs: { credited: 10 } },
        { channelId: 'p2', outcomes: { attempted: 100, survived: 80 }, DMs: { credited: 5 } },
      ]);
      const svc = new ChannelIntelligenceReadService(ciModel);
      delete process.env[FLAG];
      expect((await svc.getFleetPrior(60_000)).PRIOR_RATE).toBeCloseTo(15 / 100, 6);
      process.env[FLAG] = 'true';
      expect((await svc.getFleetPrior(60_000)).PRIOR_RATE).toBeCloseTo(5 / 100, 6);
    });
  });
});
