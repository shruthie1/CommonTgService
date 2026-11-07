// Parked-responder cutover hook (tg-platform docs/design/2026-11-05-parked-account-responder.md §7.3.1, P2),
// against a real mongod: the stop pipeline and the $$NOW lease filters are server-evaluated.
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  PARKED_CUTOVER_OP_MAX_TIME_MS,
  PARKED_PREEMPT_POLL_MS,
  PARKED_PREEMPT_WAIT_MS,
  prepareParkedCutover,
  ParkedCutoverCollection,
} from '../parked-cutover';

const MOBILE = '15552220000';
const OTHER = '15553330000';

describe('prepareParkedCutover (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let episodes: any;
  let leases: any;
  let roleEvents: any;
  let logger: { info: jest.Mock; warn: jest.Mock };

  const cols = () => ({
    episodes: episodes as unknown as ParkedCutoverCollection,
    leases: leases as unknown as ParkedCutoverCollection,
  });
  const inFuture = (ms: number) => new Date(Date.now() + ms);
  const parkedHolder = { kind: 'parked', owner: 'vm1:42:abc', app: 'promote', clientId: 'cid' };

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'parkedCutover' }).asPromise();
    episodes = connection.collection('parkedAccounts');
    leases = connection.collection('accountLeases');
    roleEvents = connection.collection('accountRoleEvents');
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await episodes.deleteMany({});
    await leases.deleteMany({});
    await roleEvents.deleteMany({});
    logger = { info: jest.fn(), warn: jest.fn() };
  });

  test('stops only the new main\'s OPEN episode: became_main, open unset, version bumped, gcAt set', async () => {
    await episodes.insertMany([
      { _id: `tg-aut:${MOBILE}:1`, mobile: MOBILE, open: true, state: 'active', version: 3, runner: { owner: 'x' } },
      { _id: `promote:${MOBILE}:0`, mobile: MOBILE, state: 'stopped', stopReason: 'age_expired', version: 7 },
      { _id: `tg-aut:${OTHER}:1`, mobile: OTHER, open: true, state: 'pending', version: 0 },
    ]);
    const sleep = jest.fn(async () => undefined);

    const result = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep });

    expect(result).toEqual({ episodesStopped: 1, lease: 'free', waitedMs: 0, errors: [] });
    const stopped = await episodes.findOne({ _id: `tg-aut:${MOBILE}:1` });
    expect(stopped.state).toBe('stopped');
    expect(stopped.stopReason).toBe('became_main');
    expect('open' in stopped).toBe(false);
    expect(stopped.version).toBe(4);
    expect(stopped.runner).toBeNull();
    expect(stopped.stoppedAt).toBeInstanceOf(Date);
    expect(stopped.gcAt.getTime() - stopped.stoppedAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect((await episodes.findOne({ _id: `promote:${MOBILE}:0` })).stopReason).toBe('age_expired');
    expect((await episodes.findOne({ _id: `tg-aut:${OTHER}:1` })).open).toBe(true);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('no lease doc, an expired parked lease, or a live holder: proceeds at once and writes no preempt request', async () => {
    await leases.insertMany([
      { _id: OTHER, holder: parkedHolder, until: new Date(Date.now() - 1_000), fence: 2 },
      { _id: '15554440000', holder: { kind: 'live', owner: 'vm2:7:z', app: 'tg-aut' }, until: inFuture(600_000), fence: 5 },
    ]);
    const sleep = jest.fn(async () => undefined);
    for (const mobile of [MOBILE, OTHER, '15554440000']) {
      const result = await prepareParkedCutover(cols(), { mobile, clientId: 'cid' }, { logger, sleep });
      expect(result.lease).toBe('free');
    }
    expect(sleep).not.toHaveBeenCalled();
    expect(await leases.countDocuments({ preemptRequested: { $exists: true } })).toBe(0);
  });

  test('an unexpired parked holder is asked to preempt; the hook proceeds as soon as it releases (waited)', async () => {
    await leases.insertOne({ _id: MOBILE, holder: parkedHolder, until: inFuture(8 * 60_000), fence: 4, preemptRequested: null });
    let polls = 0;
    let t = 0;
    const sleep = jest.fn(async (ms: number) => {
      t += ms;
      polls += 1;
      if (polls === 2) await leases.updateOne({ _id: MOBILE }, { $set: { holder: null, until: new Date() } });
    });

    const result = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep, now: () => t, requester: 'cms:test:1' });

    expect(result.lease).toBe('waited');
    expect(result.waitedMs).toBe(2 * PARKED_PREEMPT_POLL_MS);
    expect(sleep).toHaveBeenCalledTimes(2);
    const doc = await leases.findOne({ _id: MOBILE });
    expect(doc.preemptRequested.by).toEqual({ kind: 'live', owner: 'cms:test:1', app: 'tg-aut', clientId: 'cid' });
    expect(doc.preemptRequested.at).toBeInstanceOf(Date);
    expect(doc.fence).toBe(4); // CMS never takes the lease
    expect(logger.info).toHaveBeenCalled();
  });

  test('a parked holder that never lets go: waits the full 20 s, then continues (timed_out, warned)', async () => {
    await leases.insertOne({ _id: MOBILE, holder: parkedHolder, until: inFuture(8 * 60_000), fence: 1 });
    let t = 0;
    const sleep = jest.fn(async (ms: number) => { t += ms; });

    const result = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep, now: () => t });

    expect(PARKED_PREEMPT_WAIT_MS).toBe(20_000);
    expect(result.lease).toBe('timed_out');
    expect(result.waitedMs).toBe(PARKED_PREEMPT_WAIT_MS);
    expect(sleep).toHaveBeenCalledTimes(PARKED_PREEMPT_WAIT_MS / PARKED_PREEMPT_POLL_MS);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timed_out'), expect.anything());
    expect((await leases.findOne({ _id: MOBILE })).holder).toEqual(parkedHolder);
  });

  test('the deadline is wall-clock and counts query time: slow polls cannot stretch the wait', async () => {
    let t = 0;
    const findOne = jest.fn(async () => { t += 7_000; return { _id: MOBILE }; }); // each poll read takes 7 s
    const slow = {
      findOneAndUpdate: async () => null,
      updateMany: async () => { t += 3_000; return { matchedCount: 1 }; },
      findOne,
    } as unknown as ParkedCutoverCollection;
    const sleep = jest.fn(async (ms: number) => { t += ms; });

    const result = await prepareParkedCutover({ episodes: slow, leases: slow }, { mobile: MOBILE, clientId: 'cid' }, { logger, sleep, now: () => t });

    expect(result.lease).toBe('timed_out');
    expect(result.waitedMs).toBeLessThanOrEqual(PARKED_PREEMPT_WAIT_MS + 7_000); // at most one read past the deadline
    expect(findOne.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('every op carries maxTimeMS 5 s', async () => {
    const seen: Array<Record<string, unknown> | undefined> = [];
    const spy = {
      findOneAndUpdate: async (_f: unknown, _u: unknown, o?: Record<string, unknown>) => { seen.push(o); return null; },
      updateMany: async (_f: unknown, _u: unknown, o?: Record<string, unknown>) => { seen.push(o); return { matchedCount: 1 }; },
      findOne: async (_f: unknown, o?: Record<string, unknown>) => { seen.push(o); return null; },
    } as unknown as ParkedCutoverCollection;

    await prepareParkedCutover({ episodes: spy, leases: spy }, { mobile: MOBILE, clientId: 'cid' }, { logger, sleep: async () => undefined });

    expect(PARKED_CUTOVER_OP_MAX_TIME_MS).toBe(5_000);
    expect(seen).toHaveLength(3);
    for (const o of seen) expect(o?.maxTimeMS).toBe(5_000);
  });

  test('never throws: store errors are logged and the cutover continues', async () => {
    const broken = {
      findOneAndUpdate: async () => { throw new Error('episodes down'); },
      updateMany: async () => { throw new Error('leases down'); },
      findOne: async () => null,
    } as unknown as ParkedCutoverCollection;

    const result = await prepareParkedCutover({ episodes: broken, leases: broken }, { mobile: MOBILE, clientId: 'cid' }, { logger });

    expect(result.lease).toBe('error');
    expect(result.errors).toEqual(['episode stop: episodes down', 'lease: leases down']);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('accountRoleEvents: unparked for each episode the hook really closed (opId = episode _id); none when nothing was open', async () => {
    await episodes.insertMany([
      { _id: `promote:${MOBILE}:1`, app: 'promote', mobile: MOBILE, clientId: 'kavya1', open: true, state: 'active', version: 2 },
      { _id: `tg-aut:${OTHER}:1`, app: 'tg-aut', mobile: OTHER, clientId: 'x', state: 'stopped', version: 2 },
    ]);
    const first = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep: async () => undefined, roleEvents });
    const again = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep: async () => undefined, roleEvents });
    await prepareParkedCutover(cols(), { mobile: OTHER, clientId: 'cid' }, { logger, sleep: async () => undefined, roleEvents });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect([first.episodesStopped, again.episodesStopped]).toEqual([1, 0]);
    expect(await roleEvents.find({}, { projection: { _id: 0, at: 0 } }).toArray()).toEqual([{
      v: 1, mobile: MOBILE, clientId: 'kavya1', event: 'unparked', pool: 'promote', by: 'cms:parked-cutover', reason: 'became_main',
      reasonCode: 'other', opId: `promote:${MOBILE}:1`, details: { app: 'promote', stopReason: 'became_main' },
    }]);
  });
  // Review M1: promote episodes and every lease _id keep the mobile as stored, so a '+91…' form must be seen too
  // (parkedMobileForms / $in, as parked-session-guard.ts does).
  test("M1: stops a '+'-form episode and preempts a '+'-form parked lease of the canonical new main", async () => {
    await episodes.insertOne({ _id: `promote:+${MOBILE}:1`, app: 'promote', mobile: `+${MOBILE}`, open: true, state: 'active', version: 1 });
    await leases.insertOne({ _id: `+${MOBILE}`, holder: parkedHolder, until: inFuture(8 * 60_000), fence: 1 });
    let t = 0;
    const sleep = jest.fn(async (ms: number) => {
      t += ms;
      await leases.updateOne({ _id: `+${MOBILE}` }, { $set: { holder: null, until: new Date() } });
    });

    const result = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep, now: () => t });

    expect(result.episodesStopped).toBe(1);
    expect((await episodes.findOne({ _id: `promote:+${MOBILE}:1` })).stopReason).toBe('became_main');
    expect(result.lease).toBe('waited');
    expect((await leases.findOne({ _id: `+${MOBILE}` })).preemptRequested.by.kind).toBe('live');
  });

  test('round 3 (M1): parked leases under BOTH stored forms are each asked to preempt (updateMany)', async () => {
    await leases.insertMany([
      { _id: MOBILE, holder: parkedHolder, until: inFuture(8 * 60_000), fence: 1 },
      { _id: `+${MOBILE}`, holder: { ...parkedHolder, owner: 'vm2:7:def' }, until: inFuture(8 * 60_000), fence: 2 },
    ]);
    let t = 0;
    const sleep = jest.fn(async (ms: number) => {
      t += ms;
      await leases.updateMany({}, { $set: { holder: null, until: new Date() } });
    });
    const result = await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep, now: () => t });
    expect(result.lease).toBe('waited');
    expect((await leases.findOne({ _id: MOBILE })).preemptRequested.by.kind).toBe('live');
    expect((await leases.findOne({ _id: `+${MOBILE}` })).preemptRequested.by.kind).toBe('live');
  });

  test('M1: the stop, preempt and poll filters carry both mobile forms', async () => {
    const filters: unknown[] = [];
    let t = 0;
    const spy = {
      findOneAndUpdate: async (f: unknown) => { filters.push(f); return null; },
      updateMany: async (f: unknown) => { filters.push(f); return { matchedCount: 1 }; },
      findOne: async (f: unknown) => { filters.push(f); return null; },
    } as unknown as ParkedCutoverCollection;
    await prepareParkedCutover({ episodes: spy, leases: spy }, { mobile: `+${MOBILE}`, clientId: 'cid' }, { logger, sleep: async (ms) => { t += ms; }, now: () => t });
    expect(filters).toEqual([
      { mobile: { $in: [MOBILE, `+${MOBILE}`] }, open: true },
      { _id: { $in: [MOBILE, `+${MOBILE}`] }, 'holder.kind': 'parked', $expr: { $gt: ['$until', '$$NOW'] } },
      { _id: { $in: [MOBILE, `+${MOBILE}`] }, 'holder.kind': 'parked', $expr: { $gt: ['$until', '$$NOW'] } },
    ]);
  });

  test('client-side deadline per op: a stalled socket cannot hold the (awaited) swap hook', async () => {
    const stalled = {
      findOneAndUpdate: () => new Promise(() => {}),
      updateMany: () => new Promise(() => {}),
      findOne: () => new Promise(() => {}),
    } as unknown as ParkedCutoverCollection;
    const started = Date.now();
    const result = await prepareParkedCutover({ episodes: stalled, leases: stalled }, { mobile: MOBILE, clientId: 'cid' }, { logger, opDeadlineMs: 50 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.lease).toBe('error');
    expect(result.errors).toEqual([expect.stringMatching(/^episode stop: .*timed out/), expect.stringMatching(/^lease: .*timed out/)]);
  });

  test('review M3: the summary log meta masks the mobile (last 4 digits)', async () => {
    await episodes.insertOne({ _id: `tg-aut:${MOBILE}:9`, app: 'tg-aut', mobile: MOBILE, open: true, state: 'active', version: 0 });
    await prepareParkedCutover(cols(), { mobile: MOBILE, clientId: 'cid' }, { logger, sleep: async () => undefined });
    expect(logger.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mobile: '••••0000' }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(MOBILE);
  });
});
