import { ServiceUnavailableException } from '@nestjs/common';
import { DailyAnalyticsService, REVENUE_FROM_DAY } from '../daily-analytics.service';

const NOW = new Date('2026-10-05T06:00:00Z'); // 11:30 IST on 2026-10-05

function build(pgRows: (sql: string, params: unknown[]) => any[] | undefined) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return pgRows(sql, params);
    }),
  };
  const svc = new DailyAnalyticsService(pg as any);
  return { svc, pg, queries };
}

/** daily_client / payment_event answers (pg returns bigint as strings). */
const pgRows = (sql: string) => {
  if (sql.includes('FROM payment_event')) {
    return [
      { d: '2026-10-04', client_id: 'a', owner: '300', gross: '300' },
      { d: '2026-10-05', client_id: 'a', owner: '100', gross: '100' },
      { d: '2026-10-05', client_id: 'b', owner: '50', gross: '50' },
    ];
  }
  if (sql.includes('GROUP BY day')) {
    return [
      { d: '2026-09-21', sent: '77', success: '5', failed: '70', banned: '2', newUsers: '9', active: '8', paid: '7' },
      { d: '2026-10-05', sent: '50', success: '20', failed: '30', banned: '3', newUsers: '6', active: '7', paid: '2' },
    ];
  }
  return [
    { client_id: 'a', sent: '100', success: '60', failed: '40', banned: '5', newUsers: '4', active: '4', paid: '1' },
    { client_id: 'B', sent: '1', success: '1', failed: '0', banned: '0', newUsers: '0', active: '0', paid: '0' },
  ];
};

describe('DailyAnalyticsService (Postgres only)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime()));
  afterEach(() => jest.restoreAllMocks());

  describe('dailyTotals (daily_client)', () => {
    it('every day of the window from daily_client, gap-filled with zeroes, numbers not strings', async () => {
      const { svc, queries } = build(pgRows);
      const rows: any[] = await svc.dailyTotals('promote', 15); // 09-21 .. 10-05
      expect(rows).toHaveLength(15);
      expect(rows[0]).toEqual({ date: '2026-09-21', sent: 77, success: 5, failed: 70, banned: 2 });
      expect(rows[1]).toEqual({ date: '2026-09-22', sent: 0, success: 0, failed: 0, banned: 0 });
      expect(rows[14]).toEqual({ date: '2026-10-05', sent: 50, success: 20, failed: 30, banned: 3 });
      expect(queries).toHaveLength(1);
      expect(queries[0].sql).toContain('FROM daily_client');
      expect(queries[0].params[0]).toHaveLength(15);
    });

    it('user: counters from daily_client, revenue from payment_event only for days >= REVENUE_FROM_DAY', async () => {
      const { svc } = build(pgRows);
      const rows: any[] = await svc.dailyTotals('user', 3); // 10-03, 10-04, 10-05
      expect(REVENUE_FROM_DAY).toBe('2026-10-04');
      expect(rows.map((r) => [r.date, r.revenue, r.revenueSource])).toEqual([
        ['2026-10-03', 0, 'unavailable'],
        ['2026-10-04', 300, 'payment_event'],
        ['2026-10-05', 150, 'payment_event'],
      ]);
      expect(rows[2]).toEqual({ date: '2026-10-05', newUsers: 6, active: 7, paid: 2, revenue: 150, grossRevenue: 150, flaggedRevenue: 0, revenueSource: 'payment_event' });
    });

    it('a window entirely before REVENUE_FROM_DAY never queries payment_event', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-02T06:00:00Z').getTime());
      const { svc, queries } = build(pgRows);
      const rows: any[] = await svc.dailyTotals('user', 2);
      expect(rows.every((r) => r.revenue === 0 && r.revenueSource === 'unavailable')).toBe(true);
      expect(queries.some((q) => q.sql.includes('payment_event'))).toBe(false);
    });

    it('non-user metrics carry no revenue keys', async () => {
      const { svc } = build(pgRows);
      const rows: any[] = await svc.dailyTotals('reaction', 1);
      expect(rows[0]).toEqual({ date: '2026-10-05', success: 20, failed: 30, restricted: 0, floods: 0 }); // fixture shares success/failed keys
    });
  });

  describe('byClient (daily_client + payment_event)', () => {
    it('per-client sums in binary order (B before a)', async () => {
      const { svc } = build(pgRows);
      expect(await svc.byClient('promote', 15)).toEqual([
        { clientId: 'B', sent: 1, success: 1, failed: 0, banned: 0 },
        { clientId: 'a', sent: 100, success: 60, failed: 40, banned: 5 },
      ]);
    });

    it('user: joins per-client revenue, includes revenue-only clients, flags partial windows', async () => {
      const { svc } = build(pgRows);
      const partial: any[] = await svc.byClient('user', 3);
      expect(partial.map((r) => [r.clientId, r.revenue, r.revenueSource])).toEqual([
        ['B', 0, 'payment_event_partial'],
        ['a', 400, 'payment_event_partial'],
        ['b', 50, 'payment_event_partial'],
      ]);
      expect(partial[1]).toMatchObject({ newUsers: 4, active: 4, paid: 1 });
      const full: any[] = await svc.byClient('user', 2);
      expect(full[0].revenueSource).toBe('payment_event');
    });

    it('namespace filter goes to daily_client; promote-clients user revenue is unavailable', async () => {
      const { svc, queries } = build(pgRows);
      const rows: any[] = await svc.byClient('user', 2, 'promote-clients');
      expect(queries[0].params[1]).toBe('promote-clients');
      expect(queries[0].sql).toContain('AND namespace = $2');
      expect(queries.some((q) => q.sql.includes('payment_event'))).toBe(false);
      expect(rows.every((r) => r.revenue === 0 && r.revenueSource === 'unavailable')).toBe(true);
    });
  });

  it('overview: the three dailyTotals', async () => {
    const { svc } = build(pgRows);
    const o: any = await svc.overview(1);
    expect(o.days).toBe(1);
    expect(o.promote).toEqual([{ date: '2026-10-05', sent: 50, success: 20, failed: 30, banned: 3 }]);
    expect(o.user[0]).toMatchObject({ newUsers: 6, revenue: 150, revenueSource: 'payment_event' });
  });

  describe('Postgres failure => ServiceUnavailableException', () => {
    it.each([
      ['dailyTotals', (s: DailyAnalyticsService) => s.dailyTotals('promote', 15)],
      ['byClient', (s: DailyAnalyticsService) => s.byClient('promote', 15)],
      ['byMobile', (s: DailyAnalyticsService) => s.byMobile('promote', 1)],
      ['rows', (s: DailyAnalyticsService) => s.rows('promote', 1)],
      ['overview', (s: DailyAnalyticsService) => s.overview(1)],
    ])('%s', async (_name, call) => {
      const { svc } = build(() => undefined);
      await expect(call(svc)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it('no reader error recorded => message says unknown error', async () => {
      const { svc } = build(() => undefined);
      await expect(svc.dailyTotals('promote', 1)).rejects.toThrow('daily-analytics dailyTotals: Postgres unavailable: unknown error');
    });
    it('payment_event failing after daily_client succeeded => error for byClient too (no half answer)', async () => {
      const { svc } = build((sql) => (sql.includes('payment_event') ? undefined : [{ client_id: 'a', newUsers: '99', active: '0', paid: '0' }]));
      await expect(svc.byClient('user', 1)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
