import { DailyAnalyticsService, REVENUE_FROM_DAY } from '../daily-analytics.service';
import { fakeModel } from './fake-models';

const NOW = new Date('2026-10-05T06:00:00Z'); // 11:30 IST on 2026-10-05

function build(opts: { pgRows?: (sql: string, params: unknown[]) => any[] | undefined } = {}) {
  const promote = fakeModel([
    { date: '2026-10-05', clientId: 'a', namespace: 'promote-clients', mobile: 'm1', sent: 10, success: 4, failed: 6, banned: 1 },
  ]);
  const reaction = fakeModel([]);
  const user = fakeModel([
    // revenue here is the inflated Mongo counter and must never be reported.
    { date: '2026-10-05', clientId: 'a', namespace: 'tg-aut', mobile: 'm1', newUsers: 2, active: 3, paid: 1, revenue: 999 },
  ]);
  const queries: { sql: string; params: unknown[] }[] = [];
  const pg = {
    isEnabled: () => !!opts.pgRows,
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return opts.pgRows ? opts.pgRows(sql, params) : undefined;
    }),
  };
  const svc = new DailyAnalyticsService(promote as any, reaction as any, user as any, pg as any);
  return { svc, pg, queries };
}

describe('DailyAnalyticsService', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime()));
  afterEach(() => jest.restoreAllMocks());

  describe('revenue never comes from userStatsDaily (Mongo path)', () => {
    it('dailyTotals(user) reports 0 + revenueSource, not the inflated 999', async () => {
      const { svc } = build();
      const rows: any[] = await svc.dailyTotals('user', 1);
      expect(rows[0]).toMatchObject({ date: '2026-10-05', newUsers: 2, active: 3, paid: 1, revenue: 0, revenueSource: 'unavailable' });
    });
    it('byClient / byMobile / rows (user) never expose the inflated revenue', async () => {
      const { svc } = build();
      expect(((await svc.byClient('user', 1)) as any[])[0]).toMatchObject({ clientId: 'a', revenue: 0, revenueSource: 'unavailable' });
      expect(((await svc.byMobile('user', 1)) as any[])[0]).toMatchObject({ mobile: 'm1', revenue: 0, revenueSource: 'unavailable' });
      expect(((await svc.rows('user', 1)) as any[])[0]).toMatchObject({ mobile: 'm1', revenue: 0, revenueSource: 'unavailable' });
    });
    it('non-user metrics are unchanged (no revenue keys)', async () => {
      const { svc } = build();
      const rows: any[] = await svc.dailyTotals('promote', 1);
      expect(rows[0]).toEqual({ date: '2026-10-05', sent: 10, success: 4, failed: 6, banned: 1 });
    });
  });

  describe('Postgres path (Mongo authoritative inside retention, Postgres only for older days)', () => {
    // NOW is 2026-10-05 IST; MONGO_RETENTION_DAYS=13 => cutoff 2026-09-23. 09-21/09-22 are "old".
    const pgRows = (sql: string) => {
      if (sql.includes('FROM payment_event')) {
        return [
          { d: '2026-10-04', client_id: 'a', amt: '300' },
          { d: '2026-10-05', client_id: 'a', amt: '100' },
          { d: '2026-10-05', client_id: 'b', amt: '50' },
        ];
      }
      if (sql.includes('GROUP BY day')) {
        return [
          { d: '2026-09-21', sent: '77', success: '5', failed: '70', banned: '2', newUsers: '9', active: '8', paid: '7' },
          // partial/empty-looking PG rows for recent days must be ignored in favour of Mongo
          { d: '2026-10-05', sent: '1', success: '0', failed: '1', banned: '0', newUsers: '0', active: '0', paid: '0' },
        ];
      }
      return [{ client_id: 'a', sent: '100', success: '60', failed: '40', banned: '5', newUsers: '4', active: '4', paid: '1' }];
    };

    it('an old day (>13d) comes from Postgres; a recent day comes from Mongo even if PG has a partial row', async () => {
      const { svc, queries } = build({ pgRows });
      const rows: any[] = await svc.dailyTotals('promote', 15); // 09-21 .. 10-05
      expect(rows).toHaveLength(15);
      expect(rows[0]).toEqual({ date: '2026-09-21', sent: 77, success: 5, failed: 70, banned: 2 });
      expect(rows[1]).toEqual({ date: '2026-09-22', sent: 0, success: 0, failed: 0, banned: 0 });
      expect(rows[14]).toEqual({ date: '2026-10-05', sent: 10, success: 4, failed: 6, banned: 1 }); // Mongo, not PG's 1
      expect(queries).toHaveLength(1);
      expect(queries[0].sql).toContain('FROM daily_client');
      expect(queries[0].params[0]).toEqual(['2026-09-21', '2026-09-22']); // PG never asked for recent days
    });

    it('PG returning [] for a recent day does not zero it (Mongo answers)', async () => {
      const { svc } = build({ pgRows: (sql) => (sql.includes('payment_event') ? [] : []) });
      const rows: any[] = await svc.dailyTotals('promote', 3);
      expect(rows[2]).toEqual({ date: '2026-10-05', sent: 10, success: 4, failed: 6, banned: 1 });
    });

    it('window entirely inside Mongo retention never queries daily_client', async () => {
      const { svc, queries } = build({ pgRows });
      await svc.dailyTotals('promote', 13);
      expect(queries.filter((q) => q.sql.includes('daily_client'))).toHaveLength(0);
    });

    it('user: counters from Mongo for recent days, revenue from payment_event only for days >= REVENUE_FROM_DAY', async () => {
      const { svc } = build({ pgRows });
      const rows: any[] = await svc.dailyTotals('user', 3); // 10-03, 10-04, 10-05
      expect(REVENUE_FROM_DAY).toBe('2026-10-04');
      expect(rows.map((r) => [r.date, r.revenue, r.revenueSource])).toEqual([
        ['2026-10-03', 0, 'unavailable'],
        ['2026-10-04', 300, 'payment_event'],
        ['2026-10-05', 150, 'payment_event'],
      ]);
      expect(rows[2]).toMatchObject({ newUsers: 2, active: 3, paid: 1 }); // Mongo, not PG
    });

    it('byClient merges Mongo (recent) + PG (old) per client without counting a day twice', async () => {
      const { svc } = build({ pgRows });
      const rows: any[] = await svc.byClient('promote', 15);
      // PG a: sent 100 (old days only) + Mongo a: sent 10 (10-05)
      expect(rows).toEqual([{ clientId: 'a', sent: 110, success: 64, failed: 46, banned: 6 }]);
    });

    it('byClient(user) joins per-client revenue, includes revenue-only clients, flags partial windows', async () => {
      const { svc } = build({ pgRows });
      const partial: any[] = await svc.byClient('user', 3);
      expect(partial.map((r) => [r.clientId, r.revenue, r.revenueSource])).toEqual([
        ['a', 400, 'payment_event_partial'],
        ['b', 50, 'payment_event_partial'],
      ]);
      expect(partial[0]).toMatchObject({ newUsers: 2, active: 3, paid: 1 });
      const full: any[] = await svc.byClient('user', 2);
      expect(full[0].revenueSource).toBe('payment_event');
      const promoteNs: any[] = await svc.byClient('user', 2, 'promote-clients');
      expect(promoteNs.every((r) => r.revenue === 0 && r.revenueSource === 'unavailable')).toBe(true);
    });

    it('byMobile and rows stay on Mongo (daily_client has no mobile column)', async () => {
      const { svc, pg } = build({ pgRows });
      await svc.byMobile('promote', 1);
      await svc.rows('promote', 1);
      expect(pg.query).not.toHaveBeenCalled();
    });
  });

  describe("DAILY_ANALYTICS_SOURCE=pg (every day from Postgres, Mongo only as fallback)", () => {
    const pgRows = (sql: string) => {
      if (sql.includes('FROM payment_event')) return [{ d: '2026-10-05', client_id: 'a', amt: '100' }];
      if (sql.includes('FROM promotion_send')) {
        return [{ client_id: 'a', mobile: 'm1', sent: '12', success: '5', failed: '7', banned: '6' }];
      }
      if (sql.includes('GROUP BY day')) {
        return [{ d: '2026-10-05', sent: '50', success: '20', failed: '30', banned: '3', newUsers: '6', active: '7', paid: '2' }];
      }
      return [{ client_id: 'a', sent: '50', success: '20', failed: '30', banned: '3', newUsers: '6', active: '7', paid: '2' }];
    };
    beforeEach(() => { process.env.DAILY_ANALYTICS_SOURCE = 'pg'; });
    afterEach(() => { delete process.env.DAILY_ANALYTICS_SOURCE; });

    it('a recent day (inside Mongo retention) comes from Postgres, not Mongo', async () => {
      const { svc } = build({ pgRows });
      const rows: any[] = await svc.dailyTotals('promote', 1);
      expect(rows[0]).toMatchObject({ date: '2026-10-05', sent: 50, success: 20 }); // Mongo has sent 10
    });
    it('byClient for a recent day comes from Postgres only (no Mongo add-on)', async () => {
      const { svc } = build({ pgRows });
      const rows: any[] = (await svc.byClient('promote', 1)) as any;
      expect(rows).toEqual([expect.objectContaining({ clientId: 'a', sent: 50 })]);
    });
    it('user metric: counters and revenue both from Postgres', async () => {
      const { svc } = build({ pgRows });
      const rows: any[] = await svc.dailyTotals('user', 1);
      expect(rows[0]).toMatchObject({ newUsers: 6, revenue: 100, revenueSource: 'payment_event' });
    });
    it('byMobile(promote) comes from promotion_send with failed = banned + failed', async () => {
      const { svc, queries } = build({ pgRows });
      const rows: any[] = await svc.byMobile('promote', 1);
      expect(rows).toEqual([expect.objectContaining({ clientId: 'a', mobile: 'm1', sent: 12, success: 5, failed: 7, banned: 6 })]);
      const q = queries.find((x) => x.sql.includes('FROM promotion_send'))!;
      expect(q.sql).toMatch(/outcome IN \('banned', ?'failed'\)/);
      expect(q.sql).toMatch(/outcome <> 'deleted'/);
    });
    it('byMobile for user/reaction stays on Mongo (no per-mobile table by decision)', async () => {
      const { svc, pg } = build({ pgRows });
      await svc.byMobile('user', 1);
      expect(pg.query).not.toHaveBeenCalled();
    });
    it('Postgres down => Mongo answers (fallback kept)', async () => {
      const { svc } = build({ pgRows: () => undefined });
      expect(((await svc.dailyTotals('promote', 1)) as any[])[0]).toMatchObject({ sent: 10 });
      expect(((await svc.byMobile('promote', 1)) as any[])[0]).toMatchObject({ mobile: 'm1', sent: 10 });
    });
    it('any other value keeps the hybrid default', async () => {
      process.env.DAILY_ANALYTICS_SOURCE = 'PGX';
      const { svc } = build({ pgRows });
      expect(((await svc.dailyTotals('promote', 1)) as any[])[0]).toMatchObject({ sent: 10 });
    });
  });

  describe('fallback', () => {
    it('PG failure (reader returns undefined) => Mongo answer for every PG-capable method', async () => {
      const { svc } = build({ pgRows: () => undefined });
      const t: any[] = (await svc.dailyTotals('promote', 15)) as any;
      expect(t[14]).toMatchObject({ sent: 10, success: 4 });
      expect(t[0]).toMatchObject({ sent: 0 });
      expect(((await svc.byClient('promote', 15)) as any[])[0]).toMatchObject({ clientId: 'a', sent: 10 });
      expect(((await svc.overview(1)) as any).user[0]).toMatchObject({ newUsers: 2, revenue: 0, revenueSource: 'unavailable' });
    });
    it('payment_event query failing after daily_client succeeded still falls back (no half-PG answer)', async () => {
      const { svc } = build({
        pgRows: (sql) => (sql.includes('payment_event') ? undefined : [{ d: '2026-10-05', newUsers: '99', active: '0', paid: '0' }]),
      });
      const rows: any[] = await svc.dailyTotals('user', 1);
      expect(rows[0].newUsers).toBe(2); // Mongo value, not PG's 99
    });
  });
});
