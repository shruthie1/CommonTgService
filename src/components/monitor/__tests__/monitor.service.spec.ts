import { MonitorService, PREWARM_PAGES } from '../monitor.service';

const NOW = Date.parse('2026-10-28T10:12:10.000Z'); // 15:42:10 IST

/** `name` = the statement's `/* monitor.<name> *\/` tag. */
type PgHandler = (name: string, sql: string, params: unknown[]) => any[] | undefined | Promise<any[] | undefined>;
type MongoHandler = (coll: string, op: 'aggregate' | 'find', arg: any) => any[] | Promise<any[]>;

const nameOf = (sql: string) => (sql.match(/^\/\* monitor\.([a-z_]+) \*\//) ?? [])[1] ?? '?';

function build(pgH: PgHandler, mongoH: MongoHandler, redis?: any) {
  const pgCalls: string[] = [];
  const pgNames: string[] = [];
  const pgParams: unknown[][] = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      pgCalls.push(sql);
      pgNames.push(nameOf(sql));
      pgParams.push(params);
      const rows = await pgH(nameOf(sql), sql, params);
      if (rows === undefined) onError?.({ kind: 'query', message: 'canceling statement due to statement timeout', code: '57014' });
      return rows;
    }),
  };
  const mongoCalls: Array<{ coll: string; op: string; arg: any }> = [];
  const connection = {
    collection: (coll: string) => ({
      aggregate: (pipeline: any) => {
        mongoCalls.push({ coll, op: 'aggregate', arg: pipeline });
        return { toArray: async () => mongoH(coll, 'aggregate', pipeline) };
      },
      find: (filter: any) => {
        mongoCalls.push({ coll, op: 'find', arg: filter });
        return { toArray: async () => mongoH(coll, 'find', filter) };
      },
    }),
  };
  const r = redis ?? { smembers: jest.fn(async () => []), mget: jest.fn(async (k: string[]) => k.map(() => null)) };
  const svc = new MonitorService(pg as any, connection as any, r);
  return { svc, pg, pgCalls, pgNames, pgParams, mongoCalls, redis: r };
}

const count = (names: string[], n: string) => names.filter((x) => x === n).length;
const flush = () => new Promise((r) => setImmediate(r));

const CLIENTS = [
  { clientId: 'alpha1', name: 'Alpha', promoteRepl: 'https://p' },
  { clientId: 'beta1', name: 'Beta', promoteRepl: '' },
];
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));

/** Window of a userData cohort pipeline: start instant (ObjectId time), byHour, paidBefore. */
function cohortArgs(p: any[]): { start: string; byHour: boolean; paidBefore: boolean } {
  const json = JSON.stringify(p);
  return {
    start: new Date(p[0].$match._id.$gte.getTimestamp().getTime()).toISOString(),
    byHour: json.includes('"$hour"'),
    paidBefore: json.includes('"$lt":["$firstPaidAt"'),
  };
}

const TODAY0 = '2026-10-27T18:30:00.000Z';
const YDAY0 = '2026-10-26T18:30:00.000Z';

function defaultMongo(coll: string, op: string, arg: any): any[] {
  if (coll === 'clients') return CLIENTS;
  if (coll === 'bufferClients') return [{ _id: 'alpha1', total: 10, eligible: 2, harsh: 3 }];
  if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 12 }];
  if (coll === 'userData' && op === 'aggregate') {
    if (arg[0].$match.firstPaidAt) {
      // first-pay rows {c, fp, mins}: today = the credited chats only; closed days = full scan
      const today = arg[0].$match.firstPaidAt.$gte === Date.parse(TODAY0);
      if (today) {
        expect(arg[0].$match.chatId.$in.length).toBeGreaterThan(0);
        return [
          { c: 'alpha1', fp: Date.parse(TODAY0) + 3_600_000, mins: 5 },
          { c: 'alpha1', fp: Date.parse(TODAY0) + 7_200_000, mins: 45 },
        ];
      }
      expect(arg[0].$match.chatId).toBeUndefined();
      const fp = Date.parse(YDAY0) + 3_600_000;
      return [
        ...[1, 2, 3, 4].map(() => ({ c: 'alpha1', fp, mins: 5 })),
        { c: 'beta1', fp, mins: 5000 },
        { c: 'alpha1', fp: Date.parse(TODAY0) - 40 * 86_400_000, mins: 5 }, // before a 30 d page
      ];
    }
    const w = cohortArgs(arg);
    if (w.paidBefore) return [{ _id: { c: 'alpha1', d: '2026-10-27' }, n: 50, same: 5 }]; // yesterday-same-time
    if (w.byHour && w.start === TODAY0) {
      return [
        { _id: { c: 'alpha1', d: '2026-10-28', h: 15 }, n: 40, same: 2 },
        { _id: { c: 'beta1', d: '2026-10-28', h: 10 }, n: 10, same: 1 },
        { _id: { d: '2026-10-28', h: 3 }, n: 5, same: 0 },
      ];
    }
    if (w.byHour && w.start === YDAY0) return [{ _id: { c: 'alpha1', d: '2026-10-27', h: 9 }, n: 4, same: 0 }];
    return []; // closed-day history cohorts (per-test override)
  }
  if (op === 'find') return [{ channelId: '-1001234567890', title: 'Chan One' }];
  return [];
}

// Fleet `today` fixture: alpha1 today revenue 500 (gross 1700 incl. a ₹1,200 receipt), beta1 100.
const PAY_TODAY = [
  { client_id: 'alpha1', ts: ist('2026-10-28T09:00:00'), chat_id: 'c1', amount: 100, owner_amount: 100, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-28T10:00:00'), chat_id: 'c2', amount: 150, owner_amount: 150, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-28T11:00:00'), chat_id: 'c3', amount: 125, owner_amount: 125, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-28T12:00:00'), chat_id: 'c4', amount: 125, owner_amount: 125, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-28T13:00:00'), chat_id: 'c4', amount: 1200, owner_amount: 1200, cheat_flagged: false },
  { client_id: 'beta1', ts: ist('2026-10-28T14:00:00'), chat_id: 'c5', amount: 100, owner_amount: 100, cheat_flagged: false },
];
// Yesterday: 300 from 2 payers before the 15:42 cut, 999 after it (not in previous; in the spark).
const PAY_HIST = [
  { client_id: 'alpha1', ts: ist('2026-10-27T09:00:00'), chat_id: 'c6', amount: 200, owner_amount: 200, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-27T09:30:00'), chat_id: 'c7', amount: 100, owner_amount: 100, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-27T20:00:00'), chat_id: 'c8', amount: 999, owner_amount: 999, cheat_flagged: false },
];
const dm = (client_id: string | null, conversion_id: string, ts: Date, channel_id = '777') => ({ client_id, channel_id, conversion_id, ts });

function defaultPg(name: string): any[] {
  switch (name) {
    case 'pay_today':
      return PAY_TODAY;
    case 'pay_hist':
      return PAY_HIST;
    case 'sends_live':
      return [
        { client_id: 'alpha1', today: true, h: 15, sent: '100', delivered: '80', banned: '15' },
        { client_id: 'alpha1', today: false, h: 9, sent: '90', delivered: '70', banned: '10' },
      ];
    case 'dm_rows_today':
      return [
        ...Array.from({ length: 7 }, (_, i) => dm('alpha1', `p:a${i}`, ist('2026-10-28T08:00:00'))),
        dm(null, 'p:n1', ist('2026-10-28T08:00:00')),
        dm(null, 'p:n2', ist('2026-10-28T08:00:00')),
      ];
    case 'dm_rows_yday':
      return [
        ...Array.from({ length: 6 }, (_, i) => dm('alpha1', `p:y${i}`, ist('2026-10-27T08:00:00'))),
        dm('alpha1', 'p:late', ist('2026-10-27T22:00:00')), // after the cut
      ];
    case 'dc_hist':
      return [
        { d: '2026-10-22', client_id: 'alpha1', sent: '700', delivered: '600', banned: '50', new_users: '300' },
        { d: '2026-10-15', client_id: 'alpha1', sent: '650', delivered: '500', banned: '40', new_users: '280' },
      ];
    case 'dms_hist':
      return [
        { d: '2026-10-26', client_id: 'alpha1', dms: '7' },
        { d: '2026-10-26', client_id: null, dms: '2' },
        { d: '2026-10-16', client_id: 'alpha1', dms: '6' },
      ];
    default:
      return [];
  }
}

describe('MonitorService.fleet', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('today: fleet totals, per-client rows, yesterday-same-time previous, spark of 7', async () => {
    const { svc } = build(defaultPg, defaultMongo);
    const r = await svc.buildFleet('today', NOW);
    expect(r.range).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    // merged fields unchanged by the additive byFamily (2026-10-29)
    const { byFamily: _fam, ...fleetMerged } = r.fleet;
    expect(fleetMerged).toEqual({
      revenue: 600,
      grossRevenue: 1800,
      flaggedRevenue: 1200,
      payers: 5,
      newUsers: 55, // Mongo cohorts incl. an unattributed doc
      conversion: 0.0545, // 3/55
      avgTicket: 120,
      sends: 100,
      sendSuccess: 80,
      banned: 15,
      dms: 9,
    });
    expect(r.previous).toMatchObject({ revenue: 300, payers: 2, newUsers: 50, conversion: 0.1, sends: 90, dms: 6 });
    const a = r.clients[0];
    expect(a).toMatchObject({
      clientId: 'alpha1',
      name: 'Alpha',
      revenue: 500,
      payers: 4,
      newUsers: 40,
      conversion: 0.05,
      avgTicket: 125,
      sends: 100,
      dms: 7,
      pool: { buffersEligible: 2, buffersTotal: 10, promoteActive: 12 },
      previous: { revenue: 300, payers: 2, newUsers: 50, conversion: 0.1 },
    });
    expect(a.spark).toEqual([0, 0, 0, 0, 0, 1299, 500]);
    const b = r.clients.find((c) => c.clientId === 'beta1')!;
    expect(b).toMatchObject({ revenue: 100, sends: 0, dms: 0, pool: { buffersEligible: 0, buffersTotal: 0, promoteActive: 0 } });
    expect(r.notes.join(' ')).toContain('15:42 IST');
    expect(r.notes.join(' ')).not.toContain('unavailable');
    expect(r.cache).toEqual({ history: 'miss', today: 'miss', ageSec: 0, historyAgeSec: 0 });
  });

  it('7d: newUsers and sends from daily_client, dms from per-day counts, conversion from cohorts in range; no promotion_send', async () => {
    const { svc, pgNames } = build(defaultPg, (c, op, arg) =>
      c === 'userData' && !JSON.stringify(arg).includes('$hour')
        ? [
            { _id: { c: 'alpha1', d: '2026-10-21' }, n: 100, same: 1 },
            { _id: { c: 'alpha1', d: '2026-10-27' }, n: 10, same: 10 },
            { _id: { c: 'alpha1', d: '2026-10-20' }, n: 50, same: 5 }, // previous block
          ]
        : defaultMongo(c, op, arg),
    );
    const r = await svc.buildFleet('7d', NOW);
    expect(pgNames.some((n) => n.startsWith('sends') || n.includes('channels'))).toBe(false);
    expect(pgNames.sort()).toEqual(['dc_hist', 'dms_hist', 'pay_hist', 'pay_today']);
    expect(r.fleet).toMatchObject({ newUsers: 300, sends: 700, sendSuccess: 600, banned: 50, conversion: 0.1, dms: 9, revenue: 1299, payers: 3 });
    expect(r.previous).toMatchObject({ newUsers: 280, conversion: 0.1, dms: 6, revenue: 0 });
    expect(r.clients.find((c) => c.clientId === 'alpha1')).toMatchObject({ dms: 7, sends: 700, newUsers: 300 });
    expect(r.notes.join(' ')).toContain('2026-10-26');
  });

  it('30d: previous window beyond userData retention (swept) → previous.conversion null, not 0, with a note', async () => {
    const { svc } = build(defaultPg, (c, op, arg) =>
      c === 'userData' && !JSON.stringify(arg).includes('$hour')
        ? [
            { _id: { c: 'alpha1', d: '2026-10-20' }, n: 100, same: 4 }, // current window
            { _id: { c: 'alpha1', d: '2026-09-10' }, n: 3, same: 0 }, // previous window: sparse survivors
          ]
        : defaultMongo(c, op, arg),
    );
    const r = await svc.buildFleet('30d', NOW);
    expect(r.fleet.conversion).toBe(0.04);
    expect(r.previous.conversion).toBeNull();
    expect(r.clients.find((x) => x.clientId === 'alpha1')!.previous.conversion).toBeNull();
    expect(r.clients.find((x) => x.clientId === 'alpha1')!.conversion).toBe(0.04);
    expect(r.notes.join(' ')).toContain('swept after 30 days idle');
    const r7 = await svc.buildFleet('7d', NOW);
    expect(r7.previous.conversion).not.toBeNull();
  });

  it('partial failure: a failed section becomes null + a note, the rest is served', async () => {
    const { svc } = build(
      (n) => (n.startsWith('pay_') ? undefined : defaultPg(n)),
      (c, op, arg) => (c === 'userData' ? Promise.reject(new Error('operation exceeded time limit')) : defaultMongo(c, op, arg)),
    );
    const r = await svc.buildFleet('today', NOW);
    expect(r.fleet.revenue).toBeNull();
    expect(r.fleet.avgTicket).toBeNull();
    expect(r.fleet.newUsers).toBeNull();
    expect(r.fleet.conversion).toBeNull();
    expect(r.fleet.sends).toBe(100);
    expect(r.clients.find((c) => c.clientId === 'alpha1')!.spark).toBeNull();
    const notes = r.notes.join('\n');
    expect(notes).toContain('revenue unavailable: query: canceling statement');
    expect(notes).toContain('conversion unavailable: operation exceeded time limit');
  });

  it('failures are not cached: the next request retries the failed part only', async () => {
    let fail = true;
    const { svc, pgNames } = build((n) => (n === 'pay_today' && fail ? undefined : defaultPg(n)), defaultMongo);
    expect((await svc.fleet('today')).fleet.revenue).toBeNull();
    fail = false;
    const before = pgNames.length;
    const r = await svc.fleet('today');
    expect(r.fleet.revenue).toBe(600);
    expect(pgNames.slice(before)).toEqual(['pay_today']);
  });
});

describe('MonitorService caching: closed-day history vs today', () => {
  let now = NOW;
  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('concurrent viewers share one load per part (single-flight)', async () => {
    const { svc, pgNames } = build(defaultPg, defaultMongo);
    await Promise.all([svc.fleet('today'), svc.fleet('today'), svc.fleet('7d')]);
    expect(count(pgNames, 'pay_hist')).toBe(1);
    expect(count(pgNames, 'pay_today')).toBe(1);
    expect(count(pgNames, 'sends_live')).toBe(1);
  });

  it('today is recomputed after the 60 s TTL; closed-day history is not', async () => {
    const { svc, pgNames } = build(defaultPg, defaultMongo);
    await svc.fleet('today');
    now = NOW + 59_000;
    const hit = await svc.fleet('today');
    expect(hit.cache).toMatchObject({ history: 'hit', today: 'hit', ageSec: 59 });
    expect(pgNames.length).toBe(5); // pay_hist, pay_today, dm_rows_yday, dm_rows_today, sends_live: nothing reloaded
    now = NOW + 61_000;
    const stale = await svc.fleet('today');
    expect(stale.cache).toMatchObject({ history: 'hit', today: 'stale', ageSec: 61 });
    await flush();
    await flush();
    expect(count(pgNames, 'pay_today')).toBe(2);
    expect(count(pgNames, 'sends_live')).toBe(2);
    expect(count(pgNames, 'dm_rows_today')).toBe(2);
    expect(count(pgNames, 'pay_hist')).toBe(1);
    expect(count(pgNames, 'dm_rows_yday')).toBe(1);
    const fresh = await svc.fleet('today');
    expect(fresh.cache).toMatchObject({ history: 'hit', today: 'hit', ageSec: 0 });
  });

  it('pool counts are refreshed every 10 min; closed-day time-to-first-pay is scanned once per IST day; today only for credited chats', async () => {
    const { svc, mongoCalls } = build(defaultPg, defaultMongo);
    const mcount = (coll: string, pred: (a: any) => boolean = () => true) => mongoCalls.filter((m) => m.coll === coll && pred(m.arg)).length;
    const ttfpHist = (a: any) => !!a[0]?.$match?.firstPaidAt && !a[0].$match.chatId;
    const ttfpToday = (a: any) => !!a[0]?.$match?.chatId;
    await svc.client('alpha1', 7);
    await svc.client('beta1', 30);
    await svc.fleetDetail(30);
    expect(mcount('bufferClients')).toBe(1);
    expect(mcount('userData', ttfpHist)).toBe(1); // one fleet-wide scan serves every page and range
    expect(mcount('userData', ttfpToday)).toBe(1);
    const today = mongoCalls.find((m) => ttfpToday(m.arg))!.arg[0].$match.chatId.$in;
    expect(today.sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']); // chats with a credit row today (PAY_TODAY)
    now = NOW + 5 * 60_000;
    await svc.client('alpha1', 7);
    await flush();
    expect(mcount('bufferClients')).toBe(1);
    expect(mcount('userData', ttfpToday)).toBe(2); // today part refreshed after 60 s
    now = NOW + 11 * 60_000;
    await svc.client('alpha1', 7);
    await flush();
    await flush();
    expect(mcount('bufferClients')).toBe(2);
    expect(mcount('userData', ttfpHist)).toBe(1); // closed days: not refreshed during the day
    now = Date.parse('2026-10-29T00:05:00+05:30');
    await svc.client('alpha1', 7);
    expect(mcount('userData', ttfpHist)).toBe(2); // next IST day: reloaded
  });

  it('stale-while-revalidate: a stale value is served immediately while ONE background refresh runs', async () => {
    let release: (() => void) | undefined;
    let todayLoads = 0;
    const { svc, pgNames } = build((n) => {
      if (n !== 'pay_today') return defaultPg(n);
      todayLoads += 1;
      if (todayLoads === 1) return PAY_TODAY;
      return new Promise((res) => (release = () => res([...PAY_TODAY, { ...PAY_TODAY[5], chat_id: 'c9', amount: 50, owner_amount: 50 }])));
    }, defaultMongo);
    await svc.fleet('today');
    now = NOW + 120_000;
    const [a, b, c] = await Promise.all([svc.fleet('today'), svc.fleet('today'), svc.fleet('today')]);
    for (const r of [a, b, c]) {
      expect(r.fleet.revenue).toBe(600); // old value, served without waiting
      expect(r.cache.today).toBe('stale');
    }
    expect(count(pgNames, 'pay_today')).toBe(2); // one refresh, not three
    release!();
    await flush();
    await flush();
    const d = await svc.fleet('today');
    expect(d.fleet.revenue).toBe(650);
    expect(d.cache.today).not.toBe('miss');
    expect(count(pgNames, 'pay_today')).toBe(2);
  });

  it('history refreshes in the background after 10 min and invalidates at IST midnight', async () => {
    const { svc, pgNames, pgParams } = build(defaultPg, defaultMongo);
    now = Date.parse('2026-10-28T18:25:00.000Z'); // 23:55 IST
    await svc.fleet('7d');
    expect(count(pgNames, 'pay_hist')).toBe(1);
    now = Date.parse('2026-10-28T18:29:59.000Z'); // 23:59:59 IST, 5 min later: fresh
    expect((await svc.fleet('7d')).cache.history).toBe('hit');
    expect(count(pgNames, 'pay_hist')).toBe(1);
    now = Date.parse('2026-10-28T18:30:01.000Z'); // 00:00:01 IST next day, history only 5 min old
    const r = await svc.fleet('7d');
    expect(r.cache.history).toBe('miss');
    expect(r.range).toEqual({ from: '2026-10-22', to: '2026-10-28' });
    expect(count(pgNames, 'pay_hist')).toBe(2);
    const histParams = pgParams.filter((_, i) => pgNames[i] === 'pay_hist');
    expect(histParams[0][1]).toBe('2026-10-27T18:30:00.000Z'); // closed days end at 10-28 00:00 IST
    expect(histParams[1][1]).toBe('2026-10-28T18:30:00.000Z'); // after midnight: end at 10-29 00:00 IST
    now = Date.parse('2026-10-28T18:41:00.000Z'); // 11 min later, same day: stale → one background refresh
    expect((await svc.fleet('7d')).cache.history).toBe('stale');
    await flush();
    await flush();
    expect(count(pgNames, 'pay_hist')).toBe(3);
  });

  it('a today value is never served after IST midnight (key carries the date)', async () => {
    const { svc, pgNames } = build(defaultPg, defaultMongo);
    now = Date.parse('2026-10-28T18:29:30.000Z');
    await svc.fleet('today');
    now = Date.parse('2026-10-28T18:30:10.000Z');
    const r = await svc.fleet('today');
    expect(r.cache.today).toBe('miss');
    expect(count(pgNames, 'pay_today')).toBe(2);
  });
});

describe('MonitorService snapshots: instant pages on warm calls, long idles and restarts', () => {
  let now = NOW;
  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  /** Resolves to 'blocked' when `p` has not settled within 50 ms (real timers). */
  const within50ms = <T>(p: Promise<T>) => Promise.race([p, new Promise<'blocked'>((r) => setTimeout(() => r('blocked'), 50))]);
  const hang = () => new Promise<any[]>(() => undefined);
  function redisStore() {
    const data = new Map<string, string>();
    return {
      data,
      smembers: jest.fn(async () => []),
      mget: jest.fn(async (k: string[]) => k.map(() => null)),
      get: jest.fn(async (k: string) => data.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        data.set(k, v);
        return 'OK';
      }),
    };
  }

  it('a warm call is served from the page snapshot: the page is not re-assembled within 60 s', async () => {
    const { svc } = build(defaultPg, defaultMongo);
    const spy = jest.spyOn(svc, 'buildFleet');
    await svc.fleet('today');
    now = NOW + 30_000;
    const r = await svc.fleet('today');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.cache).toMatchObject({ today: 'hit', ageSec: 30, snapshot: 'hit', snapshotSource: 'memory', snapshotAgeSec: 30 });
    const d = jest.spyOn(svc as any, 'buildDetail');
    await svc.fleetDetail(7);
    await svc.fleetDetail(7);
    await svc.client('alpha1', 30);
    await svc.client('alpha1', 30);
    expect(d).toHaveBeenCalledTimes(2);
  });

  it('after a long idle (past the 15 min today limit) the last page is served at once; the background rebuild waits for fresh parts', async () => {
    let todayLoads = 0;
    let release: (() => void) | undefined;
    const { svc, pgNames } = build((n) => {
      if (n !== 'pay_today') return defaultPg(n);
      todayLoads += 1;
      if (todayLoads === 1) return PAY_TODAY;
      return new Promise((res) => (release = () => res([...PAY_TODAY, { ...PAY_TODAY[5], chat_id: 'c9', amount: 50, owner_amount: 50 }])));
    }, defaultMongo);
    await svc.fleet('today');
    now = NOW + 16 * 60_000;
    const r = await within50ms(svc.fleet('today'));
    expect(r).not.toBe('blocked');
    expect((r as any).fleet.revenue).toBe(600);
    expect((r as any).cache).toMatchObject({ today: 'stale', snapshot: 'stale', snapshotAgeSec: 960 });
    await flush();
    expect(await svc.fleet('today')).toMatchObject({ fleet: { revenue: 600 } }); // a second viewer: same snapshot, no second rebuild
    await flush();
    expect(count(pgNames, 'pay_today')).toBe(2); // one background rebuild
    release!();
    await flush();
    await flush();
    const fresh = await svc.fleet('today');
    expect(fresh.fleet.revenue).toBe(650);
    expect(fresh.cache).toMatchObject({ today: 'hit', snapshot: 'hit' });
  });

  it('restart: a new process serves the last snapshot from Redis without waiting on Postgres or Mongo', async () => {
    const redis = redisStore();
    const first = build(defaultPg, defaultMongo, redis);
    await first.svc.fleet('today');
    await first.svc.fleetDetail(7);
    await flush();
    expect([...redis.data.keys()].sort()).toEqual(['monitor::snapshot::detail:all:7', 'monitor::snapshot::fleet:today']);
    now = NOW + 20_000;
    const second = build(() => hang(), () => hang(), redis);
    const r = await within50ms(second.svc.fleet('today'));
    expect(r).not.toBe('blocked');
    expect((r as any).fleet.revenue).toBe(600);
    expect((r as any).cache).toMatchObject({ snapshot: 'hit', snapshotSource: 'store', snapshotAgeSec: 20 });
    const d = await within50ms(second.svc.fleetDetail(7));
    expect(d).not.toBe('blocked');
    expect(second.pgNames).toEqual([]);
    expect(second.mongoCalls).toEqual([]);
  });

  it('prewarm rebuilds the fleet pages once when the monitor was used recently, and is skipped otherwise', async () => {
    const unused = build(defaultPg, defaultMongo, redisStore());
    expect(await unused.svc.prewarm('boot')).toEqual([]);
    expect(unused.pgNames).toEqual([]);
    expect(unused.mongoCalls).toEqual([]);

    const redis = redisStore();
    await build(defaultPg, defaultMongo, redis).svc.fleet('today');
    await flush();
    now = NOW + 5 * 60_000; // the stored snapshot is stale: prewarm rebuilds it
    const booted = build(defaultPg, defaultMongo, redis);
    expect(await booted.svc.prewarm('boot')).toEqual([...PREWARM_PAGES]);
    expect(count(booted.pgNames, 'pay_hist')).toBe(1); // pages share every part
    const n = booted.pgNames.length;
    const m = booted.mongoCalls.length;
    for (const r of [await booted.svc.fleet('today'), await booted.svc.fleet('7d'), await booted.svc.fleet('30d'), await booted.svc.fleetDetail(7), await booted.svc.fleetDetail(30)]) {
      expect(r.cache).toMatchObject({ snapshot: 'hit', snapshotSource: 'memory' });
    }
    expect(booted.pgNames.length).toBe(n);
    expect(booted.mongoCalls.length).toBe(m);
  });

  it('onModuleInit loads the stored fleet snapshots at once, so the first viewer after a restart is a memory hit', async () => {
    const redis = redisStore();
    const first = build(defaultPg, defaultMongo, redis);
    await first.svc.fleet('today');
    await first.svc.fleet('30d');
    await flush();
    const second = build(() => hang(), () => hang(), redis);
    const pw = jest.spyOn(second.svc, 'prewarm').mockResolvedValue([]);
    redis.get.mockClear();
    second.svc.onModuleInit();
    await flush();
    expect(redis.get.mock.calls.map((c) => c[0]).sort()).toEqual(PREWARM_PAGES.map((p) => `monitor::snapshot::${p}`).sort());
    redis.get.mockClear();
    expect((await second.svc.fleet('30d')).cache).toMatchObject({ snapshot: 'hit', snapshotSource: 'store' });
    expect(redis.get).not.toHaveBeenCalled();
    second.svc.onModuleDestroy();
    expect(pw).not.toHaveBeenCalled();
  });

  it('onModuleInit schedules one prewarm after the boot delay, then one after each IST midnight', async () => {
    jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'setImmediate'] });
    const { svc } = build(defaultPg, defaultMongo);
    const pw = jest.spyOn(svc, 'prewarm').mockResolvedValue([]);
    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(4_999);
    expect(pw).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(pw).toHaveBeenCalledWith('boot');
    const untilMidnightPlus2 = Date.parse('2026-10-28T18:30:00.000Z') - NOW + 120_000;
    await jest.advanceTimersByTimeAsync(untilMidnightPlus2 - 1);
    expect(pw).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(pw).toHaveBeenLastCalledWith('midnight');
    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(2 * 86_400_000);
    expect(pw).toHaveBeenCalledTimes(2);
  });

  it('live never waits on Mongo for the clients list after a long idle', async () => {
    let hangClients = false;
    const { svc } = build(defaultPg, (coll, op, arg) => (coll === 'clients' && hangClients ? hang() : defaultMongo(coll, op, arg)));
    await svc.live('all');
    hangClients = true;
    now = NOW + 16 * 60_000;
    const r = await within50ms(svc.live('all'));
    expect(r).not.toBe('blocked');
    expect((r as any).items.map((i: any) => i.clientId).sort()).toEqual(['alpha1', 'alpha1', 'beta1']);
  });
});

describe('MonitorService.client', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const payToday = [
    { client_id: 'alpha1', ts: ist('2026-10-28T15:10:00'), chat_id: 'c1', amount: 150, owner_amount: 150, cheat_flagged: false },
    { client_id: 'alpha1', ts: ist('2026-10-28T15:20:00'), chat_id: 'c2', amount: 2000, owner_amount: 2000, cheat_flagged: false }, // ≥ ₹1,000: never credited
    { client_id: 'beta1', ts: ist('2026-10-28T15:30:00'), chat_id: 'c4', amount: 100, owner_amount: 100, cheat_flagged: false },
  ];
  const payHist = [
    { client_id: 'alpha1', ts: ist('2026-10-27T09:00:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false },
    { client_id: 'alpha1', ts: ist('2026-10-27T10:00:00'), chat_id: 'c3', amount: 300, owner_amount: 0, cheat_flagged: true },
    { client_id: 'beta1', ts: ist('2026-10-27T11:00:00'), chat_id: 'c5', amount: 400, owner_amount: 400, cheat_flagged: false },
  ];

  function pg(n: string): any[] {
    switch (n) {
      case 'pay_today':
        return payToday;
      case 'pay_hist':
        return payHist;
      case 'dc_today':
        return [{ d: '2026-10-28', client_id: 'alpha1', sent: '20', delivered: '15', banned: '3', new_users: '9' }];
      case 'dc_hist':
        return [{ d: '2026-10-27', client_id: 'beta1', sent: '99', delivered: '99', banned: '0', new_users: '1' }];
      case 'dms_hist':
        return [{ d: '2026-10-27', client_id: 'alpha1', dms: '4' }, { d: '2026-10-27', client_id: 'beta1', dms: '9' }];
      case 'dm_rows_today':
        return [dm('alpha1', 'p:t1', ist('2026-10-28T08:00:00'), '555'), dm('beta1', 'p:t2', ist('2026-10-28T08:00:00'), '1234567890')];
      case 'sends_yday_hourly':
        return [{ client_id: 'alpha1', h: 9, sent: '11' }, { client_id: 'beta1', h: 9, sent: '50' }];
      case 'sends_live':
        return [{ client_id: 'alpha1', today: true, h: 14, sent: '7', delivered: '7', banned: '0' }];
      case 'mobiles_hist':
        return [
          { mobile: '919876541234', client_id: 'alpha1', new_users: '5', dms: '2', sent: '20', delivered: '15', banned: '3', first_day: '2026-10-22', last_day: '2026-10-27' },
          { mobile: '910000000001', client_id: 'beta1', new_users: '50', dms: '0', sent: '500', delivered: '400', banned: '0', first_day: '2026-10-22', last_day: '2026-10-27' },
        ];
      case 'mobiles_today':
        return [{ mobile: '919876541234', client_id: 'alpha1', new_users: '1', dms: '0', sent: '4', delivered: '4', banned: '0', first_day: '2026-10-28', last_day: '2026-10-28' }];
      case 'client_channels_dms_hist':
        return [{ channel_id: '1234567890', dms: '2' }, { channel_id: '555', dms: '1' }];
      case 'client_channels_sends_hist':
        return [{ channel_id: '1234567890', sent: '10' }];
      case 'client_channels_sends_today':
        return [{ channel_id: '1234567890', sent: '5' }];
      default:
        return defaultPg(n);
    }
  }

  it('builds daily, hourly, distributions, mobiles (masked), channels, pool from history + today parts', async () => {
    const { svc, pgCalls } = build(pg, defaultMongo);
    const r = await svc.buildClient('alpha1', 7, NOW);
    expect(r.name).toBe('Alpha');
    expect(r.daily).toHaveLength(7);
    expect(r.daily[6]).toMatchObject({ date: '2026-10-28', revenue: 150, grossRevenue: 2150, payers: 1, newUsers: 9, sends: 20, sendSuccess: 15, banned: 3, dms: 1, conversion: 0.05 });
    expect(r.daily[5]).toMatchObject({ date: '2026-10-27', revenue: 50, grossRevenue: 350, payers: 1, dms: 4, sends: 0, newUsers: 0 });
    expect(r.hourly.today[15]).toEqual({ hour: 15, revenue: 150, payers: 1, newUsers: 40, sends: 0 });
    expect(r.hourly.today[14]).toMatchObject({ sends: 7 });
    expect(r.hourly.yesterday[9]).toEqual({ hour: 9, revenue: 50, payers: 1, newUsers: 4, sends: 11 });
    expect(r.hourly.today).toHaveLength(24);
    expect(r.distributions.amount).toEqual([
      { bucket: '<100', count: 1, revenue: 50 },
      { bucket: '100-199', count: 1, revenue: 150 },
      { bucket: '200-299', count: 0, revenue: 0 },
      { bucket: '300-499', count: 0, revenue: 0 },
      { bucket: '500-999', count: 0, revenue: 0 },
    ]);
    expect(r.distributions.repeat).toEqual({ oneTime: 0, repeat: 1, repeatRevenueShare: 1 });
    // closed days (4 under 10 min) + today (1 under 10 min, 1 at 30m-2h)
    expect(r.distributions.timeToFirstPay.slice(0, 3)).toEqual([
      { bucket: '<10m', count: 5 },
      { bucket: '10-30m', count: 0 },
      { bucket: '30m-2h', count: 1 },
    ]);
    expect(r.mobiles).toEqual([
      { mobile: '••••1234', newUsers: 6, sends: 24, sendSuccess: 19, banned: 3, dms: 2, firstDay: '2026-10-22', lastDay: '2026-10-28', family: null },
    ]);
    // 555: 1 closed-day DM + 1 today = 2, ties with 1234567890 → id order
    expect(r.channels).toEqual([
      { title: 'Chan One', sends: 15, dms: 2, dmPerSend: 0.1333 },
      { title: 'channel …555', sends: 0, dms: 2, dmPerSend: null },
    ]);
    expect(r.pool).toEqual({ buffersEligible: 2, buffersTotal: 10, harsh: 3, promoteActive: 12 });
    expect(r.summary.clientId).toBe('alpha1');
    expect(r.cache).toMatchObject({ history: 'miss', today: 'miss' });
    expect(JSON.stringify(r)).not.toContain('919876541234');
    expect(JSON.stringify(r)).not.toContain('"c1"');
    expect(JSON.stringify(r)).not.toContain('p:t1');
    // only channel queries carry a client filter; everything else is a shared fleet-wide part
    for (const sql of pgCalls.filter((s) => !s.startsWith('/* monitor.client_'))) expect(sql).not.toMatch(/client_id\s*=/);
  });

  it('a second client page reuses every shared part: only its own channel queries run', async () => {
    const { svc, pgNames } = build(pg, defaultMongo);
    await svc.client('alpha1', 7);
    const before = pgNames.length;
    await svc.client('beta1', 7);
    expect(pgNames.slice(before).every((n) => n.startsWith('client_channels_'))).toBe(true);
  });

  it('unknown client gets a note, not an error; failed sections are null', async () => {
    const { svc } = build((n) => (n === 'mobiles_hist' ? undefined : pg(n)), defaultMongo);
    const r = await svc.buildClient('ghost9', 30, NOW);
    expect(r.mobiles).toBeNull();
    expect(r.notes.join('\n')).toContain('clientId ghost9 is not in the clients collection');
    expect(r.notes.join('\n')).toContain('mobiles unavailable');
  });
});

describe('MonitorService.fleetDetail', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  function pg(n: string, _sql?: string, params?: unknown[]): any[] {
    switch (n) {
      case 'channels_sends_hist':
        return (params?.[4] as string[]).includes('1234567890') ? [{ channel_id: '1234567890', sent: '30', rolled_to: '2026-10-27' }] : [];
      case 'pay_today':
        return [
          { client_id: 'alpha1', ts: ist('2026-10-28T15:10:00'), chat_id: 'c1', amount: 150, owner_amount: 150, cheat_flagged: false },
          { client_id: 'beta1', ts: ist('2026-10-28T15:40:00'), chat_id: 'c9', amount: 200, owner_amount: 200, cheat_flagged: false },
        ];
      case 'pay_hist':
        return [{ client_id: 'alpha1', ts: ist('2026-10-27T09:00:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false }];
      case 'dc_today':
        return [
          { d: '2026-10-28', client_id: 'alpha1', sent: '30', delivered: '25', banned: '3', new_users: '12' },
          { d: '2026-10-28', client_id: 'beta1', sent: '20', delivered: '15', banned: '2', new_users: '8' },
        ];
      case 'dms_hist':
        return [{ d: '2026-10-27', client_id: 'alpha1', dms: '5' }, { d: '2026-10-27', client_id: null, dms: '3' }];
      case 'sends_live':
        return [
          { client_id: 'alpha1', today: true, h: 15, sent: '10', delivered: '9', banned: '1' },
          { client_id: 'beta1', today: true, h: 15, sent: '3', delivered: '3', banned: '0' },
        ];
      case 'mobiles_hist':
        return [{ mobile: '919876541234', client_id: 'alpha1', new_users: '4', dms: '0', sent: '2', delivered: '2', banned: '0', first_day: '2026-10-22', last_day: '2026-10-26' }];
      case 'mobiles_today':
        return [{ mobile: '919876541234', client_id: 'beta1', new_users: '5', dms: '0', sent: '3', delivered: '3', banned: '0', first_day: '2026-10-28', last_day: '2026-10-28' }];
      case 'channels_dms_hist':
        return [{ channel_id: '1234567890', dms: '6.000', rolled_to: '2026-10-27' }];
      case 'channels_sends_today':
        return [];
      default:
        return defaultPg(n);
    }
  }
  function mongo(coll: string, op: string, arg: any): any[] {
    if (coll === 'bufferClients') return [{ _id: 'alpha1', total: 10, eligible: 2, harsh: 3 }, { _id: 'beta1', total: 4, eligible: 1, harsh: 0 }];
    if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 12 }, { _id: 'beta1', active: 3 }];
    return defaultMongo(coll, op, arg);
  }

  it('same shape as client detail, aggregated over every client, no client filter anywhere', async () => {
    const { svc, pgCalls, mongoCalls } = build(pg, mongo);
    const r = await svc.buildFleetDetail(7, NOW);
    // 777 is not a closed-day candidate: its closed-day sends are fetched by id separately
    expect(r).toMatchObject({ clientId: 'all', name: 'All clients', days: 7, range: { from: '2026-10-22', to: '2026-10-28' } });
    for (const sql of pgCalls) expect(sql).not.toMatch(/client_id\s*=/);
    for (const c of mongoCalls.filter((m) => m.coll === 'userData' || m.coll === 'bufferClients' || m.coll === 'promoteClients')) {
      expect(JSON.stringify(c.arg)).not.toContain('"clientId":"');
    }
    // conversion per day pools every client's cohort (alpha 40/2, beta 10/1, unattributed 5/0)
    expect(r.daily[6]).toMatchObject({ date: '2026-10-28', revenue: 350, payers: 2, newUsers: 20, conversion: 0.0545, sends: 50, dms: 9 });
    expect(r.daily[5]).toMatchObject({ date: '2026-10-27', revenue: 50, dms: 8 });
    expect(r.hourly.today[15]).toEqual({ hour: 15, revenue: 350, payers: 2, newUsers: 40, sends: 13 });
    expect(r.distributions.repeat).toEqual({ oneTime: 1, repeat: 1, repeatRevenueShare: 0.5 });
    // one mobile moved alpha1 → beta1 today: summed, owner = client on its last day
    expect(r.mobiles).toEqual([
      { mobile: '••••1234', clientId: 'beta1', newUsers: 9, sends: 5, sendSuccess: 5, banned: 0, dms: 0, firstDay: '2026-10-22', lastDay: '2026-10-28', family: null },
    ]);
    // 6 closed-day DMs (daily_channel) + 0 today on 1234567890; 777 has 9 DMs today only
    expect(r.channels[0]).toEqual({ title: 'channel …0777'.replace('0777', '777'), sends: 0, dms: 9, dmPerSend: null });
    expect(r.channels[1]).toEqual({ title: 'Chan One', sends: 30, dms: 6, dmPerSend: 0.2 });
    expect(r.pool).toEqual({ buffersEligible: 3, buffersTotal: 14, harsh: 3, promoteActive: 15 });
    // summary = the fleet row of /monitor/fleet?period=7d
    expect(r.summary).toMatchObject({ clientId: 'all', name: 'All clients', revenue: 50, payers: 1, dms: 8 });
    expect(r.summary.pool).toEqual({ buffersEligible: 3, buffersTotal: 14, promoteActive: 15 });
    expect(r.summary.spark).toHaveLength(7);
    expect(r.notes.join('\n')).not.toContain('not in the clients collection');
    expect(r.notes.join('\n')).toContain('top 20 fleet-wide');
    expect(JSON.stringify(r)).not.toContain('919876541234');
    expect(JSON.stringify(r)).not.toContain('"c1"');
  });

  it('fleet detail and /monitor/client/all are separate (client "all" filters by that id)', async () => {
    const { svc, pgNames } = build(pg, mongo);
    await svc.fleetDetail(30);
    const n = pgNames.length;
    await svc.fleetDetail(30);
    expect(pgNames.length).toBe(n);
    await svc.client('all', 30);
    expect(pgNames.slice(n).some((x) => x.startsWith('client_channels_'))).toBe(true);
  });
});

describe('MonitorService.live', () => {
  let now = NOW;
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now));
  afterEach(() => jest.restoreAllMocks());

  const hb = (o: object) => JSON.stringify({ v: 1, intervalSec: 30, ...o });

  it('one SMEMBERS + one MGET over expected ∪ index keys; classifies and masks', async () => {
    const redis = {
      smembers: jest.fn(async () => ['promote::canary9', 'bogus::x']),
      mget: jest.fn(async (keys: string[]) =>
        keys.map((k) => {
          if (k === 'heartbeat::tg-aut::alpha1') return hb({ at: NOW - 20_000, mobile: '919999991111', status: 'ready' });
          if (k === 'heartbeat::promote::canary9') return hb({ at: NOW - 400_000 });
          if (k === 'heartbeat::promote::alpha1') return 'not json';
          return null;
        }),
      ),
    };
    const { svc } = build(defaultPg, defaultMongo, redis);
    const r = await svc.live('all');
    expect(redis.smembers).toHaveBeenCalledTimes(1);
    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redis.mget.mock.calls[0][0].sort()).toEqual(
      ['heartbeat::promote::alpha1', 'heartbeat::promote::canary9', 'heartbeat::tg-aut::alpha1', 'heartbeat::tg-aut::beta1'].sort(),
    );
    const by = (svc: string, id: string) => r.items.find((i) => i.svc === svc && i.clientId === id)!;
    expect(by('tg-aut', 'alpha1')).toMatchObject({ state: 'live', ageSec: 20, mobile: '••••1111', status: 'ready', v: 1 });
    expect(by('tg-aut', 'beta1')).toMatchObject({ state: 'no-heartbeat', ageSec: null });
    expect(by('promote', 'canary9')).toMatchObject({ state: 'stale', ageSec: 400 });
    expect(by('promote', 'alpha1')).toMatchObject({ state: 'stale', parseError: true });
    expect(r.redis).toBe('ok');
    expect(r.cacheAgeSec).toBe(0);
    const p = await svc.live('promote');
    expect(p.items.every((i) => i.svc === 'promote')).toBe(true);
    expect(redis.mget).toHaveBeenCalledTimes(1); // 5 s cache shared across svc filters
  });

  it('Redis failure serves the last snapshot marked stale; age recomputed on the CMS clock', async () => {
    let fail = false;
    const redis = {
      smembers: jest.fn(async () => {
        if (fail) throw new Error('Connection is closed.');
        return [];
      }),
      mget: jest.fn(async (keys: string[]) => keys.map((k) => (k === 'heartbeat::tg-aut::alpha1' ? hb({ at: NOW - 10_000 }) : null))),
    };
    const { svc } = build(defaultPg, defaultMongo, redis);
    now = NOW;
    await svc.live('all');
    fail = true;
    now = NOW + 60_000;
    const r = await svc.live('tg-aut');
    expect(r.redis).toBe('unavailable');
    expect(r.stale).toBe(true);
    expect(r.cacheAgeSec).toBe(60);
    expect(r.items.find((i) => i.clientId === 'alpha1')).toMatchObject({ state: 'live', ageSec: 70 });
    now = NOW + 120_000;
    const r2 = await svc.live('tg-aut');
    expect(r2.items.find((i) => i.clientId === 'alpha1')!.state).toBe('stale');
    expect(r2.notes.join(' ')).toContain('serving last snapshot');
    now = NOW;
  });

  it('Redis hanging past the 2 s deadline → unavailable, no throw', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const redis = { smembers: jest.fn(() => new Promise<string[]>(() => undefined)), mget: jest.fn() };
      const { svc } = build(defaultPg, defaultMongo, redis);
      const p = svc.live('all');
      await jest.advanceTimersByTimeAsync(2_001);
      const r = await p;
      expect(r.redis).toBe('unavailable');
      expect(r.items).toEqual([]);
      expect(r.notes.join(' ')).toContain('timed out after 2000 ms');
    } finally {
      jest.useRealTimers();
    }
  });
});
