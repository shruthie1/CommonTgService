/**
 * Owner decision 2026-10-26: daily analytics are read ONLY from Postgres, and a Postgres failure is
 * an explicit 503, never a substitute answer.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { DailyAnalyticsService } from '../daily-analytics.service';

const NOW = new Date('2026-10-26T06:00:00Z'); // 11:30 IST on 2026-10-26

function build(handler: (sql: string, params: unknown[]) => any[] | undefined) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      queries.push({ sql, params });
      const rows = handler(sql, params);
      if (!rows) onError?.({ kind: 'query', message: 'connect ETIMEDOUT', code: 'ETIMEDOUT' });
      return rows;
    }),
  };
  const svc = new DailyAnalyticsService(pg as any);
  return { svc, pg, queries };
}

const dmRow = { d: '2026-10-26', namespace: 'tg-aut', client_id: 'a', mobile: 'm9', profile: null, newUsers: 3, active: 4, paid: 1, success: 1, failed: 0, restricted: 0, floods: 0, sent: 2, banned: 0 };
const happy = (sql: string) => {
  if (sql.includes('FROM daily_mobile') && sql.includes('GROUP BY client_id, mobile')) {
    return [{ clientId: 'a', mobile: 'm9', sent: '2', success: '1', failed: '0', banned: '0', newUsers: '3', active: '4', paid: '1', restricted: '0', floods: '0' }];
  }
  if (sql.includes('FROM daily_mobile')) return [dmRow];
  if (sql.includes('FROM payment_event')) return [];
  if (sql.includes('GROUP BY day')) return [];
  if (sql.includes('FROM daily_client')) return [];
  return [];
};

describe('DailyAnalyticsService: Postgres only', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('every public read', () => {
    it.each([
      ['rows user', (s: DailyAnalyticsService) => s.rows('user', 3)],
      ['rows reaction', (s: DailyAnalyticsService) => s.rows('reaction', 3)],
      ['byMobile user', (s: DailyAnalyticsService) => s.byMobile('user', 3)],
      ['byMobile promote', (s: DailyAnalyticsService) => s.byMobile('promote', 3)],
      ['dailyTotals promote', (s: DailyAnalyticsService) => s.dailyTotals('promote', 3)],
      ['byClient user', (s: DailyAnalyticsService) => s.byClient('user', 3)],
      ['overview', (s: DailyAnalyticsService) => s.overview(3)],
    ])('%s: answered from Postgres', async (_name, call) => {
      const { svc, pg } = build(happy);
      await call(svc);
      expect(pg.query).toHaveBeenCalled();
    });
  });

  it('the service is constructed with the Postgres reader only (no Mongo model injected)', () => {
    expect(DailyAnalyticsService.length).toBe(1);
  });

  it('rows/byMobile read daily_mobile for EVERY day of the window (the window is never split)', async () => {
    const { svc, queries } = build(happy);
    await svc.rows('user', 3);
    await svc.byMobile('promote', 3);
    const dm = queries.filter((q) => q.sql.includes('FROM daily_mobile'));
    expect(dm.map((q) => q.params[0])).toEqual([
      ['2026-10-24', '2026-10-25', '2026-10-26'],
      ['2026-10-24', '2026-10-25', '2026-10-26'],
    ]);
    expect(queries.some((q) => q.sql.includes('promotion_send'))).toBe(false);
  });

  it.each([
    ['rows', (s: DailyAnalyticsService) => s.rows('reaction', 2)],
    ['byMobile', (s: DailyAnalyticsService) => s.byMobile('user', 2)],
    ['dailyTotals', (s: DailyAnalyticsService) => s.dailyTotals('promote', 2)],
    ['byClient', (s: DailyAnalyticsService) => s.byClient('promote', 2)],
    ['overview', (s: DailyAnalyticsService) => s.overview(2)],
  ])('Postgres failure in %s => ServiceUnavailableException naming the error', async (_name, call) => {
    const { svc } = build(() => undefined);
    const err = await call(svc).then(() => undefined, (e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toContain('connect ETIMEDOUT [ETIMEDOUT]');
  });

  it('payment_event failing after daily_client succeeded => error, not a half answer', async () => {
    const { svc } = build((sql) => (sql.includes('payment_event') ? undefined : [{ d: '2026-10-26', newUsers: '9', active: '0', paid: '0' }]));
    await expect(svc.dailyTotals('user', 1)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
