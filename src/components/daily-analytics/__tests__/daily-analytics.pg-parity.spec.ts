/**
 * Parity: the Postgres path must return the same totals as the Mongo path for days both cover
 * (revenue excluded - Mongo's is inflated and no longer reported).
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
import { DailyAnalyticsService } from '../daily-analytics.service';
import { fakeModel } from './fake-models';

const URL_ = process.env.TEST_PG_URL;
const DIR = process.env.PARITY_DIR;
const maybe = URL_ && DIR ? describe : describe.skip;

maybe('PG vs Mongo parity (prod-shaped data)', () => {
  const load = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR!, f), 'utf8'));
  let client: any;
  let pgSvc: DailyAnalyticsService;
  let mongoSvc: DailyAnalyticsService;
  let ttlMongoSvc: DailyAnalyticsService;
  let reader: AnalyticsPgReader;
  // "Today" is 2026-10-10 IST, so the window is 2026-09-20 .. 10-10 and Mongo's retention cutoff is
  // 2026-09-28: 09-20..09-27 must come from Postgres, 09-28.. from Mongo. The oracle is Mongo over the
  // FULL prod copy (09-20..10-01 complete; 10-02 was copied mid-day into supabase = the 'partial until
  // repair' case, which the hybrid correctly ignores because 10-02 is inside Mongo retention).
  const DAYS = 21;
  const CUTOFF = '2026-09-28';
  const stripRevenue = (rows: any[]) => rows.map(({ revenue, revenueSource, ...rest }) => rest);

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
    const files = ['promoteStatsDaily.json', 'reactionStatsDaily.json', 'userStatsDaily.json'];
    const models = files.map((f) => fakeModel(load(f))) as any[];
    // What Mongo would still hold on 2026-10-10: only days inside its TTL window.
    const recentOnly = files.map((f) => fakeModel(load(f).filter((d: any) => d.date >= CUTOFF))) as any[];
    process.env.ANALYTICS_DB_URL = URL_;
    reader = new AnalyticsPgReader();
    pgSvc = new DailyAnalyticsService(recentOnly[0], recentOnly[1], recentOnly[2], reader);
    ttlMongoSvc = new DailyAnalyticsService(recentOnly[0], recentOnly[1], recentOnly[2], { query: async () => undefined } as any);
    mongoSvc = new DailyAnalyticsService(models[0], models[1], models[2], { query: async () => undefined } as any);
  });
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-10T12:00:00Z').getTime()));
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await client?.end();
    await reader?.onModuleDestroy();
    delete process.env.ANALYTICS_DB_URL;
  });

  it.each(['promote', 'reaction', 'user'] as const)('%s: dailyTotals identical per day', async (m) => {
    const pg: any[] = (await pgSvc.dailyTotals(m, DAYS)) as any;
    const mongo: any[] = (await mongoSvc.dailyTotals(m, DAYS)) as any;
    expect(pg).toHaveLength(DAYS);
    expect(stripRevenue(pg)).toEqual(stripRevenue(mongo));
    // proves Postgres actually supplied the old days: TTL-trimmed Mongo alone has zeros there
    const ttlOnly: any[] = (await ttlMongoSvc.dailyTotals(m, DAYS)) as any;
    expect(ttlOnly[0]).not.toEqual(pg[0]);
    expect(Object.values(pg[0]).some((v) => typeof v === 'number' && v > 0)).toBe(true);
  });

  it.each(['promote', 'reaction', 'user'] as const)('%s: byClient identical', async (m) => {
    const pg = await pgSvc.byClient(m, DAYS);
    const mongo = await mongoSvc.byClient(m, DAYS);
    expect(pg.length).toBeGreaterThan(10);
    expect(stripRevenue(pg as any[])).toEqual(stripRevenue(mongo as any[]));
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
