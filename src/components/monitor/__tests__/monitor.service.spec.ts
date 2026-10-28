import { MonitorService } from '../monitor.service';

const NOW = Date.parse('2026-10-28T10:12:10.000Z'); // 15:42:10 IST

type PgHandler = (name: string, sql: string, params: unknown[]) => any[] | undefined | Promise<any[] | undefined>;
type MongoHandler = (coll: string, op: 'aggregate' | 'find', arg: any) => any[] | Promise<any[]>;

function build(pgH: PgHandler, mongoH: MongoHandler, redis?: any) {
  const pgCalls: string[] = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      pgCalls.push(sql);
      const name = sql;
      const rows = await pgH(name, sql, params);
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
  return { svc, pg, pgCalls, mongoCalls, redis: r };
}

const CLIENTS = [
  { clientId: 'alpha1', name: 'Alpha', promoteRepl: 'https://p' },
  { clientId: 'beta1', name: 'Beta', promoteRepl: '' },
];

function defaultMongo(coll: string, op: string, arg: any): any[] {
  if (coll === 'clients') return CLIENTS;
  if (coll === 'bufferClients') return [{ _id: 'alpha1', total: 10, eligible: 2, harsh: 3 }];
  if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 12 }];
  if (coll === 'userData' && op === 'aggregate') {
    const json = JSON.stringify(arg);
    if (json.includes('$bucket')) return [{ _id: 0, n: 4 }, { _id: 30, n: 1 }];
    if (json.includes('firstPaidAt",') && json.includes('"$lt":["$firstPaidAt"')) {
      // yesterday-same-time cohort
      return [{ _id: { c: 'alpha1', d: '2026-10-27' }, n: 50, same: 5 }];
    }
    if (json.includes('"$hour"')) return [{ _id: { c: 'alpha1', d: '2026-10-28', h: 15 }, n: 3, same: 0 }];
    return [
      { _id: { c: 'alpha1', d: '2026-10-28' }, n: 40, same: 2 },
      { _id: { c: 'beta1', d: '2026-10-28' }, n: 10, same: 1 },
      { _id: { d: '2026-10-28' }, n: 5, same: 0 },
    ];
  }
  if (op === 'find') return [{ channelId: '-1001234567890', title: 'Chan One' }];
  return [];
}

function defaultPg(_n: string, sql: string): any[] {
  if (sql.includes('GROUPING(client_id)') && sql.includes('payment_event_owner')) {
    return [
      { client_id: 'alpha1', is_total: 0, revenue: '500', gross: '1700', payers: '4', prev_revenue: '300', prev_gross: '300', prev_payers: '2' },
      { client_id: 'beta1', is_total: 0, revenue: '100', gross: '100', payers: '1', prev_revenue: '0', prev_gross: '0', prev_payers: '0' },
      { client_id: null, is_total: 1, revenue: '600', gross: '1800', payers: '5', prev_revenue: '300', prev_gross: '300', prev_payers: '2' },
    ];
  }
  if (sql.includes('::date::text AS d, coalesce(sum(owner_amount)')) return [{ client_id: 'alpha1', d: '2026-10-28', revenue: '500' }];
  if (sql.includes('FROM promotion_send') && sql.includes('prev_sent')) {
    return [{ client_id: 'alpha1', sent: '100', delivered: '80', banned: '15', prev_sent: '90', prev_delivered: '70', prev_banned: '10' }];
  }
  if (sql.includes('FROM daily_client') && sql.includes('prev_sent')) {
    return [{ client_id: 'alpha1', sent: '700', delivered: '600', banned: '50', new_users: '300', prev_sent: '650', prev_delivered: '500', prev_banned: '40', prev_new_users: '280' }];
  }
  if (sql.includes('FROM conversion_event') && sql.includes('GROUPING')) {
    return [
      { client_id: 'alpha1', is_total: 0, dms: '7', prev_dms: '6' },
      { client_id: null, is_total: 0, dms: '2', prev_dms: '0' },
      { client_id: null, is_total: 1, dms: '9', prev_dms: '6' },
    ];
  }
  return [];
}

describe('MonitorService.fleet', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('today: fleet totals, per-client rows, yesterday-same-time previous, spark of 7', async () => {
    const { svc } = build(defaultPg, defaultMongo);
    const r = await svc.buildFleet('today', NOW);
    expect(r.range).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    expect(r.fleet).toEqual({
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
    expect(a.spark).toEqual([0, 0, 0, 0, 0, 0, 500]);
    const b = r.clients.find((c) => c.clientId === 'beta1')!;
    expect(b).toMatchObject({ sends: 0, dms: 0, pool: { buffersEligible: 0, buffersTotal: 0, promoteActive: 0 } });
    expect(r.notes.join(' ')).toContain('15:42 IST');
    expect(r.notes.join(' ')).not.toContain('unavailable');
  });

  it('7d: newUsers and sends come from daily_client; conversion from Mongo cohorts in range', async () => {
    const { svc, pgCalls } = build(defaultPg, (c, op, arg) =>
      c === 'userData'
        ? [
            { _id: { c: 'alpha1', d: '2026-10-21' }, n: 100, same: 1 },
            { _id: { c: 'alpha1', d: '2026-10-27' }, n: 10, same: 10 },
            { _id: { c: 'alpha1', d: '2026-10-20' }, n: 50, same: 5 }, // previous block
          ]
        : defaultMongo(c, op, arg),
    );
    const r = await svc.buildFleet('7d', NOW);
    expect(pgCalls.some((s) => s.includes('FROM promotion_send'))).toBe(false);
    expect(r.fleet).toMatchObject({ newUsers: 300, sends: 700, sendSuccess: 600, banned: 50, conversion: 0.1 });
    expect(r.previous).toMatchObject({ newUsers: 280, conversion: 0.1 });
    expect(r.notes.join(' ')).toContain('2026-10-26');
  });

  it('30d: previous window beyond userData retention (swept) → previous.conversion null, not 0, with a note', async () => {
    const { svc } = build(defaultPg, (c, op, arg) =>
      c === 'userData'
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
    // 7d previous is inside retention: still computed
    const r7 = await svc.buildFleet('7d', NOW);
    expect(r7.previous.conversion).not.toBeNull();
  });

  it('partial failure: a failed section becomes null + a note, the rest is served', async () => {
    const { svc } = build(
      (n, sql, p) => (sql.includes('payment_event_owner') ? undefined : defaultPg(n, sql)),
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

  it('caches 60 s per period with single-flight', async () => {
    const { svc, pg } = build(defaultPg, defaultMongo);
    await Promise.all([svc.fleet('today'), svc.fleet('today')]);
    const n = pg.query.mock.calls.length;
    await svc.fleet('today');
    expect(pg.query.mock.calls.length).toBe(n);
    await svc.fleet('7d');
    expect(pg.query.mock.calls.length).toBeGreaterThan(n);
  });
});

describe('MonitorService.client', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));
  const pay = [
    { ts: ist('2026-10-28T15:10:00'), chat_id: 'c1', amount: 150, owner_amount: 150, cheat_flagged: false },
    { ts: ist('2026-10-28T15:20:00'), chat_id: 'c2', amount: 2000, owner_amount: 2000, cheat_flagged: false }, // ≥ ₹1,000: never credited
    { ts: ist('2026-10-27T09:00:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false },
    { ts: ist('2026-10-27T10:00:00'), chat_id: 'c3', amount: 300, owner_amount: 0, cheat_flagged: true },
  ];

  function pg(_n: string, sql: string): any[] {
    if (sql.includes('SELECT ts, chat_id')) return pay;
    if (sql.includes('LIMIT 20')) return [{ channel_id: '1234567890', dms: '2' }, { channel_id: '555', dms: '1' }];
    if (sql.includes('channel_id = ANY')) return [{ channel_id: '1234567890', sent: '10' }];
    if (sql.includes('FROM daily_client')) return [{ d: '2026-10-28', sent: '20', delivered: '15', banned: '3', new_users: '9' }];
    if (sql.includes('FROM conversion_event') && sql.includes('AS d')) return [{ d: '2026-10-27', dms: '4' }];
    if (sql.includes('extract(hour')) return [{ d: '2026-10-27', h: 9, sent: '11' }];
    if (sql.includes('FROM daily_mobile')) return [{ mobile: '919876541234', new_users: '5', dms: '2', sent: '20', delivered: '15', banned: '3', first_day: '2026-10-22', last_day: '2026-10-28' }];
    return defaultPg(_n, sql);
  }

  it('builds daily, hourly, distributions, mobiles (masked), channels, pool', async () => {
    const { svc } = build(pg, defaultMongo);
    const r = await svc.buildClient('alpha1', 7, NOW);
    expect(r.name).toBe('Alpha');
    expect(r.daily).toHaveLength(7);
    const today = r.daily[6];
    expect(today).toMatchObject({ date: '2026-10-28', revenue: 150, grossRevenue: 2150, payers: 1, newUsers: 9, sends: 20, sendSuccess: 15, banned: 3, dms: 0 });
    expect(r.daily[5]).toMatchObject({ date: '2026-10-27', revenue: 50, grossRevenue: 350, payers: 1, dms: 4, sends: 0 });
    expect(r.hourly.today[15]).toEqual({ hour: 15, revenue: 150, payers: 1, newUsers: 3, sends: 0 });
    expect(r.hourly.yesterday[9]).toEqual({ hour: 9, revenue: 50, payers: 1, newUsers: 0, sends: 11 });
    expect(r.hourly.today).toHaveLength(24);
    expect(r.distributions.amount).toEqual([
      { bucket: '<100', count: 1, revenue: 50 },
      { bucket: '100-199', count: 1, revenue: 150 },
      { bucket: '200-299', count: 0, revenue: 0 },
      { bucket: '300-499', count: 0, revenue: 0 },
      { bucket: '500-999', count: 0, revenue: 0 },
    ]);
    expect(r.distributions.repeat).toEqual({ oneTime: 0, repeat: 1, repeatRevenueShare: 1 });
    expect(r.distributions.timeToFirstPay[0]).toEqual({ bucket: '<10m', count: 4 });
    expect(r.mobiles).toEqual([
      { mobile: '••••1234', newUsers: 5, sends: 20, sendSuccess: 15, banned: 3, dms: 2, firstDay: '2026-10-22', lastDay: '2026-10-28' },
    ]);
    expect(r.channels[0]).toEqual({ title: 'Chan One', sends: 10, dms: 2, dmPerSend: 0.2 });
    expect(r.channels[1]).toEqual({ title: 'channel …555', sends: 0, dms: 1, dmPerSend: null });
    expect(r.pool).toEqual({ buffersEligible: 2, buffersTotal: 10, harsh: 3, promoteActive: 12 });
    expect(r.summary.clientId).toBe('alpha1');
    expect(JSON.stringify(r)).not.toContain('919876541234');
    expect(JSON.stringify(r)).not.toContain('"c1"');
  });

  it('unknown client gets a note, not an error; failed sections are null', async () => {
    const { svc } = build((n, sql) => (sql.includes('FROM daily_mobile') ? undefined : pg(n, sql)), defaultMongo);
    const r = await svc.buildClient('ghost9', 30, NOW);
    expect(r.mobiles).toBeNull();
    expect(r.notes.join('\n')).toContain('clientId ghost9 is not in the clients collection');
    expect(r.notes.join('\n')).toContain('mobiles unavailable');
  });
});

describe('MonitorService.fleetDetail', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));
  const pay = [
    { ts: ist('2026-10-28T15:10:00'), chat_id: 'c1', amount: 150, owner_amount: 150, cheat_flagged: false },
    { ts: ist('2026-10-28T15:40:00'), chat_id: 'c9', amount: 200, owner_amount: 200, cheat_flagged: false },
    { ts: ist('2026-10-27T09:00:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false },
  ];
  function pg(_n: string, sql: string): any[] {
    if (sql.includes('SELECT ts, chat_id')) return pay;
    if (sql.includes('LIMIT 20') && sql.includes('conversion_event')) return [{ channel_id: '1234567890', dms: '6' }];
    if (sql.includes('FROM daily_channel')) return [{ channel_id: '1234567890', sent: '30', rolled_to: '2026-10-25' }];
    if (sql.includes('FROM daily_client') && !sql.includes('prev_sent')) return [{ d: '2026-10-28', sent: '50', delivered: '40', banned: '5', new_users: '20' }];
    if (sql.includes('FROM conversion_event') && sql.includes('::text AS d,')) return [{ d: '2026-10-27', dms: '8' }];
    if (sql.includes('extract(hour')) return [{ d: '2026-10-28', h: 15, sent: '13' }];
    if (sql.includes('FROM daily_mobile')) return [{ mobile: '919876541234', client_id: 'beta1', new_users: '9', dms: '0', sent: '5', delivered: '5', banned: '0', first_day: '2026-10-22', last_day: '2026-10-28' }];
    return defaultPg(_n, sql);
  }
  function mongo(coll: string, op: string, arg: any): any[] {
    if (coll === 'bufferClients') return [{ _id: 'alpha1', total: 10, eligible: 2, harsh: 3 }, { _id: 'beta1', total: 4, eligible: 1, harsh: 0 }];
    if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 12 }, { _id: 'beta1', active: 3 }];
    return defaultMongo(coll, op, arg);
  }

  it('same shape as client detail, aggregated over every client, no client filter anywhere', async () => {
    const { svc, pgCalls, mongoCalls } = build(pg, mongo);
    const r = await svc.buildFleetDetail(7, NOW);
    expect(r).toMatchObject({ clientId: 'all', name: 'All clients', days: 7, range: { from: '2026-10-22', to: '2026-10-28' } });
    for (const sql of pgCalls.filter((s) => !s.includes('GROUPING') && !s.includes('prev_sent') && !s.includes('AS d, coalesce(sum(owner_amount)'))) {
      expect(sql).not.toMatch(/client_id\s*=/);
    }
    for (const c of mongoCalls.filter((m) => m.coll === 'userData' || m.coll === 'bufferClients' || m.coll === 'promoteClients')) {
      expect(JSON.stringify(c.arg)).not.toContain('"clientId":"');
    }
    // conversion per day pools every client's cohort (alpha 40/2, beta 10/1, unattributed 5/0)
    expect(r.daily[6]).toMatchObject({ date: '2026-10-28', revenue: 350, payers: 2, newUsers: 20, conversion: 0.0545, sends: 50, dms: 0 });
    expect(r.daily[5]).toMatchObject({ date: '2026-10-27', revenue: 50, dms: 8 });
    expect(r.hourly.today[15]).toEqual({ hour: 15, revenue: 350, payers: 2, newUsers: 3, sends: 13 });
    expect(r.distributions.repeat).toEqual({ oneTime: 1, repeat: 1, repeatRevenueShare: 0.5 });
    expect(r.mobiles).toEqual([
      { mobile: '••••1234', clientId: 'beta1', newUsers: 9, sends: 5, sendSuccess: 5, banned: 0, dms: 0, firstDay: '2026-10-22', lastDay: '2026-10-28' },
    ]);
    expect(r.channels[0]).toEqual({ title: 'Chan One', sends: 30, dms: 6, dmPerSend: 0.2 });
    expect(r.pool).toEqual({ buffersEligible: 3, buffersTotal: 14, harsh: 3, promoteActive: 15 });
    // summary = the fleet row of /monitor/fleet?period=7d
    expect(r.summary).toMatchObject({ clientId: 'all', name: 'All clients', revenue: 600, grossRevenue: 1800, payers: 5, sends: 700, dms: 9 });
    expect(r.summary.previous).toMatchObject({ revenue: 300, payers: 2, newUsers: 280 });
    expect(r.summary.pool).toEqual({ buffersEligible: 3, buffersTotal: 14, promoteActive: 15 });
    expect(r.summary.spark).toHaveLength(7);
    expect(r.notes.join('\n')).not.toContain('not in the clients collection');
    expect(r.notes.join('\n')).toContain('top 20 fleet-wide');
    expect(r.notes.join('\n')).toContain('daily_channel is rolled up only to 2026-10-25; sends for 2026-10-26..2026-10-27 are missing');
    expect(JSON.stringify(r)).not.toContain('919876541234');
    expect(JSON.stringify(r)).not.toContain('"c1"');
  });

  it('caches 60 s per days with single-flight, separately from client keys', async () => {
    const { svc, pg: pgMock } = build(pg, mongo);
    await Promise.all([svc.fleetDetail(30), svc.fleetDetail(30)]);
    const n = pgMock.query.mock.calls.length;
    await svc.fleetDetail(30);
    expect(pgMock.query.mock.calls.length).toBe(n);
    await svc.client('all', 30);
    expect(pgMock.query.mock.calls.length).toBeGreaterThan(n);
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
