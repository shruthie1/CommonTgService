import { Logger } from '@nestjs/common';
import {
  AnalyticsHealthCheck,
  PROBE_RETRIES,
  PROBE_RETRY_DELAY_MS,
  decideAnalyticsHealth,
  istDay,
  median,
} from '../analytics-health.check';

const TRAILING = [1000, 1100, 900, 1200, 1000, 950, 1050]; // median 1000
const healthy = { day: '2026-10-30', promotionSendRows: 980, trailingPromotionSendRows: TRAILING, dailyClientRows: 40, dailyMobileRows: 120 };

describe('decideAnalyticsHealth (injected numbers)', () => {
  it('healthy day => no problems', () => {
    expect(decideAnalyticsHealth(healthy)).toEqual([]);
  });
  it('median of 7 / even count / empty', () => {
    expect(median(TRAILING)).toBe(1000);
    expect(median([1, 3, 2, 10])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it('promotion_send 0 rows', () => {
    expect(decideAnalyticsHealth({ ...healthy, promotionSendRows: 0 })).toEqual(['promotion_send has 0 rows']);
  });
  it('promotion_send below 50% of the trailing median (499 < 500) alerts; exactly 50% does not', () => {
    expect(decideAnalyticsHealth({ ...healthy, promotionSendRows: 499 })).toEqual([
      'promotion_send has 499 rows, below 50% of the trailing 7-day median 1000',
    ]);
    expect(decideAnalyticsHealth({ ...healthy, promotionSendRows: 500 })).toEqual([]);
  });
  it('trailing median 0 (fresh table) does not raise the ratio alert', () => {
    expect(decideAnalyticsHealth({ ...healthy, promotionSendRows: 5, trailingPromotionSendRows: [0, 0, 0, 0, 0, 0, 0] })).toEqual([]);
  });
  it('daily_client 0 rows', () => {
    expect(decideAnalyticsHealth({ ...healthy, dailyClientRows: 0 })).toEqual(['daily_client has 0 rows']);
  });
  it('daily_mobile 0 rows alerts, like daily_client', () => {
    expect(decideAnalyticsHealth({ ...healthy, dailyMobileRows: 0 })).toEqual(['daily_mobile has 0 rows']);
  });
  it('PG unreachable short-circuits every count check', () => {
    expect(decideAnalyticsHealth({ day: '2026-10-30', pgError: 'connect ETIMEDOUT' })).toEqual(['Postgres unreachable: connect ETIMEDOUT']);
  });
  it('ANALYTICS_DB_URL unset (disabled) => no problems', () => {
    expect(decideAnalyticsHealth({ day: '2026-10-30', disabled: true })).toEqual([]);
  });
  it('a missing table is its own message, not "unreachable"; its count check is skipped', () => {
    expect(decideAnalyticsHealth({ ...healthy, missingTables: ['daily_mobile'], dailyMobileRows: undefined })).toEqual([
      'daily_mobile table is missing (42P01)',
    ]);
  });
  it('several problems are all reported', () => {
    expect(decideAnalyticsHealth({ ...healthy, promotionSendRows: 0, dailyClientRows: 0, dailyMobileRows: 0 })).toHaveLength(3);
  });
});

describe('AnalyticsHealthCheck.run (yesterday IST, read-only queries)', () => {
  // 2026-10-31 02:30 IST = 2026-10-30T21:00Z: yesterday (IST) = 2026-10-30.
  const NOW = new Date('2026-10-30T21:00:00Z').getTime();
  const ECONN = { kind: 'query', message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' };
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** handler returns rows, or an error object ({ error }) delivered through onError. */
  function build(handler: (sql: string, params: unknown[], call: number) => any[] | { error: any }) {
    const queries: { sql: string; params: unknown[] }[] = [];
    const pg = {
      query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
        queries.push({ sql, params });
        const r = handler(sql, params, queries.length);
        if (Array.isArray(r)) return r;
        onError?.(r.error);
        return undefined;
      }),
    };
    const check = new AnalyticsHealthCheck(pg as any);
    const notify = jest.fn().mockResolvedValue(true);
    const sleep = jest.fn().mockResolvedValue(undefined);
    check.notify = notify;
    check.sleep = sleep;
    return { check, notify, sleep, queries };
  }
  const sends = (yesterday: number) => [
    ...['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((d) => ({ d, n: '1000' })),
    { d: '2026-10-30', n: String(yesterday) },
  ];
  const ok = (sql: string) => (sql.includes('analytics_daily_parity') ? [] : sql.includes('promotion_send') ? sends(900) : [{ n: '42' }]);

  it('istDay: 02:30 IST on 10-31 => yesterday 10-30', () => {
    expect(istDay(NOW, -1)).toBe('2026-10-30');
    expect(istDay(NOW, 0)).toBe('2026-10-31');
  });

  it('healthy: no alert; only SELECTs over the 8-day IST window', async () => {
    const { check, notify, queries } = build(ok);
    expect(await check.run(NOW)).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(queries.every((q) => /^\s*SELECT/i.test(q.sql))).toBe(true);
    expect(queries[0].params).toEqual(['2026-10-23T00:00:00+05:30', '2026-10-31T00:00:00+05:30']);
    expect(queries.map((q) => q.sql.match(/FROM (\w+)/)![1])).toEqual(['promotion_send', 'daily_client', 'daily_mobile', 'analytics_daily_parity']);
    expect(queries[2].params).toEqual(['2026-10-30']);
    expect(queries[3]).toEqual({ sql: 'SELECT * FROM analytics_daily_parity($1::date)', params: ['2026-10-30'] });
  });

  it('daily parity rows => one alert summarising mismatches by check kind', async () => {
    const parityRows = [
      { check_name: 'client_vs_mobile', client_id: 'shruthi1', namespace: 'tg-aut', counter: 'revenue', expected: '500', actual: '450' },
      { check_name: 'client_vs_mobile', client_id: 'shruthi1', namespace: 'tg-aut', counter: 'payers', expected: '3', actual: '2' },
      { check_name: 'client_vs_mobile', client_id: 'kavya1', namespace: 'promote-clients', counter: 'sent', expected: '10', actual: '9' },
      { check_name: 'sends_vs_client', client_id: 'kavya1', namespace: null, counter: 'sent', expected: '12', actual: '10' },
    ];
    const { check, notify, queries } = build((sql) => (sql.includes('analytics_daily_parity') ? parityRows : ok(sql)));
    const problems = await check.run(NOW);
    expect(problems).toEqual([
      'daily parity client_vs_mobile: 3 mismatched row(s) across 2 client(s)',
      'daily parity sends_vs_client: 1 mismatched row(s) across 1 client(s)',
    ]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].fields).toContainEqual({ label: 'parity mismatches', value: '4' });
    expect(queries.every((q) => /^\s*SELECT/i.test(q.sql))).toBe(true);
  });

  it('a client_vs_mobile parity row for yesterday alerts with no config at all', async () => {
    const { check, notify } = build((sql) =>
      sql.includes('analytics_daily_parity') ? [{ check_name: 'client_vs_mobile', client_id: 'c1', counter: 'sent', expected: '5', actual: '0' }] : ok(sql),
    );
    expect(await check.run(NOW)).toEqual(['daily parity client_vs_mobile: 1 mismatched row(s) across 1 client(s)']);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('analytics_daily_parity missing (42883) => skipped quietly: no alert, no retry', async () => {
    const { check, notify, sleep } = build((sql) =>
      sql.includes('analytics_daily_parity')
        ? { error: { kind: 'query', message: 'function analytics_daily_parity(date) does not exist', code: '42883' } }
        : ok(sql),
    );
    expect(await check.run(NOW)).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('drop below 50% of median => one alert naming the day and the problem', async () => {
    const { check, notify } = build((sql) => (sql.includes('promotion_send') ? sends(300) : ok(sql)));
    const problems = await check.run(NOW);
    expect(problems).toEqual(['promotion_send has 300 rows, below 50% of the trailing 7-day median 1000']);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ severity: 'error', summary: 'IST day 2026-10-30', details: problems });
  });

  it('missing yesterday row in promotion_send counts as 0', async () => {
    const { check } = build((sql) => (sql.includes('promotion_send') ? sends(0).slice(0, 7) : ok(sql)));
    expect(await check.run(NOW)).toEqual(['promotion_send has 0 rows']);
  });

  it('daily_mobile is always queried; 0 rows for yesterday alerts with no config at all', async () => {
    const { check, queries } = build((sql) => (sql.includes('FROM daily_mobile') ? [{ n: '0' }] : ok(sql)));
    expect(await check.run(NOW)).toEqual(['daily_mobile has 0 rows']);
    expect(queries.some((q) => q.sql.includes('FROM daily_mobile'))).toBe(true);
  });

  it('ANALYTICS_DB_URL unset => logged and skipped: no alert, no retry', async () => {
    const { check, notify, sleep, queries } = build(() => ({ error: { kind: 'disabled', message: 'ANALYTICS_DB_URL not set' } }));
    expect(await check.run(NOW)).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
  });

  it(`unreachable => re-probed ${PROBE_RETRIES} times ${PROBE_RETRY_DELAY_MS / 1000}s apart, then ONE alert with the error`, async () => {
    const { check, notify, sleep } = build(() => ({ error: ECONN }));
    expect(await check.run(NOW)).toEqual(['Postgres unreachable: connect ECONNREFUSED [ECONNREFUSED]']);
    expect(PROBE_RETRIES).toBe(3);
    expect(sleep.mock.calls).toEqual([[60_000], [60_000], [60_000]]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('unreachable once, then reachable on retry => no alert', async () => {
    const { check, notify, sleep } = build((sql, _p, call) => (call === 1 ? { error: ECONN } : ok(sql)));
    expect(await check.run(NOW)).toEqual([]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('daily_mobile missing (42P01) => its own message, no retry, other checks still run', async () => {
    const { check, notify, sleep } = build((sql) =>
      sql.includes('daily_mobile') ? { error: { kind: 'query', message: 'relation "daily_mobile" does not exist', code: '42P01' } } : ok(sql),
    );
    expect(await check.run(NOW)).toEqual(['daily_mobile table is missing (42P01)']);
    expect(sleep).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a failing notifier never throws out of run()', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { check } = build(() => ({ error: ECONN }));
    check.notify = jest.fn().mockRejectedValue(new Error('telegram 502'));
    await expect(check.run(NOW)).resolves.toEqual(['Postgres unreachable: connect ECONNREFUSED [ECONNREFUSED]']);
  });
});
