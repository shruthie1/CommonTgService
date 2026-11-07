// Parked-session guard (tg-platform design 2026-11-05 "P4 review fixes" item 1): pool-session connects skip a mobile
// that tg-platform's parked responder may hold. Fail closed on every read problem.
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { checkParkedSession, describeParkedVerdict, openParkedEpisodeMobiles, parkedMobileForms } from '../parked-session-guard';

// parkedControl defaults to an enabled doc for every _id (global and both apps on, no clientIds list): review M8.
function fakeDb(rows: { parkedAccounts?: any; accountLeases?: any; parkedControl?: any; throwOn?: string; stall?: boolean } = {}) {
  const calls: Array<{ name: string; filter: any; options: any }> = [];
  return {
    calls,
    collection: (name: string) => ({
      findOne: async (filter: any, options: any) => {
        calls.push({ name, filter, options });
        if (rows.stall) return new Promise(() => {});
        if (rows.throwOn === name) throw new Error(`${name} down`);
        if (name === 'parkedControl') return 'parkedControl' in rows ? rows.parkedControl : { enabled: true };
        return (rows as any)[name] ?? null;
      },
    }),
  };
}

describe('parkedMobileForms', () => {
  it('canonical and +canonical, from either input form', () => {
    expect(parkedMobileForms('919000080001')).toEqual(['919000080001', '+919000080001']);
    expect(parkedMobileForms(' +919000080001 ')).toEqual(['919000080001', '+919000080001']);
  });
  it('[] for a non-phone', () => {
    expect(parkedMobileForms('')).toEqual([]);
    expect(parkedMobileForms('abc')).toEqual([]);
    expect(parkedMobileForms(undefined as any)).toEqual([]);
  });
});

describe('checkParkedSession', () => {
  it('free when neither collection matches; both reads use both mobile forms and maxTimeMS', async () => {
    const db = fakeDb();
    expect(await checkParkedSession(db, '+919000080001')).toEqual({ busy: false });
    const ep = db.calls.find((c) => c.name === 'parkedAccounts')!;
    const lease = db.calls.find((c) => c.name === 'accountLeases')!;
    expect(ep.filter).toEqual({
      mobile: { $in: ['919000080001', '+919000080001'] }, open: true, $expr: { $gt: ['$expiresAt', '$$NOW'] },
      $or: [{ app: 'tg-aut' }, { app: 'promote' }],
    });
    const control = db.calls.filter((c) => c.name === 'parkedControl');
    expect(control.map((c) => c.filter._id)).toEqual(['global', 'tg-aut', 'promote']);
    for (const c of control) expect(c.options.maxTimeMS).toBeGreaterThan(0);
    expect(lease.filter).toEqual({ _id: { $in: ['919000080001', '+919000080001'] }, 'holder.kind': 'parked', $expr: { $gt: ['$until', '$$NOW'] } });
    expect(ep.options.maxTimeMS).toBeGreaterThan(0);
    expect(lease.options.maxTimeMS).toBeGreaterThan(0);
  });
  it('open episode → busy open_episode', async () => {
    expect(await checkParkedSession(fakeDb({ parkedAccounts: { _id: 'x' } }), '919000080001')).toEqual({ busy: true, reason: 'open_episode' });
  });
  it('unexpired parked lease → busy parked_lease', async () => {
    expect(await checkParkedSession(fakeDb({ accountLeases: { _id: '919000080001' } }), '919000080001')).toEqual({ busy: true, reason: 'parked_lease' });
  });
  it('fail closed: read error, stalled read (client deadline), no db, non-phone', async () => {
    expect(await checkParkedSession(fakeDb({ throwOn: 'accountLeases' }), '919000080001')).toMatchObject({ busy: true, reason: 'read_error' });
    const started = Date.now();
    const stalled = await checkParkedSession(fakeDb({ stall: true }), '919000080001', { deadlineMs: 50 });
    expect(stalled).toMatchObject({ busy: true, reason: 'read_error' });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await checkParkedSession(null, '919000080001')).toEqual({ busy: true, reason: 'guard_unavailable' });
    expect(await checkParkedSession(fakeDb(), 'not-a-phone')).toMatchObject({ busy: true, reason: 'read_error' });
  });
  it('describeParkedVerdict', () => {
    expect(describeParkedVerdict({ busy: false })).toBe('free');
    expect(describeParkedVerdict({ busy: true, reason: 'open_episode' })).toBe('parked responder guard: open_episode');
  });
});

// Final review M1(b): an open episode past expiresAt (nobody closed it: kill switch off, app gone) is NOT busy, on the
// server clock ($$NOW), so it cannot block heal/rotate/session or L1 forever. Real mongod: $expr is server-evaluated.
describe('expired open episodes (real Mongo, $$NOW)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  const LIVE = '919000080011';
  const EXPIRED = '919000080012';
  const NO_EXPIRY = '919000080013';

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'parkedGuard' }).asPromise();
    const now = Date.now();
    await connection.collection('parkedAccounts').insertMany([
      { _id: 'ep-live' as any, app: 'tg-aut', mobile: LIVE, open: true, expiresAt: new Date(now + 3_600_000) },
      { _id: 'ep-expired' as any, app: 'tg-aut', mobile: EXPIRED, open: true, expiresAt: new Date(now - 60_000) },
      { _id: 'ep-noexp' as any, app: 'tg-aut', mobile: NO_EXPIRY, open: true },
    ]);
    await connection.collection('parkedControl').insertMany([{ _id: 'global' as any, enabled: true }, { _id: 'tg-aut' as any, enabled: true }]);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  it('checkParkedSession: unexpired open episode is busy; expired (or no expiresAt) is free', async () => {
    const db = { collection: (n: string) => connection.collection(n) } as any;
    expect(await checkParkedSession(db, LIVE)).toEqual({ busy: true, reason: 'open_episode' });
    expect(await checkParkedSession(db, EXPIRED)).toEqual({ busy: false });
    expect(await checkParkedSession(db, NO_EXPIRY)).toEqual({ busy: false });
  });

  it('openParkedEpisodeMobiles (L1): only unexpired open episodes', async () => {
    const out = await openParkedEpisodeMobiles(connection.collection('parkedAccounts') as any);
    expect(out.error).toBeUndefined();
    expect([...out.open]).toEqual([LIVE]);
  });
});

// Review M8: a kill switch turned off (or a client dropped from the canary list) leaves open episodes nobody runs.
// The guard honours parkedControl (global AND app AND clientIds, missing doc = disabled, tg-platform readState):
// an episode of a disabled app/client is NOT busy; a parked LEASE still is; an unreadable parkedControl is busy.
describe('M8: parkedControl gate on open episodes (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  const ON = '919000080021';       // tg-aut episode, client c1 (in the canary list)
  const OFF_CLIENT = '919000080022'; // tg-aut episode, client c2 (not in the list)
  const PROMOTE = '919000080023';  // promote episode, promote doc missing = disabled
  const LEASED = '919000080024';   // disabled episode + unexpired parked lease
  const db = () => ({ collection: (n: string) => connection.collection(n) }) as any;
  const setControl = async (docs: any[]) => {
    await connection.collection('parkedControl').deleteMany({});
    if (docs.length) await connection.collection('parkedControl').insertMany(docs);
  };

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'parkedGuardM8' }).asPromise();
    const future = new Date(Date.now() + 3_600_000);
    await connection.collection('parkedAccounts').insertMany([
      { _id: 'ep-on' as any, app: 'tg-aut', clientId: 'c1', mobile: ON, open: true, expiresAt: future },
      { _id: 'ep-off' as any, app: 'tg-aut', clientId: 'c2', mobile: OFF_CLIENT, open: true, expiresAt: future },
      { _id: 'ep-promote' as any, app: 'promote', clientId: 'c1', mobile: `+${PROMOTE}`, open: true, expiresAt: future },
      { _id: 'ep-leased' as any, app: 'tg-aut', clientId: 'c2', mobile: LEASED, open: true, expiresAt: future },
    ]);
    await connection.collection('accountLeases').insertOne({ _id: LEASED as any, holder: { kind: 'parked' }, until: future });
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  it('enabled app + client in clientIds → busy; client not listed, app doc missing → free; lease → busy regardless', async () => {
    await setControl([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true, clientIds: ['c1'] }]);
    expect(await checkParkedSession(db(), ON)).toEqual({ busy: true, reason: 'open_episode' });
    expect(await checkParkedSession(db(), OFF_CLIENT)).toEqual({ busy: false });
    expect(await checkParkedSession(db(), PROMOTE)).toEqual({ busy: false });
    expect(await checkParkedSession(db(), LEASED)).toEqual({ busy: true, reason: 'parked_lease' });
  });

  it('no clientIds list = every client of an enabled app; promote enabled matches the +form episode', async () => {
    await setControl([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true }, { _id: 'promote', enabled: true }]);
    expect(await checkParkedSession(db(), OFF_CLIENT)).toEqual({ busy: true, reason: 'open_episode' });
    expect(await checkParkedSession(db(), PROMOTE)).toEqual({ busy: true, reason: 'open_episode' });
  });

  it('global off (or missing) → no episode is busy; the parked lease still is', async () => {
    for (const docs of [[{ _id: 'global', enabled: false }, { _id: 'tg-aut', enabled: true }], [{ _id: 'tg-aut', enabled: true }], []]) {
      await setControl(docs);
      expect(await checkParkedSession(db(), ON)).toEqual({ busy: false });
      expect(await checkParkedSession(db(), LEASED)).toEqual({ busy: true, reason: 'parked_lease' });
    }
  });

  it('app doc disabled → its episodes are free', async () => {
    await setControl([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: false }]);
    expect(await checkParkedSession(db(), ON)).toEqual({ busy: false });
  });

  it('openParkedEpisodeMobiles: only episodes of enabled app/client; no control handle → every open episode (fail closed)', async () => {
    await setControl([{ _id: 'global', enabled: true }, { _id: 'tg-aut', enabled: true, clientIds: ['c1'] }]);
    const episodes = connection.collection('parkedAccounts') as any;
    const gated = await openParkedEpisodeMobiles(episodes, { control: connection.collection('parkedControl') as any });
    expect(gated.error).toBeUndefined();
    expect([...gated.open]).toEqual([ON]);
    await setControl([]);
    expect([...(await openParkedEpisodeMobiles(episodes, { control: connection.collection('parkedControl') as any })).open]).toEqual([]);
    const ungated = await openParkedEpisodeMobiles(episodes);
    expect([...ungated.open].sort()).toEqual([ON, OFF_CLIENT, PROMOTE, LEASED].sort());
  });

  it('openParkedEpisodeMobiles: a parkedControl read error counts every open episode (fail closed) and reports it', async () => {
    const episodes = connection.collection('parkedAccounts') as any;
    const broken = { findOne: async () => { throw new Error('control down'); } };
    const out = await openParkedEpisodeMobiles(episodes, { control: broken as any });
    expect([...out.open].sort()).toEqual([ON, OFF_CLIENT, PROMOTE, LEASED].sort());
    expect(out.controlError).toMatch(/control down/);
  });
});

describe('M8: parkedControl read problems keep the guard fail closed', () => {
  it('a parkedControl read error is busy read_error even with no episode and no lease', async () => {
    expect(await checkParkedSession(fakeDb({ throwOn: 'parkedControl' }), '919000080031')).toMatchObject({ busy: true, reason: 'read_error' });
  });
  it('a parkedControl read that stalls hits the client deadline (busy read_error)', async () => {
    const db = { collection: (name: string) => ({ findOne: async () => (name === 'parkedControl' ? new Promise(() => {}) : null) }) };
    const started = Date.now();
    expect(await checkParkedSession(db, '919000080032', { deadlineMs: 50 })).toMatchObject({ busy: true, reason: 'read_error' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
