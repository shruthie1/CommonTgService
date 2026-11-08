/**
 * GET /monitor/history (2026-11-08): windows (IST), SQL builders, finest-first source chains with explicit
 * null gaps, response shape, snapshot caching keyed by range + client, 400 / 503, and the route itself
 * (absent before this change).
 */
import { BadRequestException, INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  assembleHistory,
  chainSeries,
  HISTORY_PAGE_RE,
  HISTORY_SERIES,
  historyCoverSql,
  historyDailyClientSql,
  historyDailyPoolSql,
  historyHourlyClientSql,
  historyMonthlyClientSql,
  historyMonthlyPoolSql,
  historyMonthlyRevenueSql,
  historyPoolSnapshotSql,
  historyRevenueSql,
  historySendsRawSql,
  historySqls,
  historyWindow,
  parseHistoryRange,
} from '../monitor-history';
import { MonitorController } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

/** 2026-11-08 17:50:58 IST (the live validation run). */
const NOW = Date.parse('2026-11-08T12:20:58.977Z');

describe('parseHistoryRange', () => {
  it('defaults to 90d; accepts 7d | 90d | 24m', () => {
    expect(parseHistoryRange(undefined)).toBe('90d');
    expect(parseHistoryRange('')).toBe('90d');
    expect(['7d', '90d', '24m'].map((r) => parseHistoryRange(r))).toEqual(['7d', '90d', '24m']);
  });
  it.each(['30d', '7D', '12m', 'all', '7d '])('rejects %p with 400', (r) => {
    expect(() => parseHistoryRange(r)).toThrow(BadRequestException);
  });
});

describe('historyWindow (IST)', () => {
  it('7d = hourly buckets from IST 00:00 six days ago up to the current IST hour', () => {
    const w = historyWindow('7d', NOW);
    expect(w.grain).toBe('hour');
    expect(w.fromDate).toBe('2026-11-02');
    expect(new Date(w.start).toISOString()).toBe('2026-11-01T18:30:00.000Z');
    expect(w.buckets[0]).toBe('2026-11-02T00');
    expect(w.buckets[w.buckets.length - 1]).toBe('2026-11-08T17');
    expect(w.buckets).toHaveLength(6 * 24 + 18);
    expect(new Set(w.buckets).size).toBe(w.buckets.length);
  });
  it('90d = 90 IST days ending today', () => {
    const w = historyWindow('90d', NOW);
    expect(w.buckets).toHaveLength(90);
    expect([w.buckets[0], w.buckets[89]]).toEqual(['2026-08-11', '2026-11-08']);
  });
  it('24m = 24 IST months ending this month (year rollover)', () => {
    const w = historyWindow('24m', NOW);
    expect(w.buckets).toHaveLength(24);
    expect([w.buckets[0], w.buckets[1], w.buckets[23]]).toEqual(['2024-12', '2025-01', '2026-11']);
    expect(w.fromDate).toBe('2024-12-01');
    expect(new Date(w.start).toISOString()).toBe('2024-11-30T18:30:00.000Z');
  });
  it('day and month roll over at IST midnight, not UTC', () => {
    const before = Date.parse('2026-10-31T18:29:59.999Z'); // 23:59:59 IST Oct 31
    const after = Date.parse('2026-10-31T18:30:00.000Z'); // 00:00 IST Nov 1
    expect(historyWindow('90d', before).toDate).toBe('2026-10-31');
    expect(historyWindow('90d', after).toDate).toBe('2026-11-01');
    expect(historyWindow('24m', before).buckets[23]).toBe('2026-10');
    expect(historyWindow('24m', after).buckets[23]).toBe('2026-11');
    const h = historyWindow('7d', after).buckets;
    expect([h[0], h[h.length - 1], h.length]).toEqual(['2026-10-26T00', '2026-11-01T00', 6 * 24 + 1]);
  });
});

describe('history SQL builders', () => {
  const w7 = historyWindow('7d', NOW);
  const w90 = historyWindow('90d', NOW);
  const w24 = historyWindow('24m', NOW);
  const all = [w7, w90, w24].flatMap((w) => [null, 'alpha1'].flatMap((c) => Object.values(historySqls(w, c))));

  it('every statement is one read-only SELECT with a monitor.history_* tag', () => {
    for (const s of all) {
      expect(s.sql).toMatch(/^\/\* monitor\.history_[a-z_]+ \*\/ SELECT/);
      expect(s.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT)\b/i);
      expect(s.sql).not.toContain(';');
      // every $n placeholder has a param
      const max = Math.max(0, ...[...s.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      expect(s.params).toHaveLength(max);
    }
  });

  it('statement sets per range', () => {
    expect(Object.keys(historySqls(w7, null)).sort()).toEqual(['cover', 'daily', 'hourly', 'pool', 'revenue', 'sendsRaw']);
    expect(Object.keys(historySqls(w90, null)).sort()).toEqual(['cover', 'daily', 'dailyPool', 'pool', 'revenue']);
    expect(Object.keys(historySqls(w24, null)).sort()).toEqual(
      ['cover', 'daily', 'dailyPool', 'monthly', 'monthlyPool', 'monthlyRevenue', 'pool', 'revenue'].sort(),
    );
  });

  it('failed = failed + banned: outcome IN on promotion_send, the failed column (already incl. banned) on rollups', () => {
    const raw = historySendsRawSql(w7, null).sql;
    expect(raw).toContain(`count(*) FILTER (WHERE outcome IN ('failed', 'banned')) AS failed`);
    expect(raw).toContain(`count(*) FILTER (WHERE outcome <> 'deleted') AS sent`);
    expect(raw).toContain(`count(*) FILTER (WHERE outcome = 'delivered') AS delivered`);
    for (const s of [historyHourlyClientSql(w7, null), historyDailyClientSql(w90, null), historyMonthlyClientSql(w24, null)]) {
      expect(s.sql).toContain('coalesce(sum(failed), 0) AS failed');
      expect(s.sql).not.toMatch(/sum\(banned\)|failed\s*\+\s*banned|banned\s*\+/);
    }
  });

  it('new users = tg-aut namespace only (as dailyClientSql)', () => {
    for (const s of [historyHourlyClientSql(w7, null), historyDailyClientSql(w90, null), historyMonthlyClientSql(w24, null)]) {
      expect(s.sql).toContain(`coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users`);
    }
  });

  it('revenue: owner_amount of credits under ₹1,000; payers distinct clean chats per bucket; IST instants', () => {
    const s = historyRevenueSql(w7, null);
    expect(s.sql).toContain('FROM payment_event_owner');
    expect(s.sql).toContain('amount > 0 AND amount < 1000');
    expect(s.sql).toContain('coalesce(sum(owner_amount), 0) AS revenue');
    expect(s.sql).toContain('count(DISTINCT chat_id) FILTER (WHERE NOT cheat_flagged) AS payers');
    expect(s.sql).toContain(`to_char(ts AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24')`);
    expect(s.params).toEqual(['2026-11-01T18:30:00.000Z', new Date(NOW).toISOString()]);
    expect(historyRevenueSql(w90, null).sql).toContain(`'YYYY-MM-DD')`);
    expect(historyRevenueSql(w24, null).sql).toContain(`'YYYY-MM')`);
    expect(historyMonthlyRevenueSql(w24, null).sql).toContain('sum(owner_revenue)');
  });

  it('client filter: an extra parameter, never interpolated', () => {
    const evil = "x' OR 1=1 --";
    for (const s of Object.values(historySqls(w24, evil)).concat(Object.values(historySqls(w7, evil)))) {
      if (s.name === 'history_cover') continue;
      expect(s.sql).not.toContain(evil);
      expect(s.params[s.params.length - 1]).toBe(evil);
      expect(s.sql).toMatch(/client_id = \$\d/);
    }
    expect(historyCoverSql(w7).sql).not.toContain('client_id');
    expect(historySendsRawSql(w7, null).sql).not.toContain('client_id =');
  });

  it('pool: total + active only (b.active and p.eligible have no source), last sample per bucket', () => {
    for (const s of [historyPoolSnapshotSql(w7, null), historyPoolSnapshotSql(w90, 'a'), historyDailyPoolSql(w24, null), historyMonthlyPoolSql(w24, null)]) {
      expect(s.sql).not.toMatch(/eligible/);
      expect(s.sql).not.toMatch(/sum\(active(_last)?\) FILTER \(WHERE pool = 'b'/);
      expect(s.sql).toMatch(/AS p_active/);
    }
    expect(historyPoolSnapshotSql(w90, null).sql).toContain('DISTINCT ON (1, pool, client_id)');
    expect(historyPoolSnapshotSql(w90, null).sql).toContain('ORDER BY 1, pool, client_id, ts_hour DESC');
    expect(historyPoolSnapshotSql(w7, null).sql).not.toContain('DISTINCT ON');
    expect(historyPoolSnapshotSql(w90, 'alpha1').sql).toContain(`FILTER (WHERE pool = 'p' AND client_id = $3)`);
  });

  it('coverage probe: promotion_send only for the hour grain, bounded to the window (no full-table min)', () => {
    const c7 = historyCoverSql(w7);
    expect(c7.sql).toMatch(/FROM promotion_send WHERE ts >= \$1::timestamptz AND ts < \$3::timestamptz/);
    expect(c7.params).toEqual(['2026-11-01T18:30:00.000Z', new Date(NOW).toISOString(), '2026-11-02T18:30:00.000Z']);
    expect(historyCoverSql(w90).sql).not.toContain('FROM promotion_send');
    expect(historyCoverSql(w90).params).toEqual([]);
  });
});

describe('chainSeries', () => {
  const B = ['2026-09', '2026-10', '2026-11'];
  it('null before the first source row, 0 for a covered bucket without a row, fallback to the coarser source', () => {
    const s = chainSeries(B, [
      { source: 'daily_client', first: '2026-10-05', rows: [{ b: '2026-11', sent: '7' }], col: 'sent' },
      { source: 'monthly_client', first: '2026-09', rows: [{ b: '2026-09', sent: '3' }, { b: '2026-10', sent: '999' }], col: 'sent' },
    ]);
    expect(s.values).toEqual([3, 0, 7]);
    expect(s.source).toBe('monthly_client+daily_client');
    expect(s.from).toBe('2026-09');
  });
  it('no source has data: all null, from null, primary source named', () => {
    const s = chainSeries(B, [{ source: 'daily_pool', first: null, rows: [], col: 'p_total' }]);
    expect(s).toEqual({ values: [null, null, null], source: 'daily_pool', from: null });
  });
  it('gauge: a covered bucket without a sample is null, never 0', () => {
    const s = chainSeries(['2026-11-08T01', '2026-11-08T02', '2026-11-08T03'], [
      { source: 'pool_snapshot', first: '2026-11-08T02', rows: [{ b: '2026-11-08T03', p_total: '10' }], col: 'p_total', gauge: true },
    ]);
    expect(s.values).toEqual([null, null, 10]);
  });
  it('from: the more precise start wins inside the same period', () => {
    const s = chainSeries(B, [
      { source: 'payment_event', first: '2026-10-04T02', rows: [], col: 'revenue' },
      { source: 'monthly_revenue', first: '2026-10', rows: [], col: 'revenue' },
    ]);
    expect(s.from).toBe('2026-10-04T02');
    const t = chainSeries(B, [
      { source: 'daily_client', first: '2026-10-05', rows: [], col: 'sent' },
      { source: 'monthly_client', first: '2026-09', rows: [], col: 'sent' },
    ]);
    expect(t.from).toBe('2026-09');
  });
  it('an hour bucket is covered by a day-precision first of the same day', () => {
    const s = chainSeries(['2026-10-27T23', '2026-10-28T00'], [{ source: 'hourly_client', first: '2026-10-28', rows: [], col: 'sent' }]);
    expect(s.values).toEqual([null, 0]);
  });
});

/** Rows like the live run of 2026-11-08 (trimmed). */
function liveLikeRows(range: '7d' | '90d' | '24m'): Record<string, any[]> {
  const cover = [
    {
      payment_event: '2026-10-04T02',
      monthly_revenue: '2026-10',
      promotion_send: range === '7d' ? '2026-11-02T00' : null,
      hourly_client: range === '7d' ? '2026-10-28T00' : null,
      hourly_new_users: range === '7d' ? '2026-11-08T16' : null,
      daily_client: '2026-09-18',
      monthly_client: '2026-09',
      pool_snapshot: '2026-11-08T02',
      daily_pool: null,
      monthly_pool: null,
    },
  ];
  if (range === '7d')
    return {
      cover,
      revenue: [{ b: '2026-11-08T10', revenue: '1200', payers: '9' }],
      sendsRaw: [{ b: '2026-11-08T10', sent: '700', delivered: '600', failed: '100' }],
      // 11-03: hours add up to daily_client (5 + 4 = 9); 11-07: one process writing (3 of 1800); today: partial
      hourly: [
        { b: '2026-11-03T09', sent: '1', delivered: '1', failed: '0', new_users: '5' },
        { b: '2026-11-03T10', sent: '1', delivered: '1', failed: '0', new_users: '4' },
        { b: '2026-11-07T16', sent: '5', delivered: '5', failed: '0', new_users: '3' },
        { b: '2026-11-08T16', sent: '30', delivered: '28', failed: '2', new_users: '7' },
      ],
      daily: [
        { b: '2026-11-03', sent: '15848', delivered: '12943', failed: '2905', new_users: '9' },
        { b: '2026-11-07', sent: '15516', delivered: '13650', failed: '1866', new_users: '1800' },
        { b: '2026-11-08', sent: '11186', delivered: '9813', failed: '1373', new_users: '1508' },
      ],
      pool: [{ b: '2026-11-08T17', b_total: '466', p_total: '378', p_active: '319' }],
    };
  if (range === '90d')
    return {
      cover,
      revenue: [{ b: '2026-10-04', revenue: '5000', payers: '40' }],
      daily: [{ b: '2026-11-07', sent: '15516', delivered: '13650', failed: '1866', new_users: '1800' }],
      pool: [{ b: '2026-11-08', b_total: '466', p_total: '378', p_active: '319' }],
      dailyPool: [],
    };
  return {
    cover,
    revenue: [
      { b: '2026-10', revenue: '303293', payers: '1950' },
      { b: '2026-11', revenue: '96577', payers: '621' },
    ],
    monthlyRevenue: [{ b: '2026-10', revenue: '318861', payers: '2287' }],
    daily: [
      { b: '2026-09', sent: '368916', delivered: '232068', failed: '136848', new_users: '19408' },
      { b: '2026-10', sent: '725087', delivered: '529900', failed: '195187', new_users: '59562' },
      { b: '2026-11', sent: '114501', delivered: '99257', failed: '15244', new_users: '13976' },
    ],
    monthly: [{ b: '2026-10', sent: '1', delivered: '1', failed: '0', new_users: '0' }],
    pool: [{ b: '2026-11', b_total: '466', p_total: '378', p_active: '319' }],
    dailyPool: [],
    monthlyPool: [],
  };
}

describe('assembleHistory', () => {
  it('24m: shape, gaps before data start, finest source wins over monthly rollups', () => {
    const w = historyWindow('24m', NOW);
    const r = assembleHistory(w, null, liveLikeRows('24m'), NOW, { total: 5 });
    expect(Object.keys(r.series)).toEqual([...HISTORY_SERIES]);
    for (const k of HISTORY_SERIES) expect(r.series[k].values).toHaveLength(24);
    expect(r).toMatchObject({ range: '24m', grain: 'month', tz: 'Asia/Kolkata', clientId: null, from: '2024-12-01', to: '2026-11-08', partialLast: true });
    expect(r.series.revenue.values.slice(-3)).toEqual([null, 303293, 96577]); // Sep: before payment_event = gap, not 0
    expect(r.series.revenue).toMatchObject({ source: 'payment_event', from: '2026-10-04T02' });
    expect(r.series.sent.values.slice(-4)).toEqual([null, 368916, 725087, 114501]); // daily_client, not monthly_client's 1
    expect(r.series.failed.values.slice(-1)).toEqual([15244]);
    expect(r.series.sent).toMatchObject({ source: 'daily_client', from: '2026-09-18' });
    expect(r.series.poolPromoteActive.values.slice(-2)).toEqual([null, 319]);
    expect(r.series.revenue.values.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(r.series.payers.values.slice(-3)).toEqual([null, 1950, 621]);
    expect(r.notes[0]).toMatch(/payers are distinct per month; not summable/);
    expect(r.cache).toEqual({ history: null, today: null, ageSec: null, historyAgeSec: null });
  });
  it('7d: sends from promotion_send; hourly new users only on closed days that add up to daily_client; pool gaps', () => {
    const w = historyWindow('7d', NOW);
    const r = assembleHistory(w, 'alpha1', liveLikeRows('7d'), NOW);
    const at = (k: keyof typeof r.series, b: string) => r.series[k].values[w.buckets.indexOf(b)];
    expect(r.clientId).toBe('alpha1');
    expect(at('sent', '2026-11-08T10')).toBe(700);
    expect(at('sent', '2026-11-08T16')).toBe(0); // promotion_send covers: its 0 wins over hourly_client's 30
    expect(at('failed', '2026-11-08T10')).toBe(100);
    expect(at('newUsers', '2026-11-03T09')).toBe(5); // verified day
    expect(at('newUsers', '2026-11-03T11')).toBe(0); // verified day, no row = real 0
    expect(at('newUsers', '2026-11-02T09')).toBeNull(); // no hourly rows
    expect(at('newUsers', '2026-11-07T16')).toBeNull(); // partial writer: 3 of 1800, never shown as complete
    expect(at('newUsers', '2026-11-07T17')).toBeNull();
    expect(at('newUsers', '2026-11-08T16')).toBeNull(); // today is never verified
    expect(r.series.newUsers).toMatchObject({ source: 'hourly_client', from: '2026-11-03T00' });
    expect(r.notes).toContain('hourly new users only on closed days whose hours add up to daily_client');
    expect(at('poolBufferTotal', '2026-11-08T03')).toBeNull(); // covered hour, no sample: null
    expect(at('poolBufferTotal', '2026-11-08T17')).toBe(466);
    expect(at('revenue', '2026-11-02T00')).toBe(0);
    expect(r.series.sent.source).toBe('promotion_send');
  });
  it('24m: monthly_revenue serves revenue of months before payment_event; payers there stay null', () => {
    const w = historyWindow('24m', NOW);
    const rows = liveLikeRows('24m');
    rows.cover[0].monthly_revenue = '2026-09';
    rows.monthlyRevenue = [{ b: '2026-09', revenue: '1000', payers: '12' }, ...rows.monthlyRevenue];
    const r = assembleHistory(w, null, rows, NOW);
    expect(r.series.revenue.values.slice(-3)).toEqual([1000, 303293, 96577]);
    expect(r.series.revenue.source).toBe('monthly_revenue+payment_event');
    expect(r.series.payers.values.slice(-3)).toEqual([null, 1950, 621]);
    expect(r.series.payers.source).toBe('payment_event');
    expect(r.notes).toContain('monthly_revenue months include credits of ₹1,000 or more');
  });
  it('90d payload with every bucket filled stays far under 50 KB', () => {
    const w = historyWindow('90d', NOW);
    const big = (cols: string[]) => w.buckets.map((b) => Object.fromEntries([['b', b], ...cols.map((c) => [c, '123456'])]));
    const cover = [{ payment_event: '2020-01-01', daily_client: '2020-01-01', pool_snapshot: '2020-01-01T00', daily_pool: '2020-01-01' }];
    const rows = {
      cover,
      revenue: big(['revenue', 'payers']),
      daily: big(['sent', 'delivered', 'failed', 'new_users']),
      pool: big(['b_total', 'p_total', 'p_active']),
    };
    const r = assembleHistory(w, null, rows, NOW, {});
    expect(r.series.sent.values.every((v) => v === 123456)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(50_000);
    const w7 = historyWindow('7d', NOW);
    const r7 = assembleHistory(w7, null, { cover: [{ payment_event: '2020-01-01', promotion_send: '2020-01-01T00', hourly_new_users: '2020-01-01T00', pool_snapshot: '2020-01-01T00' }] }, NOW);
    expect(Buffer.byteLength(JSON.stringify(r7))).toBeLessThan(50_000);
  });
});

describe('MonitorService.history', () => {
  function fakePg(fail = false) {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string, _params: unknown[], onError?: (e: any) => void) => {
        const name = /monitor\.(\w+)/.exec(sql)![1];
        calls.push(name);
        if (fail) {
          onError?.({ kind: 'query', message: 'connect ECONNREFUSED' });
          return undefined;
        }
        if (name === 'history_cover') return liveLikeRows('24m').cover;
        if (name === 'history_revenue_month') return liveLikeRows('24m').revenue;
        if (name === 'history_daily_client_month') return liveLikeRows('24m').daily;
        return [];
      }),
    };
  }
  function build(fail = false) {
    const pg = fakePg(fail);
    const connection = { collection: () => ({ find: () => ({ toArray: async () => [] }), aggregate: () => ({ toArray: async () => [] }) }) };
    const redis = { smembers: jest.fn(async () => []), mget: jest.fn(async (k: string[]) => k.map(() => null)) };
    const svc = new MonitorService(pg as any, connection as any, redis as any);
    svc.warmSnapshots = false;
    return { svc, pg };
  }

  it('builds once per (range, client) and serves the snapshot after', async () => {
    const { svc, pg } = build();
    const a = await svc.history('24m', null);
    expect(a.series.revenue.values.slice(-2)).toEqual([303293, 96577]);
    expect(a.cache.snapshot).toBe('miss');
    expect(pg.calls.sort()).toEqual(
      [
        'history_cover',
        'history_daily_client_month',
        'history_daily_pool_month',
        'history_monthly_client',
        'history_monthly_pool',
        'history_pool_snapshot_month',
        'history_revenue_month',
        'history_revenue_monthly',
      ].sort(),
    );
    const n = pg.calls.length;
    const b = await svc.history('24m', null);
    expect(b.cache.snapshot).toBe('hit');
    expect(pg.calls.length).toBe(n);
    await svc.history('24m', 'alpha1'); // other client = other key
    expect(pg.calls.length).toBe(2 * n);
    await svc.history('90d', 'alpha1'); // other range = other key
    expect(pg.calls.length).toBe(2 * n + 5);
    expect(pg.query.mock.calls.filter((c) => /monitor\.history_revenue_month \*\//.test(c[0])).map((c) => c[1])).toEqual([
      [expect.any(String), expect.any(String)],
      [expect.any(String), expect.any(String), 'alpha1'],
    ]);
  });

  it('history pages are fresh 5 min (not the 60 s live pages)', () => {
    expect(HISTORY_PAGE_RE.test('history:7d:*')).toBe(true);
    expect(HISTORY_PAGE_RE.test('promotions:today:*')).toBe(false);
  });

  it('Postgres failure = 503 "history unavailable", never a zero-filled page', async () => {
    const { svc } = build(true);
    const err = await svc.history('7d', null).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toMatch(/history unavailable: query: connect ECONNREFUSED/);
  });
});

describe('GET /monitor/history over HTTP', () => {
  let app: INestApplication;
  const svc = {
    history: jest.fn(async (range: string, clientId: string | null) => ({ range, clientId })),
    client: jest.fn(async (clientId: string) => ({ route: 'client', clientId })),
  };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MonitorController],
      providers: [{ provide: MonitorService, useValue: svc }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('the route exists (absent before 2026-11-08) and is declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    expect(paths).toContain('history');
    expect(paths.indexOf('history')).toBeLessThan(paths.indexOf('client/:clientId'));
  });

  it.each([
    ['/monitor/history', '90d', null],
    ['/monitor/history?range=7d', '7d', null],
    ['/monitor/history?range=24m&clientId=alpha1', '24m', 'alpha1'],
    ['/monitor/history?range=90d&client=beta_2', '90d', 'beta_2'],
  ])('%s -> history(%p, %p)', async (url, range, clientId) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(200);
    expect(svc.history).toHaveBeenCalledWith(range, clientId);
    expect(svc.client).not.toHaveBeenCalled();
  });

  it.each([
    ['bad range', '/monitor/history?range=30d'],
    ['bad clientId', '/monitor/history?range=7d&clientId=a%20b'],
  ])('%s = 400', async (_n, url) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(400);
    expect(svc.history).not.toHaveBeenCalled();
  });
});
