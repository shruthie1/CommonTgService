import { DailyAnalyticsService } from '../daily-analytics.service';

/**
 * Review 2026-10-28: tg-aut always writes payment_event.is_cheat=false, so `NOT is_cheat` kept
 * cheat-flagged chats in revenue (~16.7% over 7 days). `revenue` must be the owner figure
 * (payment_event_owner.owner_amount); gross and flagged are additive keys.
 */
const NOW = new Date('2026-10-27T06:00:00Z'); // 11:30 IST on 2026-10-27

function build() {
  const queries: string[] = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('payment_event')) {
        // Answer exactly what the SQL asks for: an owner-rule query gets owner/gross, a raw one amt.
        if (sql.includes('owner_amount')) {
          return [
            { d: '2026-10-26', client_id: 'a', owner: '200', gross: '300' },
            { d: '2026-10-27', client_id: 'a', owner: '100', gross: '100' },
            { d: '2026-10-27', client_id: 'b', owner: '0', gross: '50' },
          ];
        }
        return [
          { d: '2026-10-26', client_id: 'a', amt: '300' },
          { d: '2026-10-27', client_id: 'a', amt: '100' },
          { d: '2026-10-27', client_id: 'b', amt: '50' },
        ];
      }
      if (sql.includes('GROUP BY day')) return [{ d: '2026-10-27', newUsers: '6', active: '7', paid: '2' }];
      return [{ client_id: 'a', newUsers: '4', active: '4', paid: '1' }];
    }),
  };
  return { svc: new DailyAnalyticsService(pg as any), queries };
}

describe('DailyAnalyticsService owner revenue (payment_event_owner)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime()));
  afterEach(() => jest.restoreAllMocks());

  it('reads payment_event_owner.owner_amount, not payment_event with NOT is_cheat', async () => {
    const { svc, queries } = build();
    await svc.dailyTotals('user', 2);
    const rev = queries.find((q) => q.includes('payment_event'))!;
    expect(rev).toContain('FROM payment_event_owner');
    expect(rev).toContain('SUM(owner_amount)');
    expect(rev).not.toContain('is_cheat');
  });

  it('dailyTotals: revenue = owner, plus grossRevenue and flaggedRevenue', async () => {
    const { svc } = build();
    const rows: any[] = await svc.dailyTotals('user', 2);
    expect(rows[0]).toMatchObject({ date: '2026-10-26', revenue: 200, grossRevenue: 300, flaggedRevenue: 100 });
    expect(rows[1]).toMatchObject({ date: '2026-10-27', revenue: 100, grossRevenue: 150, flaggedRevenue: 50 });
  });

  it('byClient: per-client owner revenue; a fully flagged client shows revenue 0 with its gross', async () => {
    const { svc } = build();
    const rows: any[] = await svc.byClient('user', 2);
    expect(rows.map((r) => [r.clientId, r.revenue, r.grossRevenue, r.flaggedRevenue])).toEqual([
      ['a', 300, 400, 100],
      ['b', 0, 50, 50],
    ]);
  });
});
