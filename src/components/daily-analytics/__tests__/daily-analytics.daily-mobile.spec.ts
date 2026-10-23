/**
 * DAILY_ANALYTICS_SOURCE=pg once Mongo *StatsDaily writes stop: per-mobile reads (byMobile, rows)
 * come from Postgres daily_mobile for days >= DAILY_MOBILE_FROM_DAY, in the exact Mongo shape.
 */
import { Logger } from '@nestjs/common';
import { DailyAnalyticsService, dailyMobileFromDay } from '../daily-analytics.service';
import { fakeModel } from './fake-models';

const NOW = new Date('2026-10-26T06:00:00Z'); // 11:30 IST on 2026-10-26

/** daily_mobile rows (column names) used by the in-memory emulation below. */
const DM = [
  { day: '2026-10-25', client_id: 'a', namespace: 'promote-clients', mobile: 'm1', profile: 'shruthi', sent: 20, delivered: 8, banned: 2, failed: 12, new_users: 0, active_users: 0, payers: 0, reactions_success: 5, reactions_restricted: 1, reactions_failed: 0, reactions_floods: 0 },
  { day: '2026-10-26', client_id: 'a', namespace: 'promote-clients', mobile: 'm1', profile: 'shruthi', sent: 10, delivered: 4, banned: 1, failed: 6, new_users: 0, active_users: 0, payers: 0, reactions_success: 0, reactions_restricted: 0, reactions_failed: 0, reactions_floods: 0 },
  { day: '2026-10-26', client_id: 'a', namespace: 'tg-aut', mobile: 'm9', profile: null, sent: 0, delivered: 0, banned: 0, failed: 0, new_users: 3, active_users: 4, payers: 1, reactions_success: 0, reactions_restricted: 0, reactions_failed: 2, reactions_floods: 1 },
  { day: '2026-10-26', client_id: 'B', namespace: 'promote-clients', mobile: 'm2', profile: 'kavya', sent: 7, delivered: 7, banned: 0, failed: 0, new_users: 0, active_users: 0, payers: 0, reactions_success: 0, reactions_restricted: 0, reactions_failed: 0, reactions_floods: 0 },
];

/** Minimal emulation of the two daily_mobile query shapes the service issues. */
function dailyMobile(sql: string, params: unknown[]) {
  const days = params[0] as string[];
  const filters = [...sql.matchAll(/AND (client_id|namespace|mobile) = \$(\d+)/g)].map(([, col, i]) => [col, params[Number(i) - 1]]);
  const nonZero = [...(sql.match(/\(([a-z_]+ <> 0(?: OR [a-z_]+ <> 0)*)\)/)?.[1] ?? '').matchAll(/([a-z_]+) <> 0/g)].map((m) => m[1]);
  const rows = DM.filter((r: any) => days.includes(r.day) && filters.every(([c, v]) => r[c as string] === v) && nonZero.some((c) => (r as any)[c] !== 0));
  const sums = [...sql.matchAll(/COALESCE\(SUM\(([a-z_]+)\), 0\)::bigint AS "(\w+)"/g)];
  if (sums.length) {
    const g = new Map<string, any>();
    for (const r of rows as any[]) {
      const k = `${r.client_id}|${r.mobile}`;
      const t = g.get(k) || { clientId: r.client_id, mobile: r.mobile, ...Object.fromEntries(sums.map(([, , a]) => [a, 0])) };
      for (const [, col, alias] of sums) t[alias] += r[col];
      g.set(k, t);
    }
    // pg returns bigint as strings, in collation order (lowercase-first here, unlike Mongo).
    return [...g.values()].map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])));
  }
  const aliases = [...sql.matchAll(/([a-z_]+) AS "(\w+)"/g)].filter(([, col]) => col !== 'day');
  return rows.map((r: any) => ({
    d: r.day, namespace: r.namespace, client_id: r.client_id, mobile: r.mobile, profile: r.profile,
    ...Object.fromEntries(aliases.map(([, col, alias]) => [alias, r[col]])),
  }));
}

function build(opts: { pg?: (sql: string, params: unknown[]) => any[] | undefined; error?: string } = {}) {
  // Mongo still has old days (10-23) plus a stale/partial copy of 10-26 that must NOT be read in pg mode.
  const promote = fakeModel([
    { date: '2026-10-23', clientId: 'a', namespace: 'promote-clients', mobile: 'm1', sent: 5, success: 1, failed: 4, banned: 3 },
    { date: '2026-10-26', clientId: 'a', namespace: 'promote-clients', mobile: 'm1', sent: 999, success: 999 },
  ]);
  const reaction = fakeModel([
    { date: '2026-10-23', clientId: 'a', namespace: 'tg-aut', mobile: 'm9', success: 1, failed: 1 },
    { date: '2026-10-26', clientId: 'a', namespace: 'tg-aut', mobile: 'm9', success: 999 },
  ]);
  const user = fakeModel([
    { date: '2026-10-23', clientId: 'a', namespace: 'tg-aut', mobile: 'm9', newUsers: 1, active: 1, paid: 1, revenue: 500 },
    { date: '2026-10-26', clientId: 'a', namespace: 'tg-aut', mobile: 'm9', newUsers: 999, active: 999, paid: 999, revenue: 999 },
  ]);
  const queries: { sql: string; params: unknown[] }[] = [];
  const handler = opts.pg ?? ((sql: string, params: unknown[]) => {
    if (sql.includes('FROM daily_mobile')) return dailyMobile(sql, params);
    if (sql.includes('FROM promotion_send')) return [{ client_id: 'a', mobile: 'm1', sent: '6', success: '2', failed: '4', banned: '1' }];
    return undefined;
  });
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      queries.push({ sql, params });
      const rows = handler(sql, params);
      if (!rows && opts.error) onError?.({ kind: 'query', message: opts.error, code: 'ETIMEDOUT' });
      return rows;
    }),
  };
  const svc = new DailyAnalyticsService(promote as any, reaction as any, user as any, pg as any);
  return { svc, pg, queries };
}

describe('DailyAnalyticsService: daily_mobile (DAILY_ANALYTICS_SOURCE=pg)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    process.env.DAILY_ANALYTICS_SOURCE = 'pg';
    process.env.DAILY_MOBILE_FROM_DAY = '2026-10-24';
  });
  afterEach(() => {
    delete process.env.DAILY_ANALYTICS_SOURCE;
    delete process.env.DAILY_MOBILE_FROM_DAY;
    jest.restoreAllMocks();
  });

  it('DAILY_MOBILE_FROM_DAY env: valid YYYY-MM-DD only, read at call time', () => {
    expect(dailyMobileFromDay()).toBe('2026-10-24');
    for (const bad of ['', '2026-13-01', '2026-02-30', '24-10-2026', 'yesterday', '2026-10-24T00:00']) {
      process.env.DAILY_MOBILE_FROM_DAY = bad;
      expect(dailyMobileFromDay()).toBeUndefined();
    }
    process.env.DAILY_MOBILE_FROM_DAY = ' 2026-11-01 ';
    expect(dailyMobileFromDay()).toBe('2026-11-01');
  });

  describe.each([
    ['unset', undefined],
    ['invalid', '2026-10-32'],
  ])('DAILY_MOBILE_FROM_DAY %s => daily_mobile disabled, pg mode exactly as before', (_label, value) => {
    beforeEach(() => {
      if (value === undefined) delete process.env.DAILY_MOBILE_FROM_DAY;
      else process.env.DAILY_MOBILE_FROM_DAY = value;
    });
    it('user/reaction byMobile and rows: Mongo, no Postgres query, no source tag', async () => {
      const { svc, pg } = build();
      const byMobile: any[] = await svc.byMobile('user', 2);
      const rows: any[] = await svc.rows('reaction', 2);
      expect(pg.query).not.toHaveBeenCalled();
      expect(byMobile).toEqual([{ clientId: 'a', mobile: 'm9', newUsers: 999, active: 999, paid: 999, revenue: 0, revenueSource: 'unavailable' }]);
      expect(rows).toEqual([{ date: '2026-10-26', clientId: 'a', namespace: 'tg-aut', mobile: 'm9', success: 999 }]);
    });
    it('promote byMobile without namespace: promotion_send for the whole window (no cap), never daily_mobile', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 4);
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm1', sent: 6, success: 2, failed: 4, banned: 1 }]);
      expect(queries.map((q) => q.params)).toEqual([['2026-10-23T00:00:00+05:30']]);
      expect(queries.some((q) => q.sql.includes('daily_mobile'))).toBe(false);
    });
  });

  describe('byMobile, window fully on/after DAILY_MOBILE_FROM_DAY', () => {
    it('user: from daily_mobile, Mongo shape (no revenue from Mongo), Mongo never read', async () => {
      const { svc } = build();
      const rows = await svc.byMobile('user', 2);
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm9', newUsers: 3, active: 4, paid: 1, revenue: 0, revenueSource: 'unavailable' }]);
    });

    it('reaction with a namespace: namespace filter goes to daily_mobile', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('reaction', 2, undefined, 'tg-aut');
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm9', success: 0, failed: 2, restricted: 0, floods: 1 }]);
      expect(queries[0].params).toEqual([['2026-10-25', '2026-10-26'], 'tg-aut']);
    });

    it('promote (no namespace): daily_mobile, not promotion_send; Mongo binary order (B before a); zero rows dropped', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 2);
      expect(rows).toEqual([
        { clientId: 'B', mobile: 'm2', sent: 7, success: 7, failed: 0, banned: 0 },
        { clientId: 'a', mobile: 'm1', sent: 30, success: 12, failed: 18, banned: 3 },
      ]);
      expect(queries.some((q) => q.sql.includes('promotion_send'))).toBe(false);
    });

    it('promote with namespace + clientId: served from daily_mobile (was Mongo-only)', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 1, 'a', 'promote-clients');
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm1', sent: 10, success: 4, failed: 6, banned: 1 }]);
      expect(queries[0].sql).toContain('FROM daily_mobile');
    });
  });

  describe('rows, window fully on/after DAILY_MOBILE_FROM_DAY', () => {
    it('promote rows: Mongo doc shape (date, namespace, clientId, mobile, profile, Mongo counter names), sorted', async () => {
      const { svc } = build();
      expect(await svc.rows('promote', 2)).toEqual([
        { date: '2026-10-25', namespace: 'promote-clients', clientId: 'a', mobile: 'm1', profile: 'shruthi', sent: 20, success: 8, failed: 12, banned: 2 },
        { date: '2026-10-26', namespace: 'promote-clients', clientId: 'B', mobile: 'm2', profile: 'kavya', sent: 7, success: 7, failed: 0, banned: 0 },
        { date: '2026-10-26', namespace: 'promote-clients', clientId: 'a', mobile: 'm1', profile: 'shruthi', sent: 10, success: 4, failed: 6, banned: 1 },
      ]);
    });

    it('user rows: null profile omitted, revenue 0 + unavailable; mobile filter passed through', async () => {
      const { svc, queries } = build();
      expect(await svc.rows('user', 1, 'a', undefined, 'm9')).toEqual([
        { date: '2026-10-26', namespace: 'tg-aut', clientId: 'a', mobile: 'm9', newUsers: 3, active: 4, paid: 1, revenue: 0, revenueSource: 'unavailable' },
      ]);
      expect(queries[0].params).toEqual([['2026-10-26'], 'a', 'm9']);
    });
  });

  describe('window straddling DAILY_MOBILE_FROM_DAY: days before keep the previous source', () => {
    it('user byMobile: Mongo for 10-23 + daily_mobile for 10-24..26, summed per mobile', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('user', 4); // 10-23 .. 10-26
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm9', newUsers: 4, active: 5, paid: 2, revenue: 0, revenueSource: 'unavailable' }]);
      expect(queries[0].params[0]).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    });

    it('promote byMobile (no namespace, window >= PROMOTION_SEND_FROM_DAY): promotion_send capped before daily_mobile', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 4);
      expect(rows).toEqual([
        { clientId: 'B', mobile: 'm2', sent: 7, success: 7, failed: 0, banned: 0 },
        { clientId: 'a', mobile: 'm1', sent: 36, success: 14, failed: 22, banned: 4 },
      ]);
      const ps = queries.find((q) => q.sql.includes('FROM promotion_send'))!;
      expect(ps.params).toEqual(['2026-10-23T00:00:00+05:30', '2026-10-24T00:00:00+05:30']);
      expect(ps.sql).toMatch(/ts < \$2::timestamptz/);
    });

    it('reaction rows: Mongo rows for 10-23 first, then daily_mobile rows', async () => {
      const { svc } = build();
      const rows: any[] = await svc.rows('reaction', 4, undefined, 'tg-aut');
      expect(rows.map((r) => [r.date, r.success, r.failed])).toEqual([
        ['2026-10-23', 1, 1],
        ['2026-10-26', 0, 2],
      ]);
    });
  });

  describe('Postgres failure in pg mode: Mongo answer, warned and tagged', () => {
    it.each([
      ['byMobile user', (s: DailyAnalyticsService) => s.byMobile('user', 2)],
      ['byMobile promote', (s: DailyAnalyticsService) => s.byMobile('promote', 4)],
      ['rows reaction', (s: DailyAnalyticsService) => s.rows('reaction', 2)],
      ['dailyTotals', (s: DailyAnalyticsService) => s.dailyTotals('promote', 2)],
      ['byClient', (s: DailyAnalyticsService) => s.byClient('promote', 2)],
    ])('%s', async (_name, call) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { svc } = build({ pg: () => undefined, error: 'connect ETIMEDOUT' });
      const rows: any[] = (await call(svc)) as any;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.source === 'mongo-fallback')).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('connect ETIMEDOUT [ETIMEDOUT]'));
    });

    it('concurrent failing requests each log THEIR OWN error (no shared reader state)', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const promote = fakeModel([{ date: '2026-10-26', clientId: 'a', namespace: 'promote-clients', mobile: 'm1', sent: 1 }]);
      const pg = {
        query: jest.fn(async (sql: string, _p: unknown[], onError?: (e: any) => void) => {
          // daily_mobile fails slowly with A; daily_client fails fast with B, after A's call started.
          const isDm = sql.includes('daily_mobile');
          await new Promise((r) => setTimeout(r, isDm ? 30 : 5));
          onError?.({ kind: 'query', message: isDm ? 'error A' : 'error B' });
          return undefined;
        }),
      };
      const svc = new DailyAnalyticsService(promote as any, fakeModel([]) as any, fakeModel([]) as any, pg as any);
      await Promise.all([svc.byMobile('promote', 1), svc.dailyTotals('promote', 1)]);
      const lines = warn.mock.calls.map((c) => String(c[0]));
      expect(lines.find((l) => l.includes('byMobile'))).toContain('error A');
      expect(lines.find((l) => l.includes('dailyTotals'))).toContain('error B');
    });

    it('promotion_send failing in a straddling window falls back for the whole window (no half answer)', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { svc } = build({ pg: (sql, p) => (sql.includes('promotion_send') ? undefined : dailyMobile(sql, p)) });
      const rows: any[] = await svc.byMobile('promote', 4);
      expect(rows).toEqual([expect.objectContaining({ clientId: 'a', mobile: 'm1', sent: 1004, source: 'mongo-fallback' })]);
    });
  });

  describe('hybrid mode unchanged (regression guard; passes on old code by design)', () => {
    beforeEach(() => { delete process.env.DAILY_ANALYTICS_SOURCE; });
    it('byMobile/rows stay on Mongo, never query daily_mobile, no source tag', async () => {
      const { svc, pg } = build();
      const byMobile: any[] = await svc.byMobile('user', 2);
      const rows: any[] = await svc.rows('promote', 2);
      expect(pg.query).not.toHaveBeenCalled();
      expect(byMobile[0]).toEqual({ clientId: 'a', mobile: 'm9', newUsers: 999, active: 999, paid: 999, revenue: 0, revenueSource: 'unavailable' });
      expect(rows.every((r) => !('source' in r))).toBe(true);
    });
    it('PG failure in hybrid mode: no source tag (unchanged)', async () => {
      const { svc } = build({ pg: () => undefined });
      const rows: any[] = await svc.dailyTotals('promote', 15);
      expect(rows.every((r) => !('source' in r))).toBe(true);
    });
  });
});
