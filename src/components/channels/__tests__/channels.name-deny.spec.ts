/**
 * Precomputed join-selection name deny-list (`nameDenied`) — real MongoDB.
 * Data-model review 2026-10-25 §5.5: getActiveChannels spent ~1.5 s per call evaluating two
 * ~90-branch case-insensitive regexes over ~52k docs. The verdict is now stored at write time and
 * the read checks the flag first, falling back to the regexes only for docs without it.
 */
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ChannelsService } from '../channels.service';
import { ChannelSchema } from '../schemas/channel.schema';
import { computeChannelNameDenied } from '../channel-name-deny';

let mongod: MongoMemoryServer;
let connection: Connection;
let model: any;
let service: ChannelsService;

const readStub = {
  getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
  buildConversionAwareSortStages: jest.fn(() => [{ $addFields: { sortScore: { $rand: {} } } }]),
  buildRandomOnlySortStages: jest.fn(() => [{ $addFields: { sortScore: { $rand: {} } } }]),
};

const eligible = { participantsCount: 5000, canSendMsgs: true, banned: false, forbidden: false, private: false, broadcast: false };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'channelsNameDeny' }).asPromise();
  model = connection.model('ChannelNameDeny', ChannelSchema);
  await model.init();
});

afterAll(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await model.deleteMany({});
  service = new ChannelsService(model, readStub as any);
});

describe('computeChannelNameDenied', () => {
  test('title or username hit; non-strings never match', () => {
    expect(computeChannelNameDenied('Crypto Signals', 'abc_chat')).toBe(true);
    expect(computeChannelNameDenied('Desi chat', 'promo_zone')).toBe(true);
    expect(computeChannelNameDenied('Desi chat', 'desi_chat')).toBe(false);
    expect(computeChannelNameDenied(undefined, null)).toBe(false);
    expect(computeChannelNameDenied(123, ['crypto'])).toBe(false);
  });
});

describe('nameDenied is written on every title/username write', () => {
  test('createMultiple computes it from the merged doc (pipeline stage)', async () => {
    await service.createMultiple([
      { channelId: '1001', title: 'Bitcoin club', username: 'club_one', ...eligible },
      { channelId: '1002', title: 'Hangout', username: 'hangout_two', ...eligible },
    ]);
    const a = await model.findOne({ channelId: '1001' }).lean();
    const b = await model.findOne({ channelId: '1002' }).lean();
    expect(a.nameDenied).toBe(true);
    expect(b.nameDenied).toBe(false);

    // A later batch that only renames the title is evaluated against the stored username too.
    await model.updateOne({ channelId: '1002' }, { $set: { username: 'casino_two' } });
    await service.createMultiple([{ channelId: '1002', title: 'Hangout renamed' }]);
    expect((await model.findOne({ channelId: '1002' }).lean()).nameDenied).toBe(true);
  });

  test('update() recomputes with the existing other field', async () => {
    await model.create({ channelId: '2001', title: 'Hangout', username: 'hangout_x', nameDenied: false, ...eligible });
    await service.update('2001', { username: 'movie_hub' } as any);
    expect((await model.findOne({ channelId: '2001' }).lean()).nameDenied).toBe(true);
    await service.update('2001', { username: 'hangout_y' } as any);
    expect((await model.findOne({ channelId: '2001' }).lean()).nameDenied).toBe(false);
    await service.update('2001', { participantsCount: 9000 } as any);
    expect((await model.findOne({ channelId: '2001' }).lean()).nameDenied).toBe(false);
  });

  // Review F5 (2026-10-25): a key present with value undefined (e.g. a DTO spread) is stripped from $set by mongoose,
  // so the stored title/username stays and the flag must be computed from it, not from undefined.
  test('update() with title/username present but undefined uses the stored value', async () => {
    await model.create({ channelId: '2002', title: 'Crypto Signals', username: 'abc_chat', nameDenied: true, ...eligible });
    await service.update('2002', { title: undefined, participantsCount: 7000 } as any);
    let doc = await model.findOne({ channelId: '2002' }).lean();
    expect(doc.title).toBe('Crypto Signals');
    expect(doc.nameDenied).toBe(true);
    await service.update('2002', { title: undefined, username: 'hub_x' } as any);
    doc = await model.findOne({ channelId: '2002' }).lean();
    expect([doc.title, doc.username, doc.nameDenied]).toEqual(['Crypto Signals', 'hub_x', true]);
    await service.update('2002', { title: 'Hangout', username: undefined } as any);
    doc = await model.findOne({ channelId: '2002' }).lean();
    expect([doc.title, doc.username, doc.nameDenied]).toEqual(['Hangout', 'hub_x', false]);
  });

  test('create() stamps it', async () => {
    await service.create({ channelId: '3001', title: 'Exam prep', username: 'prep_x', ...eligible } as any);
    expect((await model.findOne({ channelId: '3001' }).lean()).nameDenied).toBe(true);
  });
});

describe('getActiveChannels reads the flag first, regex only for legacy docs', () => {
  test('flag decides when present; legacy docs keep the regex verdict', async () => {
    // Raw inserts: legacy docs carry no nameDenied at all.
    await model.collection.insertMany([
      { channelId: '4001', title: 'Crypto legacy', username: 'legacy_a', ...eligible },
      { channelId: '4002', title: 'Hangout legacy', username: 'legacy_b', ...eligible },
      // Flagged docs: the stored verdict wins, so the regexes are not what decides them.
      { channelId: '4003', title: 'Hangout flagged', username: 'flagged_c', nameDenied: true, ...eligible },
      { channelId: '4004', title: 'Crypto flagged', username: 'flagged_d', nameDenied: false, ...eligible },
    ]);
    const ids = (await service.getActiveChannels(50, 0, [])).map((c: any) => c.channelId).sort();
    expect(ids).toEqual(['4002', '4004']);
  });

  test('existing hard filters are unchanged (size, sendability, missing username)', async () => {
    await model.collection.insertMany([
      { channelId: '5001', title: 'Small', username: 'small_a', nameDenied: false, ...eligible, participantsCount: 900 },
      { channelId: '5002', title: 'Mute', username: 'mute_b', nameDenied: false, ...eligible, canSendMsgs: false },
      { channelId: '5003', title: 'NoUser', nameDenied: false, ...eligible },
      { channelId: '5004', title: 'Good', username: 'good_d', nameDenied: false, ...eligible },
    ]);
    const ids = (await service.getActiveChannels(50, 0, ['nothing'])).map((c: any) => c.channelId);
    expect(ids).toEqual(['5004']);
  });
});

describe('schema declares the partial join-candidates index', () => {
  test('built by autoIndex with the partial filter', async () => {
    const idx = (await model.collection.indexes()).find((i: any) => i.name === 'join_candidates_participants');
    expect(idx).toBeDefined();
    expect(idx.key).toEqual({ participantsCount: -1 });
    expect(idx.partialFilterExpression).toEqual({ canSendMsgs: true, participantsCount: { $gt: 1000 } });
  });

  test('the getActiveChannels $match can use it', async () => {
    const docs = Array.from({ length: 300 }, (_, i) => ({
      channelId: String(6000 + i), title: `T${i}`, username: `u_${i}`, nameDenied: false, ...eligible,
      canSendMsgs: i % 10 === 0, participantsCount: i % 10 === 0 ? 5000 : 10,
    }));
    await model.collection.insertMany(docs);
    const plan = await model.collection.find({
      title: { $exists: true, $type: 'string', $ne: '' },
      username: { $exists: true, $type: 'string', $ne: '' },
      nameDenied: false, participantsCount: { $gt: 1000 }, canSendMsgs: true, banned: { $ne: true },
    }).hint('join_candidates_participants').explain('executionStats');
    expect(plan.executionStats.nReturned).toBe(30);
    expect(plan.executionStats.totalDocsExamined).toBe(30);
  });
});
