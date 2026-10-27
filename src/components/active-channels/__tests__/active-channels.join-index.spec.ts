/**
 * getActiveChannels must be served by the partial join-candidates index, not by a full scan of
 * channelId_1 driven by the `channelId: { $nin }` exclusion (prod 2026-10-28: 54,751 keys,
 * ~2.1 s per call; with the index the scan is limited to canSendMsgs && participantsCount > 600).
 * Real MongoDB: the plan is the planner's choice, so it is checked with explain().
 */
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ActiveChannelsService } from '../active-channels.service';
import { ActiveChannelSchema } from '../schemas/active-channel.schema';

let mongod: MongoMemoryServer;
let connection: Connection;
let model: any;

const readStub = {
  getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
  buildConversionAwareSortStages: jest.fn(() => [
    { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
    { $addFields: { sortScore: { $rand: {} } } },
    { $project: { _ci: 0 } },
  ]),
  buildRandomOnlySortStages: jest.fn(() => [{ $addFields: { sortScore: { $rand: {} } } }]),
  getExcludedChannelIds: jest.fn(async () => new Set<string>()),
};

const indexScans = (stage: any, out: string[] = []): string[] => {
  if (!stage || typeof stage !== 'object') return out;
  if (stage.stage === 'IXSCAN' && stage.indexName) out.push(stage.indexName);
  for (const value of Object.values(stage)) {
    if (Array.isArray(value)) value.forEach((v) => indexScans(v, out));
    else if (value && typeof value === 'object') indexScans(value, out);
  }
  return out;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'activeChannelsJoinIndex' }).asPromise();
  model = connection.model('ActiveChannelJoinIndex', ActiveChannelSchema);
  await model.init();
});

afterAll(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (mongod) await mongod.stop();
});

describe('activeChannels join-candidates index', () => {
  test('schema declares the partial index, built by autoIndex', async () => {
    const idx = (await model.collection.indexes()).find((i: any) => i.name === 'join_candidates_participants');
    expect(idx).toBeDefined();
    expect(idx.key).toEqual({ participantsCount: -1 });
    expect(idx.partialFilterExpression).toEqual({ canSendMsgs: true, participantsCount: { $gt: 600 } });
  });

  test('the getActiveChannels pipeline uses it and examines only candidates', async () => {
    // 2,000 docs, 200 eligible; every 10th is sendable and large. The rest fail the partial filter.
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      channelId: String(100000 + i), title: `Desi chat ${i}`, username: `desi_${i}`,
      canSendMsgs: i % 10 === 0, participantsCount: i % 10 === 0 ? 5000 : 50,
      banned: false, forbidden: false, private: false, broadcast: false,
    }));
    await model.collection.insertMany(docs);
    const notIds = docs.slice(0, 300).map((d) => d.channelId);

    const service = new ActiveChannelsService(model, {} as any, readStub as any);
    const spy = jest.spyOn(model, 'aggregate');
    const results = await service.getActiveChannels(25, 0, notIds);
    const [pipeline, options] = spy.mock.calls[0] as [any[], any];
    spy.mockRestore();

    expect(results).toHaveLength(25);
    expect(results.every((c: any) => !notIds.includes(c.channelId))).toBe(true);

    const explain = await model.collection.aggregate(pipeline, options).explain('executionStats');
    const cursor = explain.stages ? explain.stages[0].$cursor : explain;
    const scans = indexScans(cursor.queryPlanner.winningPlan);
    expect(scans).toEqual(['join_candidates_participants']);
    expect(cursor.executionStats.totalDocsExamined).toBeLessThanOrEqual(200);
  });
});
