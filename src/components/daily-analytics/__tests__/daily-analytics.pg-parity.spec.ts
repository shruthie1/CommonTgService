/**
 * Parity: the Postgres answers must equal the totals of prod-shaped Mongo *StatsDaily copies for the
 * days both cover (revenue excluded - Mongo's is inflated and never reported). The service no longer
 * reads Mongo; the Mongo copies are only the oracle, summed in this file.
 *
 * Opt-in (needs a local Postgres with analytics/schema.sql applied and prod-shaped copies):
 *   TEST_PG_URL=postgres://postgres:e2e@127.0.0.1:55432/postgres \
 *   PARITY_DIR=<dir with supabase.json, promoteStatsDaily.json, userStatsDaily.json, reactionStatsDaily.json> \
 *   npx jest src/components/daily-analytics/__tests__/daily-analytics.pg-parity.spec.ts
 * TRUNCATEs daily_client and payment_event in that database. Skipped when the env vars are unset.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AnalyticsPgReader } from '../analytics-pg.reader';
import { DailyAnalyticsService, DailyMetric } from '../daily-analytics.service';

const URL_ = process.env.TEST_PG_URL;
const DIR = process.env.PARITY_DIR;
const maybe = URL_ && DIR ? describe : describe.skip;

const FIELDS: Record<DailyMetric, string[]> = {
  promote: ['sent', 'success', 'failed', 'banned'],
  reaction: ['success', 'failed', 'restricted', 'floods'],
  user: ['newUsers', 'active', 'paid'],
};
const FILES: Record<DailyMetric, string> = {
  promote: 'promoteStatsDaily.json',
  reaction: 'reactionStatsDaily.json',
  user: 'userStatsDaily.json',
};

maybe('PG vs Mongo-copy parity (prod-shaped data)', () => {
  const load = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR!, f), 'utf8'));
  let client: any;
  let pgSvc: DailyAnalyticsService;
  let reader: AnalyticsPgReader;
  // "Today" is 2026-10-10 IST, so the window is 2026-09-20 .. 10-10. The oracle is the FULL prod
  // Mongo copy, limited to the days the supabase copy has complete (09-20..10-01; 10-02 was copied
  // mid-day).
  const DAYS = 21;
  const LAST_COMPLETE = '2026-10-01';
  const stripRevenue = (rows: any[]) => rows.map(({ revenue, revenueSource, ...rest }) => rest);

  /** Mongo-copy sums per key (date or clientId) over the given dates. */
  const oracle = (m: DailyMetric, key: 'date' | 'clientId', dates: string[]) => {
    const set = new Set(dates);
    const out = new Map<string, Record<string, number>>();
    for (const d of load(FILES[m]) as any[]) {
      if (!set.has(d.date)) continue;
      const t = out.get(d[key]) || Object.fromEntries(FIELDS[m].map((f) => [f, 0]));
      for (const f of FIELDS[m]) t[f] += Number(d[f]) || 0;
      out.set(d[key], t);
    }
    return out;
  };

  beforeAll(async () => {
    const { Client } = require('pg');
    client = new Client({ connectionString: URL_, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query('TRUNCATE daily_client, payment_event');
    const rows = load('supabase.json').daily_client;
    const cols = ['day', 'client_id', 'namespace', 'sent', 'delivered', 'banned', 'failed', 'new_users', 'active_users', 'payers', 'revenue', 'reactions_success', 'reactions_restricted', 'reactions_failed', 'reactions_floods'];
    for (const r of rows) {
      await client.query(
        `INSERT INTO daily_client (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        cols.map((c) => (c === 'day' ? String(r[c]).slice(0, 10) : r[c])),
      );
    }
    process.env.ANALYTICS_DB_URL = URL_;
    reader = new AnalyticsPgReader();
    pgSvc = new DailyAnalyticsService(reader);
  });
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-10T12:00:00Z').getTime()));
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await client?.end();
    await reader?.onModuleDestroy();
    delete process.env.ANALYTICS_DB_URL;
  });

  it.each(['promote', 'reaction', 'user'] as const)('%s: dailyTotals identical per complete day', async (m) => {
    const pg: any[] = stripRevenue((await pgSvc.dailyTotals(m, DAYS)) as any[]).filter((r) => r.date <= LAST_COMPLETE);
    const want = oracle(m, 'date', pg.map((r) => r.date));
    expect(pg.length).toBeGreaterThan(10);
    expect(pg).toEqual(pg.map((r) => ({ date: r.date, ...(want.get(r.date) || Object.fromEntries(FIELDS[m].map((f) => [f, 0]))) })));
    expect(Object.values(pg[0]).some((v) => typeof v === 'number' && v > 0)).toBe(true);
  });

  it.each(['promote', 'reaction', 'user'] as const)('%s: byClient identical over complete days', async (m) => {
    // 12 days ending 10-01 (09-20..10-01, all complete); the oracle sums the same dates.
    jest.spyOn(Date, 'now').mockReturnValue(new Date(`${LAST_COMPLETE}T12:00:00Z`).getTime());
    const pg = stripRevenue((await pgSvc.byClient(m, 12)) as any[]);
    const dates = ((await pgSvc.dailyTotals(m, 12)) as any[]).map((r) => r.date);
    const want = oracle(m, 'clientId', dates);
    expect(pg.length).toBeGreaterThan(10);
    expect(pg).toEqual([...want.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([clientId, t]) => ({ clientId, ...t })));
  });

  it('real payment_event: IST day bucketing, excludes cheat/negative, per-client join', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-05T06:00:00Z').getTime());
    await client.query(
      `INSERT INTO payment_event (ts, chat_id, client_id, persona_id, amount, is_cheat) VALUES
        ('2026-10-04T18:45:00Z','c1','sowmya2','p',200,false),  -- 00:15 IST on 10-05
        ('2026-10-04T10:00:00Z','c2','sowmya2','p',100,false),   -- 10-04 IST
        ('2026-10-04T11:00:00Z','c3','sowmya2','p',999,true),    -- cheat: excluded
        ('2026-10-04T12:00:00Z','c4','sowmya2','p',-50,false),   -- negative: excluded
        ('2026-10-03T10:00:00Z','c5','sowmya2','p',777,false)    -- before REVENUE_FROM_DAY: outside window rows`,
    );
    const rows: any[] = (await pgSvc.dailyTotals('user', 3)) as any;
    expect(rows.map((r) => [r.date, r.revenue, r.revenueSource])).toEqual([
      ['2026-10-03', 0, 'unavailable'],
      ['2026-10-04', 100, 'payment_event'],
      ['2026-10-05', 200, 'payment_event'],
    ]);
    const byClient: any[] = (await pgSvc.byClient('user', 2)) as any;
    expect(byClient.find((r) => r.clientId === 'sowmya2')).toMatchObject({ revenue: 300, revenueSource: 'payment_event' });
    await client.query('TRUNCATE payment_event');
  });

  it('prints fleet totals for the report', async () => {
    const out: Record<string, unknown> = {};
    for (const m of ['promote', 'reaction', 'user'] as const) {
      const rows: any[] = (await pgSvc.dailyTotals(m, DAYS)) as any;
      out[m] = rows.reduce((a, r) => { for (const k of Object.keys(r)) if (typeof r[k] === 'number') a[k] = (a[k] || 0) + r[k]; return a; }, {} as any);
    }
    // eslint-disable-next-line no-console
    console.log('FLEET TOTALS 2026-09-20..10-01', JSON.stringify(out));
  });
});
