/**
 * Per-mobile reads (byMobile, rows) come from Postgres daily_mobile for EVERY day of the window,
 * in the historical response shape. No config splits the window.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { DailyAnalyticsService } from '../daily-analytics.service';

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
    // pg returns bigint as strings, in collation order (lowercase-first here; the service re-sorts by binary order).
    return [...g.values()].map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])));
  }
  const aliases = [...sql.matchAll(/([a-z_]+) AS "(\w+)"/g)].filter(([, col]) => col !== 'day');
  return rows.map((r: any) => ({
    d: r.day, namespace: r.namespace, client_id: r.client_id, mobile: r.mobile, profile: r.profile,
    ...Object.fromEntries(aliases.map(([, col, alias]) => [alias, r[col]])),
  }));
}

function build(opts: { pg?: (sql: string, params: unknown[]) => any[] | undefined; error?: string } = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const handler = opts.pg ?? ((sql: string, params: unknown[]) => (sql.includes('FROM daily_mobile') ? dailyMobile(sql, params) : undefined));
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      queries.push({ sql, params });
      const rows = handler(sql, params);
      if (!rows && opts.error) onError?.({ kind: 'query', message: opts.error, code: 'ETIMEDOUT' });
      return rows;
    }),
  };
  const svc = new DailyAnalyticsService(pg as any);
  return { svc, pg, queries };
}

describe('DailyAnalyticsService: daily_mobile', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the window is never split', () => {
    it('byMobile and rows ask daily_mobile for every day of the window', async () => {
      const { svc, queries } = build();
      await svc.byMobile('promote', 4);
      await svc.rows('user', 4);
      expect(queries.map((q) => q.params[0])).toEqual([
        ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'],
        ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'],
      ]);
      expect(queries.every((q) => q.sql.includes('FROM daily_mobile'))).toBe(true);
    });
  });

  describe('byMobile', () => {
    it('user: historical shape, revenue 0 + unavailable', async () => {
      const { svc } = build();
      expect(await svc.byMobile('user', 2)).toEqual([{ clientId: 'a', mobile: 'm9', newUsers: 3, active: 4, paid: 1, revenue: 0, revenueSource: 'unavailable' }]);
    });

    it('reaction with a namespace: namespace filter goes to daily_mobile', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('reaction', 2, undefined, 'tg-aut');
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm9', success: 0, failed: 2, restricted: 0, floods: 1 }]);
      expect(queries[0].params).toEqual([['2026-10-25', '2026-10-26'], 'tg-aut']);
    });

    it('promote (no namespace): daily_mobile, never promotion_send; binary order (B before a); zero rows dropped', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 2);
      expect(rows).toEqual([
        { clientId: 'B', mobile: 'm2', sent: 7, success: 7, failed: 0, banned: 0 },
        { clientId: 'a', mobile: 'm1', sent: 30, success: 12, failed: 18, banned: 3 },
      ]);
      expect(queries.some((q) => q.sql.includes('promotion_send'))).toBe(false);
    });

    it('promote with namespace + clientId', async () => {
      const { svc, queries } = build();
      const rows = await svc.byMobile('promote', 1, 'a', 'promote-clients');
      expect(rows).toEqual([{ clientId: 'a', mobile: 'm1', sent: 10, success: 4, failed: 6, banned: 1 }]);
      expect(queries[0].params).toEqual([['2026-10-26'], 'a', 'promote-clients']);
    });

    it('days with no daily_mobile rows contribute nothing (no other source)', async () => {
      const { svc } = build();
      expect(await svc.byMobile('user', 60, 'nobody')).toEqual([]);
    });
  });

  describe('rows', () => {
    it('promote rows: date, namespace, clientId, mobile, profile, counter names; sorted', async () => {
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

    it('reaction rows over a window that includes days before any daily_mobile row', async () => {
      const { svc } = build();
      const rows: any[] = await svc.rows('reaction', 30, undefined, 'tg-aut');
      expect(rows.map((r) => [r.date, r.success, r.failed])).toEqual([['2026-10-26', 0, 2]]);
    });
  });

  describe('Postgres failure: ServiceUnavailableException with the reader error', () => {
    it.each([
      ['byMobile', (s: DailyAnalyticsService) => s.byMobile('user', 2)],
      ['rows', (s: DailyAnalyticsService) => s.rows('reaction', 2)],
      ['dailyTotals', (s: DailyAnalyticsService) => s.dailyTotals('promote', 2)],
      ['byClient', (s: DailyAnalyticsService) => s.byClient('promote', 2)],
    ])('%s', async (name, call) => {
      const { svc } = build({ pg: () => undefined, error: 'connect ETIMEDOUT' });
      const err: any = await call(svc).then(() => undefined, (e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getStatus()).toBe(503);
      expect(err.message).toBe(`daily-analytics ${name}: Postgres unavailable: connect ETIMEDOUT [ETIMEDOUT]`);
    });

    it('concurrent failing requests each report THEIR OWN error (no shared reader state)', async () => {
      const pg = {
        query: jest.fn(async (sql: string, _p: unknown[], onError?: (e: any) => void) => {
          // daily_mobile fails slowly with A; daily_client fails fast with B, after A's call started.
          const isDm = sql.includes('daily_mobile');
          await new Promise((r) => setTimeout(r, isDm ? 30 : 5));
          onError?.({ kind: 'query', message: isDm ? 'error A' : 'error B' });
          return undefined;
        }),
      };
      const svc = new DailyAnalyticsService(pg as any);
      const [a, b] = await Promise.allSettled([svc.byMobile('promote', 1), svc.dailyTotals('promote', 1)]);
      expect((a as PromiseRejectedResult).reason.message).toContain('byMobile: Postgres unavailable: error A');
      expect((b as PromiseRejectedResult).reason.message).toContain('dailyTotals: Postgres unavailable: error B');
    });
  });
});
