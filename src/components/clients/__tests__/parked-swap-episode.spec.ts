// Parked-responder swap episode (tg-platform docs/design/2026-11-05-parked-account-responder.md §7.3.2, P4),
// against a real mongod: the partial unique index and the stop pipeline are server-evaluated.
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  buildSwapEpisode,
  openSwapEpisode,
  swapEpisodeKey,
  swapSupersedeFilter,
  SwapEpisodeCollection,
  SwapEpisodeControlCollection,
  SWAP_FIRST_PASS_MAX_MS,
  SWAP_FIRST_PASS_MIN_MS,
  TGAUT_PARK_MAX_AGE_MS,
} from '../parked-swap-episode';

const OLD = '15552220000';
const SWAPPED_AT = new Date('2026-11-06T06:00:00.000Z');

describe('openSwapEpisode (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let episodes: any;
  let controls: any;
  let roleEvents: any;
  let logger: { info: jest.Mock; warn: jest.Mock };
  const col = () => episodes as unknown as SwapEpisodeCollection;
  const ctl = () => controls as unknown as SwapEpisodeControlCollection;
  const input = (over: Partial<Parameters<typeof openSwapEpisode>[1]> = {}) => ({
    mobile: OLD, clientId: 'shruthi1', persona: 'shruthi', reason: 'POOL_REFILL', swappedAt: SWAPPED_AT, ...over,
  });

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'parkedSwap' }).asPromise();
    episodes = connection.collection('parkedAccounts');
    controls = connection.collection('parkedControl');
    roleEvents = connection.collection('accountRoleEvents');
    // Same index tg-platform ParkedAccountsRepository.ensureIndexes creates (mobile_open_unique).
    await episodes.createIndex({ mobile: 1 }, { name: 'mobile_open_unique', unique: true, partialFilterExpression: { open: true } });
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await episodes.deleteMany({});
    await controls.deleteMany({});
    await roleEvents.deleteMany({});
    // Final review M1: the episode opens only while parkedControl enables tg-aut for the client.
    await controls.insertMany([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true }]);
    logger = { info: jest.fn(), warn: jest.fn() };
  });

  test('inserts the tg-aut episode with the tg-platform document shape (key, anchor, 7 d, first pass +10-15 min)', async () => {
    const now = new Date('2026-11-06T06:01:00.000Z');
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl(), now: () => now, random: () => 0.5 })).toBe('inserted');
    const doc = await episodes.findOne({});
    expect(doc).toEqual({
      _id: `tg-aut:${OLD}:${SWAPPED_AT.getTime()}`,
      app: 'tg-aut',
      mobile: OLD,
      clientId: 'shruthi1',
      persona: 'shruthi',
      reason: 'POOL_REFILL',
      cutoverOpId: `shruthi1:${SWAPPED_AT.getTime()}`,
      liveSince: null,
      parkedAt: SWAPPED_AT,
      expiresAt: new Date(SWAPPED_AT.getTime() + 7 * 24 * 3600_000),
      nextRunAt: new Date(SWAPPED_AT.getTime() + SWAP_FIRST_PASS_MIN_MS + Math.round((SWAP_FIRST_PASS_MAX_MS - SWAP_FIRST_PASS_MIN_MS) * 0.5)),
      createdBy: 'cms',
      open: true,
      state: 'pending',
      passes: 0,
      connectsToday: { day: '', n: 0 },
      transientCount: 0,
      emptyStreak: 0,
      repliesTotal: 0,
      repliesToday: { day: '', n: 0 },
      runner: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    expect(TGAUT_PARK_MAX_AGE_MS).toBe(7 * 24 * 3600_000);
  });

  test('idempotent: a second call (or tg-aut\'s fallback with the same key) is "exists", one document', async () => {
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('exists');
    expect(await episodes.countDocuments({})).toBe(1);
  });

  test('an older open tg-aut episode of the same mobile is stopped as superseded, then the new one opens', async () => {
    const older = buildSwapEpisode(input({ swappedAt: new Date(SWAPPED_AT.getTime() - 86_400_000) }), new Date(), () => 0);
    await episodes.insertOne({ ...older, version: 3 });
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
    const old = await episodes.findOne({ _id: older._id });
    expect(old.state).toBe('stopped');
    expect(old.stopReason).toBe('superseded');
    expect(old.open).toBeUndefined();
    expect(old.version).toBe(4);
    expect(old.gcAt).toBeInstanceOf(Date);
    expect(await episodes.countDocuments({ mobile: OLD, open: true })).toBe(1);
  });

  test('an UNEXPIRED open episode of ANOTHER app (promote) is left alone: failed, logged, nothing thrown', async () => {
    await episodes.insertOne({ _id: `promote:${OLD}:1`, app: 'promote', mobile: OLD, open: true, state: 'active', version: 1, expiresAt: new Date(Date.now() + 3_600_000) });
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('failed');
    expect((await episodes.findOne({ _id: `promote:${OLD}:1` })).open).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('final review M1: an EXPIRED open episode of another app (never closed) is superseded; the new one opens', async () => {
    await episodes.insertOne({ _id: `promote:${OLD}:1`, app: 'promote', mobile: OLD, open: true, state: 'active', version: 1, expiresAt: new Date(Date.now() - 60_000) });
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
    const old = await episodes.findOne({ _id: `promote:${OLD}:1` });
    expect([old.state, old.stopReason, old.open]).toEqual(['stopped', 'superseded', undefined]);
  });

  test('never throws: a store error or a bad input is "failed"', async () => {
    const broken = { insertOne: jest.fn().mockRejectedValue(new Error('network')), updateMany: jest.fn(), findOne: jest.fn() };
    await expect(openSwapEpisode(broken as unknown as SwapEpisodeCollection, input(), { logger, control: ctl() })).resolves.toBe('failed');
    await expect(openSwapEpisode(col(), input({ swappedAt: new Date(NaN) }), { logger, control: ctl() })).resolves.toBe('failed');
    await expect(openSwapEpisode(col(), input({ mobile: '' }), { logger, control: ctl() })).resolves.toBe('failed');
    const supersedeFails = {
      insertOne: jest.fn().mockRejectedValue(Object.assign(new Error('E11000 dup key mobile_open_unique'), { code: 11000, keyPattern: { mobile: 1 } })),
      updateMany: jest.fn().mockRejectedValue(new Error('down')),
      findOneAndUpdate: jest.fn().mockRejectedValue(new Error('down')),
      findOne: jest.fn(),
    };
    await expect(openSwapEpisode(supersedeFails as unknown as SwapEpisodeCollection, input(), { logger, control: ctl() })).resolves.toBe('failed');
  });

  test('P4 review S1: swapDays (the return rest) is stamped on the episode; absent/0 is omitted', async () => {
    expect(await openSwapEpisode(col(), input({ swapDays: 5 }), { logger, control: ctl() })).toBe('inserted');
    expect((await episodes.findOne({})).swapDays).toBe(5);
    await episodes.deleteMany({});
    expect(await openSwapEpisode(col(), input({ swapDays: 0 }), { logger, control: ctl() })).toBe('inserted');
    expect('swapDays' in (await episodes.findOne({}))).toBe(false);
  });

  test('P4 review nit: a stalled insert is cut by the CLIENT-SIDE deadline → "failed", logged, never hangs', async () => {
    const stalled = { insertOne: jest.fn(() => new Promise(() => {})), updateMany: jest.fn(), findOne: jest.fn() };
    const started = Date.now();
    await expect(openSwapEpisode(stalled as unknown as SwapEpisodeCollection, input(), { logger, control: ctl(), opDeadlineMs: 50 })).resolves.toBe('failed');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(String(logger.warn.mock.calls[0][0])).toContain('client-side deadline');
  });

  describe('final review M1: parkedControl gate (MIRROR of tg-platform ParkedControlRepository.readState)', () => {
    const set = async (docs: Record<string, unknown>[]) => { await controls.deleteMany({}); if (docs.length) await controls.insertMany(docs); };
    const notOpened = async () => {
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('disabled');
      expect(await episodes.countDocuments({})).toBe(0);
    };

    test('no control docs at all: not opened', async () => { await set([]); await notOpened(); });
    test('global off: not opened', async () => { await set([{ _id: 'global', enabled: false }, { _id: 'tg-aut', enabled: true }]); await notOpened(); });
    test('tg-aut doc missing: not opened', async () => { await set([{ _id: 'global', enabled: true }, { _id: 'promote', enabled: true }]); await notOpened(); });
    test('tg-aut off: not opened', async () => { await set([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: false }]); await notOpened(); });
    test('enabled is the string "true": not opened (strict === true)', async () => { await set([{ _id: 'global', enabled: 'true' }, { _id: 'tg-aut', enabled: true }]); await notOpened(); });
    test('clientIds excludes the client: not opened', async () => { await set([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true, clientIds: ['other1'] }]); await notOpened(); });
    test('clientIds includes the client: opened', async () => {
      await set([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true, clientIds: ['shruthi1'] }]);
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
    });
    test('no control handle or a read error: not opened, nothing thrown', async () => {
      expect(await openSwapEpisode(col(), input(), { logger, control: null })).toBe('disabled');
      const broken = { find: jest.fn(() => ({ toArray: jest.fn().mockRejectedValue(new Error('down')) })) };
      expect(await openSwapEpisode(col(), input(), { logger, control: broken as unknown as SwapEpisodeControlCollection })).toBe('disabled');
      const stalled = { find: jest.fn(() => ({ toArray: () => new Promise(() => {}) })) };
      expect(await openSwapEpisode(col(), input(), { logger, control: stalled as unknown as SwapEpisodeControlCollection, opDeadlineMs: 50 })).toBe('disabled');
      expect(await episodes.countDocuments({})).toBe(0);
    });
  });

  describe('accountRoleEvents parked / unparked (split doc §4.2)', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    const rows = async () => (await roleEvents.find({}, { projection: { _id: 0, at: 0 } }).sort({ event: -1 }).toArray());
    const key = `tg-aut:${OLD}:${SWAPPED_AT.getTime()}`;

    test('inserted: one parked event, opId = episode _id, details carry cutoverOpId and swapDays', async () => {
      expect(await openSwapEpisode(col(), input({ reason: 'harsh', swapDays: 3 }), { logger, control: ctl(), roleEvents })).toBe('inserted');
      await settle();
      expect(await rows()).toEqual([{
        v: 1, mobile: OLD, clientId: 'shruthi1', event: 'parked', pool: 'buffer', by: 'cms:parked-swap', reason: 'harsh',
        reasonCode: 'spam_harsh', opId: key, details: { app: 'tg-aut', cutoverOpId: `shruthi1:${SWAPPED_AT.getTime()}`, swapDays: 3 },
      }]);
    });

    test('exists, disabled and failed: no event', async () => {
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl(), roleEvents })).toBe('exists');
      expect(await openSwapEpisode(col(), input({ clientId: 'other' }), { logger, control: null, roleEvents })).toBe('disabled');
      await settle();
      expect(await roleEvents.countDocuments({})).toBe(0);
    });

    test('supersede: unparked (superseded) for the older episode, parked for the new one', async () => {
      const older = buildSwapEpisode(input({ swappedAt: new Date(SWAPPED_AT.getTime() - 86_400_000) }), new Date(), () => 0);
      await episodes.insertOne(older);
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl(), roleEvents })).toBe('inserted');
      await settle();
      expect((await rows()).map((r: any) => [r.event, r.opId, r.reasonCode, r.details?.stopReason])).toEqual([
        ['unparked', older._id, 'other', 'superseded'],
        ['parked', key, 'refill', undefined],
      ]);
    });

    test('a stalled role-event insert never delays the episode result', async () => {
      const stalled = { insertOne: () => new Promise(() => {}) };
      const started = Date.now();
      expect(await openSwapEpisode(col(), input(), { logger, control: ctl(), roleEvents: stalled })).toBe('inserted');
      expect(Date.now() - started).toBeLessThan(1_000);
    });
  });

  // Review M5: tg-aut's boot fallback may insert the SAME key first (createdBy 'tg-aut', reason 'swap', no swapDays).
  // CMS's 'exists' then merges its swapDays and reason into that doc, only where the doc lacks them; one atomic
  // update, no version bump (the runner's version CAS is untouched).
  describe('M5: exists on a tg-aut fallback episode merges swapDays and reason', () => {
    const key = `tg-aut:${OLD}:${SWAPPED_AT.getTime()}`;
    const tgAutDoc = (over: Record<string, unknown> = {}) => ({
      _id: key, app: 'tg-aut', mobile: OLD, clientId: 'shruthi1', persona: 'shruthi', reason: 'swap', createdBy: 'tg-aut',
      open: true, state: 'active', version: 3, parkedAt: SWAPPED_AT, expiresAt: new Date(SWAPPED_AT.getTime() + TGAUT_PARK_MAX_AGE_MS), ...over,
    });

    test("tg-aut doc without swapDays and with tg-aut's placeholder reason 'swap': both set, version and state kept", async () => {
      await episodes.insertOne(tgAutDoc());
      expect(await openSwapEpisode(col(), input({ reason: 'harsh', swapDays: 4 }), { logger, control: ctl() })).toBe('exists');
      const doc = await episodes.findOne({ _id: key });
      expect(doc).toMatchObject({ swapDays: 4, reason: 'harsh', version: 3, state: 'active', createdBy: 'tg-aut', open: true });
    });

    test('tg-aut doc that already has swapDays and a real reason: unchanged', async () => {
      await episodes.insertOne(tgAutDoc({ swapDays: 2, reason: 'POOL_REFILL' }));
      expect(await openSwapEpisode(col(), input({ reason: 'harsh', swapDays: 4 }), { logger, control: ctl() })).toBe('exists');
      expect(await episodes.findOne({ _id: key })).toMatchObject({ swapDays: 2, reason: 'POOL_REFILL', version: 3 });
    });

    test('no swapDays from CMS: reason merged, swapDays stays absent', async () => {
      await episodes.insertOne(tgAutDoc({ reason: undefined }));
      expect(await openSwapEpisode(col(), input({ reason: 'harsh' }), { logger, control: ctl() })).toBe('exists');
      const doc = await episodes.findOne({ _id: key });
      expect(doc.reason).toBe('harsh');
      expect('swapDays' in doc).toBe(false);
    });

    test('a CMS-created doc is never touched on exists', async () => {
      expect(await openSwapEpisode(col(), input({ reason: 'POOL_REFILL' }), { logger, control: ctl() })).toBe('inserted');
      expect(await openSwapEpisode(col(), input({ reason: 'harsh', swapDays: 4 }), { logger, control: ctl() })).toBe('exists');
      const doc = await episodes.findOne({ _id: key });
      expect(doc.reason).toBe('POOL_REFILL');
      expect('swapDays' in doc).toBe(false);
    });

    test('a merge failure is logged and still "exists"', async () => {
      const dup = Object.assign(new Error('E11000 duplicate key error index: _id_'), { code: 11000, keyPattern: { _id: 1 } });
      const store = {
        insertOne: jest.fn().mockRejectedValue(dup),
        updateMany: jest.fn(),
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn().mockRejectedValue(new Error('merge down')),
      };
      expect(await openSwapEpisode(store as unknown as SwapEpisodeCollection, input({ swapDays: 4 }), { logger, control: ctl() })).toBe('exists');
      expect(store.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: key, createdBy: 'tg-aut' }, expect.any(Array), expect.objectContaining({ maxTimeMS: 5_000 }),
      );
      expect(String(logger.warn.mock.calls[0][0])).toContain('merge down');
    });
  });

  test("review M1: the supersede filter matches both mobile forms (a '+'-form episode is seen)", () => {
    expect(swapSupersedeFilter(OLD, 'id-1')).toEqual({
      mobile: { $in: [OLD, `+${OLD}`] }, open: true, _id: { $ne: 'id-1' },
      $or: [{ app: 'tg-aut' }, { $expr: { $lte: ['$expiresAt', '$$NOW'] } }],
    });
  });

  test('review M3: log meta masks the mobile (last 4 digits)', async () => {
    expect(await openSwapEpisode(col(), input(), { logger, control: ctl() })).toBe('inserted');
    expect(logger.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mobile: '••••0000' }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(OLD);
  });

  test('key format matches tg-platform episodeKey: tg-aut:{mobile}:{ms}', () => {
    expect(swapEpisodeKey(OLD, SWAPPED_AT)).toBe(`tg-aut:${OLD}:1793944800000`);
  });
});
