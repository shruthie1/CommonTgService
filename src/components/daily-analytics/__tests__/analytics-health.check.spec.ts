import { Logger } from '@nestjs/common';
import {
  AnalyticsHealthCheck,
  PROBE_RETRIES,
  PROBE_RETRY_DELAY_MS,
  HISTORY_REALERT_DAYS,
  decideAnalyticsHealth,
  decideHistoryFindings,
  dedupeHistoryFindings,
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
  // Last analytics-history run: 2026-10-31 00:45 IST (19:15Z), 1h45m before NOW, succeeded.
  const JOB_OK = [{ jobid: '7', status: 'succeeded', start_time: '2026-10-30T19:15:00Z', return_message: '1 row' }];
  const SIZE_OK = [{ level: 'info', subject: 'db', detail: 'pg_database_size 310.0 MB (62.0 % of 500 MB); db + WAL 400.0 MB' }];
  const ok = (sql: string): any[] =>
    sql.includes('analytics_size_check')
      ? SIZE_OK
      : sql.includes('analytics_rollup_ledger')
        ? []
        : sql.includes('cron.job')
          ? JOB_OK
          : sql.includes('analytics_daily_parity')
            ? []
            : sql.includes('promotion_send')
              ? sends(900)
              : [{ n: '42' }];

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
    expect(queries.map((q) => q.sql.match(/FROM ([\w.]+)/)![1])).toEqual([
      'promotion_send',
      'daily_client',
      'daily_mobile',
      'analytics_daily_parity',
      'analytics_size_check',
      'analytics_rollup_ledger',
      'cron.job',
    ]);
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

  describe('bounded-history guardrails (analytics/history.sql)', () => {
    const WARN_PS = { level: 'warn', subject: 'promotion_send', detail: '130.2 MB over its 121 MB budget (expiry or rollup gate stuck, or volume changed)' };
    const NULL_SVC = Array.from({ length: 17 }, (_, i) => ({
      step: 'hourly_sends',
      period_start: `2026-10-${String(8 + i).padStart(2, '0')}`,
      status: 'error',
      detail: 'promotion_send has NULL service rows',
    }));
    /** 1000 sends on every day of the queried 8-day window, whatever night it is. */
    const windowSends = (params: unknown[]) =>
      Array.from({ length: 8 }, (_, i) => ({ d: istDay(Date.parse(String(params[0])), i), n: '1000' }));
    const withRows = (over: { size?: any[] | { error: any }; ledger?: any[] | { error: any }; job?: any[] | { error: any } }) => (sql: string, params: unknown[] = []) =>
      sql.includes('FROM promotion_send')
        ? windowSends(params)
        : sql.includes('analytics_size_check') && over.size !== undefined
        ? over.size
        : sql.includes('analytics_rollup_ledger') && over.ledger !== undefined
          ? over.ledger
          : sql.includes('cron.job') && over.job !== undefined
            ? over.job
            : ok(sql);

    it('size warn => alert (one message); info is not an alert', async () => {
      const { check, notify } = build(withRows({ size: [...SIZE_OK, WARN_PS] }));
      const problems = await check.run(NOW);
      expect(problems).toEqual([`size warn promotion_send: ${WARN_PS.detail}`]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toMatchObject({ title: 'Analytics history guardrails', severity: 'error', details: problems });
      expect(notify.mock.calls[0][0].fields).toContainEqual({ label: 'size warn/critical', value: '1' });
    });

    it('size ok (info only), empty ledger, job succeeded 1h45m ago => no alert', async () => {
      const { check, notify } = build(ok);
      expect(await check.run(NOW)).toEqual([]);
      expect(notify).not.toHaveBeenCalled();
    });

    it('critical size => critical severity', async () => {
      const { check, notify } = build(withRows({ size: [{ level: 'critical', subject: 'db', detail: 'pg_database_size 430.0 MB (86.0 % of 500 MB); db + WAL 500.0 MB' }] }));
      await check.run(NOW);
      expect(notify.mock.calls[0][0].severity).toBe('critical');
    });

    it('ledger mismatch/error rows from the last run => one compact line per (status, step)', async () => {
      const ledger = [
        ...NULL_SVC,
        { step: 'monthly_revenue', period_start: '2026-10-01', status: 'mismatch', detail: '5 key(s) src, 4 dst; 4 written, 0 orphan(s)' },
      ];
      const { check, notify, queries } = build(withRows({ ledger }));
      const problems = await check.run(NOW);
      expect(problems).toEqual([
        'ledger error: hourly_sends 17 period(s) 2026-10-08..2026-10-24 (e.g. promotion_send has NULL service rows)',
        'ledger mismatch: monthly_revenue 1 period(s) 2026-10-01 (e.g. 5 key(s) src, 4 dst; 4 written, 0 orphan(s))',
      ]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0].fields).toContainEqual({ label: 'ledger mismatch/error', value: '18' });
      const q = queries.find((x) => x.sql.includes('analytics_rollup_ledger'))!;
      expect(q.sql).toMatch(/run_at = \(SELECT max\(run_at\) FROM analytics_rollup_ledger\)/);
      expect(q.sql).toMatch(/status IN \('mismatch', 'error'\)/);
    });

    it('analytics-history job failed, or no run in 26 h, or not scheduled => alert', async () => {
      const failed = build(withRows({ job: [{ jobid: '7', status: 'failed', start_time: '2026-10-30T19:15:00Z', return_message: 'ERROR: canceling statement due to statement timeout' }] }));
      expect(await failed.check.run(NOW)).toEqual([
        'analytics-history last run failed (started 2026-10-30T19:15:00.000Z): ERROR: canceling statement due to statement timeout',
      ]);
      const stale = build(withRows({ job: [{ jobid: '7', status: 'succeeded', start_time: '2026-10-29T18:59:00Z', return_message: null }] }));
      expect(await stale.check.run(NOW)).toEqual([
        'analytics-history has not run in 26 h (last start 2026-10-29T18:59:00.000Z, succeeded)',
      ]);
      const never = build(withRows({ job: [{ jobid: '7', status: null, start_time: null, return_message: null }] }));
      expect(await never.check.run(NOW)).toEqual(['analytics-history has never run']);
      const missing = build(withRows({ job: [] }));
      expect(await missing.check.run(NOW)).toEqual(['pg_cron job analytics-history is not scheduled']);
    });

    it('missing size function / ledger table (older DB) => skipped quietly: no alert, no retry, no cron probe', async () => {
      const { check, notify, sleep, queries } = build(
        withRows({
          size: { error: { kind: 'query', message: 'function analytics_size_check(date) does not exist', code: '42883' } },
          ledger: { error: { kind: 'query', message: 'relation "analytics_rollup_ledger" does not exist', code: '42P01' } },
        }),
      );
      expect(await check.run(NOW)).toEqual([]);
      expect(notify).not.toHaveBeenCalled();
      expect(sleep).not.toHaveBeenCalled();
      expect(queries.some((q) => q.sql.includes('cron.job'))).toBe(false);
    });

    it('pg_cron schema missing or not readable => job probe skipped quietly', async () => {
      for (const code of ['3F000', '42501', '42P01']) {
        const { check, notify, sleep } = build(withRows({ job: { error: { kind: 'query', message: 'cron', code } } }));
        expect(await check.run(NOW)).toEqual([]);
        expect(notify).not.toHaveBeenCalled();
        expect(sleep).not.toHaveBeenCalled();
      }
    });

    it('dedupe: a persisting condition is sent once, suppressed for the next nights, re-sent after HISTORY_REALERT_DAYS', async () => {
      expect(HISTORY_REALERT_DAYS).toBe(7);
      const handler = withRows({ size: [WARN_PS], ledger: NULL_SVC });
      const night = (d: number) => NOW + d * 24 * 3600_000;
      const jobAt = (d: number) => [{ jobid: '7', status: 'succeeded', start_time: new Date(night(d) - 105 * 60_000).toISOString(), return_message: '' }];

      const first = build(handler);
      const r1 = await first.check.runWithState(night(0), {});
      expect(r1.problems).toHaveLength(2);
      expect(first.notify).toHaveBeenCalledTimes(1);
      expect(Object.values(r1.historyAlerts)).toEqual(Array(18).fill('2026-10-31'));

      // Next night: same conditions, figures drifted (130.2 -> 131.0 MB) => no message.
      const second = build(withRows({ size: [{ ...WARN_PS, detail: WARN_PS.detail.replace('130.2', '131.0') }], ledger: NULL_SVC, job: jobAt(1) }));
      const r2 = await second.check.runWithState(night(1), r1.historyAlerts);
      expect(r2.problems).toEqual([]);
      expect(second.notify).not.toHaveBeenCalled();
      expect(r2.suppressed).toHaveLength(2);
      expect(r2.historyAlerts).toEqual(r1.historyAlerts);

      // Escalation is a new condition => sent at once, alongside nothing else.
      const crit = build(withRows({ size: [{ ...WARN_PS, level: 'critical' }], ledger: NULL_SVC, job: jobAt(2) }));
      const r3 = await crit.check.runWithState(night(2), r2.historyAlerts);
      expect(r3.problems).toEqual([`size critical promotion_send: ${WARN_PS.detail}`]);
      expect(crit.notify).toHaveBeenCalledTimes(1);

      // 7 IST days after the first send, the still-present warn is re-sent once (weekly reminder).
      const week = build(withRows({ size: [WARN_PS], ledger: [], job: jobAt(7) }));
      const r4 = await week.check.runWithState(night(7), r2.historyAlerts);
      expect(r4.problems).toEqual([`size warn promotion_send: ${WARN_PS.detail}`]);
      // Cleared ledger rows are forgotten, so a return would alert again.
      expect(Object.keys(r4.historyAlerts)).toHaveLength(1);
    });

    it('dedupe: an undelivered message does not mark its conditions as sent', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { check, notify } = build(withRows({ size: [WARN_PS] }));
      notify.mockResolvedValue(false);
      const r = await check.runWithState(NOW, {});
      expect(r.problems).toHaveLength(1);
      expect(r.historyAlerts).toEqual({});
    });

    it('existing problems and guardrail lines share ONE message', async () => {
      const { check, notify } = build((sql, params) => (sql.includes('FROM daily_client') ? [{ n: '0' }] : withRows({ size: [WARN_PS] })(sql, params)));
      const problems = await check.run(NOW);
      expect(problems).toEqual(['daily_client has 0 rows', `size warn promotion_send: ${WARN_PS.detail}`]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0].title).toBe('Analytics Postgres health check failed');
    });

    it('pure: decideHistoryFindings / dedupeHistoryFindings', () => {
      const f = decideHistoryFindings({ day: '2026-10-30', checkedAt: NOW, sizeRows: [WARN_PS, ...SIZE_OK] });
      expect(f.map((x) => x.key)).toEqual(['size:warn:promotion_send:# MB over its # MB budget (expiry or rollup gate stuck, or volume changed)']);
      const d = dedupeHistoryFindings(f, { [f[0].key]: '2026-10-25' }, '2026-10-31');
      expect(d.alert).toHaveLength(0);
      expect(dedupeHistoryFindings(f, { [f[0].key]: '2026-10-24' }, '2026-10-31').alert).toHaveLength(1);
    });
  });
});
