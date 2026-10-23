import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PromoteStatDaily,
  PromoteStatDailyDocument,
  ReactionStatDaily,
  ReactionStatDailyDocument,
  UserStatDaily,
  UserStatDailyDocument,
} from './schemas/daily-analytics.schema';
import { AnalyticsPgError, AnalyticsPgReader } from './analytics-pg.reader';

export type DailyMetric = 'promote' | 'reaction' | 'user';

/**
 * userStatsDaily.revenue is $inc'd on every credit event and is measured ~3.31x inflated, so it is
 * never reported. `revenue` stays in the response (number, same key) but is sourced only from
 * Postgres payment_event, which has data from this IST day onward. Otherwise it is 0 and
 * `revenueSource` says so: 'payment_event' | 'payment_event_partial' (window starts before
 * REVENUE_FROM_DAY) | 'unavailable' (0 means "unknown", not "no revenue").
 */
export const REVENUE_FROM_DAY = '2026-10-04';
/**
 * First IST day promotion_send is complete for every process (measured 2026-10-08: per-mobile
 * totals since 10-05 within 0.2% of Mongo, 10-07 exact; a 14-day window starting 09-25 had only
 * 31% of Mongo's sends). Per-mobile reads come from promotion_send only for windows starting on or
 * after this day; earlier windows stay on Mongo, which still holds 14 days.
 */
export const PROMOTION_SEND_FROM_DAY = '2026-10-05';
export type RevenueSource = 'payment_event' | 'payment_event_partial' | 'unavailable';
/**
 * DAILY_MOBILE_FROM_DAY (env, read on every call; the Mongo `configuration` doc lands in process.env)
 * = first IST day Postgres daily_mobile (day x client x namespace x mobile, same counters as the
 * Mongo *StatsDaily docs) is complete. In 'pg' mode, per-mobile reads (byMobile, rows) serve every
 * day on or after it from daily_mobile; days before it keep the previous source (Mongo, or
 * promotion_send for an eligible promote window). Unset or not a valid YYYY-MM-DD = daily_mobile is
 * never read (behaviour exactly as before it existed). Set it only after the backfill is verified and
 * every tg-platform process writes daily_mobile. Rollback: unset it. Hybrid mode never reads it.
 */
export const DAILY_MOBILE_FROM_DAY_ENV = 'DAILY_MOBILE_FROM_DAY';
export function dailyMobileFromDay(): string | undefined {
  const v = (process.env[DAILY_MOBILE_FROM_DAY_ENV] || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}
/** Collects the first Postgres error of ONE public call (per call: no shared state between requests). */
type PgCtx = { error?: AnalyticsPgError };
/** Added to every row of an answer served from Mongo because Postgres failed in 'pg' mode. */
export const MONGO_FALLBACK_SOURCE = 'mongo-fallback';

/** Mongo field -> daily_client column. Fixed map: column names never come from request input. */
/** Also the daily_mobile columns (same names as daily_client). */
const PG_COLUMNS: Record<DailyMetric, Record<string, string>> = {
  promote: { sent: 'sent', success: 'delivered', failed: 'failed', banned: 'banned' },
  reaction: {
    success: 'reactions_success',
    failed: 'reactions_failed',
    restricted: 'reactions_restricted',
    floods: 'reactions_floods',
  },
  user: { newUsers: 'new_users', active: 'active_users', paid: 'payers' },
};

/**
 * Days still inside Mongo's 14-day TTL (daily collections) are read from Mongo; 13 leaves a day of
 * margin at the TTL edge. Postgres serves only older days.
 */
export const MONGO_RETENTION_DAYS = 13;

/**
 * DAILY_ANALYTICS_SOURCE: 'hybrid' (default) = the split above; 'pg' = EVERY day from Postgres
 * (daily_client / payment_event / promotion_send), Mongo only when Postgres is unavailable.
 * Long-term placement: tg-platform docs/design/2026-10-04-mongo-postgres-data-placement.md.
 * Flip to 'pg' only once every tg-platform process runs the analytics build and the day+2 repair
 * backfill has run — before that, recent days in Postgres are partial. Rollback: unset it.
 */
export const DAILY_ANALYTICS_SOURCE_ENV = 'DAILY_ANALYTICS_SOURCE';
export function dailyAnalyticsSource(): 'hybrid' | 'pg' {
  return (process.env[DAILY_ANALYTICS_SOURCE_ENV] || '').trim().toLowerCase() === 'pg' ? 'pg' : 'hybrid';
}
/** Sorts after every 'YYYY-MM-DD', so every date in a window counts as "old" (Postgres). */
const ALL_DAYS_FROM_PG = '9999-12-31';

const num = (v: unknown): number => Number(v) || 0;
/** Mongo's binary string order (JS `<`), not the Postgres collation. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Read-only access to the TTL-based daily analytics collections that the promote-clients and
 * tg-aut services write. Powers the dashboard: per-day trends, per-client breakdowns, and
 * fleet-wide totals. Never writes (the services own the writes).
 */
@Injectable()
export class DailyAnalyticsService {
  private readonly logger = new Logger(DailyAnalyticsService.name);

  constructor(
    @InjectModel(PromoteStatDaily.name) private promoteModel: Model<PromoteStatDailyDocument>,
    @InjectModel(ReactionStatDaily.name) private reactionModel: Model<ReactionStatDailyDocument>,
    @InjectModel(UserStatDaily.name) private userModel: Model<UserStatDailyDocument>,
    private readonly pg: AnalyticsPgReader,
  ) {}

  private modelFor(metric: DailyMetric): Model<any> {
    if (metric === 'reaction') return this.reactionModel;
    if (metric === 'user') return this.userModel;
    return this.promoteModel;
  }

  private numericFields(metric: DailyMetric): string[] {
    if (metric === 'reaction') return ['success', 'failed', 'restricted', 'floods'];
    if (metric === 'user') return ['newUsers', 'active', 'paid'];
    return ['sent', 'success', 'failed', 'banned'];
  }

  /** Last N days as "YYYY-MM-DD" (IST), oldest first — for filling gaps in trend responses. */
  private lastNDates(days: number): string[] {
    const out: string[] = [];
    const n = Math.min(Math.max(Math.floor(days) || 1, 1), 60);
    for (let i = n - 1; i >= 0; i -= 1) {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000);
      out.push(ist.toISOString().slice(0, 10));
    }
    return out;
  }

  /**
   * 'pg' mode answer served from Mongo because Postgres failed: warn (with the reader's error) and
   * tag every row `source: 'mongo-fallback'` (additive; once Mongo *StatsDaily writes stop, this
   * answer is stale or empty). Hybrid mode returns the rows untouched, as before.
   */
  private mongoFallback<T extends Record<string, unknown>>(method: string, rows: T[], ctx: PgCtx): T[] {
    if (dailyAnalyticsSource() !== 'pg') return rows;
    const e = ctx.error;
    this.logger.warn(
      `daily-analytics ${method}: Postgres unavailable, answering from Mongo (${MONGO_FALLBACK_SOURCE}): ${e ? `${e.message}${e.code ? ` [${e.code}]` : ''}` : 'unknown error'}`,
    );
    return rows.map((r) => ({ ...r, source: MONGO_FALLBACK_SOURCE }));
  }

  private onErr(ctx: PgCtx) {
    return (e: AnalyticsPgError) => {
      if (!ctx.error) ctx.error = e;
    };
  }

  /** 'pg' mode with DAILY_MOBILE_FROM_DAY set: days on/after it come from daily_mobile. Otherwise none do. */
  private splitDailyMobile(dates: string[]) {
    const from = dailyAnalyticsSource() === 'pg' ? dailyMobileFromDay() : undefined;
    if (!from) return { from, before: dates, fromDailyMobile: [] as string[] };
    return {
      from,
      before: dates.filter((d) => d < from),
      fromDailyMobile: dates.filter((d) => d >= from),
    };
  }

  /** WHERE fragments for the optional client/namespace/mobile filters; params[0] is the day list. */
  private dmFilters(params: unknown[], clientId?: string, namespace?: string, mobile?: string): string {
    const parts: string[] = [];
    for (const [col, v] of [['client_id', clientId], ['namespace', namespace], ['mobile', mobile]] as const) {
      if (!v) continue;
      params.push(v);
      parts.push(`AND ${col} = $${params.length}`);
    }
    return parts.join(' ');
  }

  /**
   * A daily_mobile row carries all three metrics; Mongo only has a doc for a metric that was
   * incremented (zero increments are dropped), so rows with every column of this metric at 0 are
   * not part of that metric's answer.
   */
  private dmNonZero(metric: DailyMetric): string {
    return `(${Object.values(PG_COLUMNS[metric]).map((c) => `${c} <> 0`).join(' OR ')})`;
  }

  /**
   * Raw per-(day, namespace, client, mobile) rows from daily_mobile, mapped back to the Mongo doc
   * shape (date, namespace, clientId, mobile, profile when set, Mongo counter names). Every counter
   * of the metric is present as a number (Mongo omits never-incremented counters). Undefined if PG failed.
   */
  private async dmRows(metric: DailyMetric, dates: string[], clientId?: string, namespace?: string, mobile?: string, ctx: PgCtx = {}) {
    const params: unknown[] = [dates];
    const filters = this.dmFilters(params, clientId, namespace, mobile);
    const cols = Object.entries(PG_COLUMNS[metric]).map(([key, col]) => `${col} AS "${key}"`).join(', ');
    const found = await this.pg.query<Record<string, unknown>>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS d, namespace, client_id, mobile, profile, ${cols}
         FROM daily_mobile
        WHERE day = ANY($1::date[]) ${filters} AND ${this.dmNonZero(metric)}
        ORDER BY day, client_id, namespace, mobile`,
      params,
      this.onErr(ctx),
    );
    if (!found) return undefined;
    const fields = this.numericFields(metric);
    return found
      .map((r) => {
        const out: Record<string, unknown> = {
          date: String(r.d),
          namespace: r.namespace,
          clientId: String(r.client_id),
          mobile: String(r.mobile),
        };
        if (r.profile) out.profile = r.profile;
        for (const f of fields) out[f] = num(r[f]);
        if (metric === 'user') {
          out.revenue = 0;
          out.revenueSource = 'unavailable' as RevenueSource;
        }
        return out;
      })
      .sort((a, b) => cmp(a.date as string, b.date as string) || cmp(a.clientId as string, b.clientId as string));
  }

  /** Raw daily rows for a metric, optionally filtered by client/namespace/mobile, over the last N days. */
  async rows(metric: DailyMetric, days = 14, clientId?: string, namespace?: string, mobile?: string) {
    const dates = this.lastNDates(days);
    const { before, fromDailyMobile } = this.splitDailyMobile(dates);
    if (!fromDailyMobile.length) return this.mongoRows(metric, dates, clientId, namespace, mobile);
    const ctx: PgCtx = {};
    const dm = await this.dmRows(metric, fromDailyMobile, clientId, namespace, mobile, ctx);
    if (!dm) return this.mongoFallback('rows', await this.mongoRows(metric, dates, clientId, namespace, mobile), ctx);
    // `before` days all sort before every daily_mobile day, so concatenation keeps (date, clientId) order.
    const old = before.length ? await this.mongoRows(metric, before, clientId, namespace, mobile) : [];
    return [...old, ...dm];
  }

  private async mongoRows(metric: DailyMetric, dates: string[], clientId?: string, namespace?: string, mobile?: string) {
    const filter: Record<string, unknown> = { date: { $in: dates } };
    if (clientId) filter.clientId = clientId;
    if (namespace) filter.namespace = namespace;
    if (mobile) filter.mobile = mobile;
    const found = await this.modelFor(metric)
      .find(filter, { _id: 0, expireAt: 0, createdAt: 0 })
      .sort({ date: 1, clientId: 1 })
      .lean()
      .exec();
    // Per-mobile rows have no truthful revenue source (payment_event has no mobile).
    return metric === 'user'
      ? found.map((r: any) => ({ ...r, revenue: 0, revenueSource: 'unavailable' as RevenueSource }))
      : found;
  }

  // ── Postgres path ────────────────────────────────────────────────────────────────────────────

  private pgSelect(metric: DailyMetric): string {
    return Object.entries(PG_COLUMNS[metric])
      .map(([key, col]) => `COALESCE(SUM(${col}), 0)::bigint AS "${key}"`)
      .join(', ');
  }

  /** payment_event revenue per (IST day, client). Undefined if PG unavailable. */
  private async pgRevenue(dates: string[], ctx: PgCtx = {}): Promise<Map<string, Map<string, number>> | undefined> {
    const from = dates.find((d) => d >= REVENUE_FROM_DAY);
    const out = new Map<string, Map<string, number>>();
    if (!from) return out;
    const rows = await this.pg.query<{ d: string; client_id: string; amt: string }>(
      `SELECT to_char((ts AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS d, client_id,
              SUM(amount)::bigint AS amt
         FROM payment_event
        WHERE ts >= $1::timestamptz AND NOT is_cheat AND amount > 0
        GROUP BY 1, 2`,
      [`${from}T00:00:00+05:30`],
      this.onErr(ctx),
    );
    if (!rows) return undefined;
    const set = new Set(dates);
    for (const r of rows) {
      if (!set.has(r.d)) continue;
      if (!out.has(r.d)) out.set(r.d, new Map());
      out.get(r.d)!.set(r.client_id, num(r.amt));
    }
    return out;
  }

  private windowRevenueSource(dates: string[]): RevenueSource {
    if (dates[0] >= REVENUE_FROM_DAY) return 'payment_event';
    return dates[dates.length - 1] >= REVENUE_FROM_DAY ? 'payment_event_partial' : 'unavailable';
  }

  /** IST days at or after this are still inside Mongo's 14-day TTL: Mongo is authoritative for them. */
  private mongoCutoff(): string {
    if (dailyAnalyticsSource() === 'pg') return ALL_DAYS_FROM_PG;
    return this.lastNDates(MONGO_RETENTION_DAYS)[0];
  }

  private async pgDailyRows(metric: DailyMetric, dates: string[], ctx: PgCtx = {}) {
    if (!dates.length) return [] as Record<string, unknown>[];
    return this.pg.query<Record<string, unknown>>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS d, ${this.pgSelect(metric)}
         FROM daily_client WHERE day = ANY($1::date[]) GROUP BY day`,
      [dates],
      this.onErr(ctx),
    );
  }

  private async mongoDailyTotals(metric: DailyMetric, dates: string[]) {
    const fields = this.numericFields(metric);
    const group: Record<string, unknown> = { _id: '$date' };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([{ $match: { date: { $in: dates } } }, { $group: group }, { $sort: { _id: 1 } }] as any[])
      .exec();
    return new Map<string, any>(agg.map((d: any) => [d._id, d]));
  }

  /** Per-day totals: Mongo for days inside its retention, Postgres only for older days. */
  private async hybridDailyTotals(metric: DailyMetric, dates: string[], ctx: PgCtx = {}) {
    const cutoff = this.mongoCutoff();
    const old = dates.filter((d) => d < cutoff);
    const recent = dates.filter((d) => d >= cutoff);
    const pgRows = await this.pgDailyRows(metric, old, ctx);
    if (!pgRows) return undefined;
    const revenue = metric === 'user' ? await this.pgRevenue(dates, ctx) : new Map<string, Map<string, number>>();
    if (!revenue) return undefined;
    const pgByDate = new Map(pgRows.map((r) => [String(r.d), r]));
    const mongoByDate = recent.length ? await this.mongoDailyTotals(metric, recent) : new Map<string, any>();
    const fields = this.numericFields(metric);
    return dates.map((date) => {
      const row: any = (date < cutoff ? pgByDate : mongoByDate).get(date) || {};
      const out: Record<string, unknown> = { date };
      for (const f of fields) out[f] = num(row[f]);
      if (metric === 'user') {
        const perClient = revenue.get(date);
        out.revenue = perClient ? [...perClient.values()].reduce((a, b) => a + b, 0) : 0;
        out.revenueSource = (date >= REVENUE_FROM_DAY ? 'payment_event' : 'unavailable') as RevenueSource;
      }
      return out;
    });
  }

  private async mongoByClientRows(metric: DailyMetric, dates: string[], namespace?: string) {
    const fields = this.numericFields(metric);
    const match: Record<string, unknown> = { date: { $in: dates } };
    if (namespace) match.namespace = namespace;
    const group: Record<string, unknown> = { _id: '$clientId' };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([{ $match: match }, { $group: group }, { $sort: { _id: 1 } }] as any[])
      .exec();
    return agg.map((d: any) => ({ ...d, client_id: d._id }));
  }

  /** Per-client totals: Mongo rows for recent days + Postgres rows for older days, summed (no day twice). */
  private async hybridByClient(metric: DailyMetric, dates: string[], namespace?: string, ctx: PgCtx = {}) {
    const cutoff = this.mongoCutoff();
    const old = dates.filter((d) => d < cutoff);
    const recent = dates.filter((d) => d >= cutoff);
    const fields = this.numericFields(metric);
    let pgRows: Record<string, unknown>[] = [];
    if (old.length) {
      const params: unknown[] = [old];
      let nsClause = '';
      if (namespace) {
        params.push(namespace);
        nsClause = 'AND namespace = $2';
      }
      const r = await this.pg.query<Record<string, unknown>>(
        `SELECT client_id, ${this.pgSelect(metric)}
           FROM daily_client WHERE day = ANY($1::date[]) ${nsClause} GROUP BY client_id`,
        params,
        this.onErr(ctx),
      );
      if (!r) return undefined;
      pgRows = r;
    }
    // payment_event carries no namespace; it is tg-aut revenue.
    const revenueApplies = metric === 'user' && (!namespace || namespace === 'tg-aut');
    const revenue = revenueApplies ? await this.pgRevenue(dates, ctx) : new Map<string, Map<string, number>>();
    if (!revenue) return undefined;
    const perClientRevenue = new Map<string, number>();
    for (const m of revenue.values()) for (const [c, a] of m) perClientRevenue.set(c, (perClientRevenue.get(c) || 0) + a);
    const mongoRows = recent.length ? await this.mongoByClientRows(metric, recent, namespace) : [];

    const totals = new Map<string, Record<string, number>>();
    const add = (id: unknown, row: any) => {
      const key = String(id);
      const t = totals.get(key) || Object.fromEntries(fields.map((f) => [f, 0]));
      for (const f of fields) t[f] += num(row?.[f]);
      totals.set(key, t);
    };
    for (const r of pgRows) add(r.client_id, r);
    for (const r of mongoRows) add(r.client_id, r);
    // A client with payments but no daily row yet still shows its revenue.
    for (const c of perClientRevenue.keys()) if (!totals.has(c)) add(c, {});
    const source: RevenueSource = revenueApplies ? this.windowRevenueSource(dates) : 'unavailable';
    return [...totals.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([clientId, t]) => {
        const out: Record<string, unknown> = { clientId, ...t };
        if (metric === 'user') {
          out.revenue = perClientRevenue.get(clientId) || 0;
          out.revenueSource = source;
        }
        return out;
      });
  }

  /** Per-day fleet totals for a metric (summed across all clients), gap-filled with zeroes. */
  async dailyTotals(metric: DailyMetric, days = 14) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
    const hybrid = await this.hybridDailyTotals(metric, dates, ctx);
    if (hybrid) return hybrid;
    const fields = this.numericFields(metric);
    const byDate = await this.mongoDailyTotals(metric, dates);
    return this.mongoFallback('dailyTotals', dates.map((date) => {
      const row = byDate.get(date) || {};
      const out: Record<string, unknown> = { date };
      for (const f of fields) out[f] = (row as any)[f] || 0;
      if (metric === 'user') {
        out.revenue = 0;
        out.revenueSource = 'unavailable' as RevenueSource;
      }
      return out;
    }), ctx);
  }

  /** Per-client totals for a metric over the last N days (leaderboard/table view). */
  async byClient(metric: DailyMetric, days = 14, namespace?: string) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
    const hybrid = await this.hybridByClient(metric, dates, namespace, ctx);
    if (hybrid) return hybrid;
    const fields = this.numericFields(metric);
    const agg = await this.mongoByClientRows(metric, dates, namespace);
    return this.mongoFallback('byClient', agg.map((d: any) => {
      const out: Record<string, unknown> = { clientId: d._id };
      for (const f of fields) out[f] = d[f] || 0;
      if (metric === 'user') {
        out.revenue = 0;
        out.revenueSource = 'unavailable' as RevenueSource;
      }
      return out;
    }), ctx);
  }

  /**
   * Per-mobile totals for a metric over the last N days — the per-mobile breakdown view.
   * promote-clients runs MANY mobiles per clientId, so this is the only way to see e.g. which
   * mobile under a clientId is failing (real example: meghana1 sent=75 failed=72 blended across
   * mobiles before this dimension existed). Optionally scoped to one clientId and/or namespace.
   */
  async byMobile(metric: DailyMetric, days = 14, clientId?: string, namespace?: string) {
    const dates = this.lastNDates(days);
    const { from, before, fromDailyMobile } = this.splitDailyMobile(dates);
    if (!fromDailyMobile.length) return this.byMobileBeforeDailyMobile(metric, dates, clientId, namespace);
    const ctx: PgCtx = {};
    // daily_mobile, not promotion_send, for these days: promotion_send is not a superset (no
    // namespace column, so a namespace filter could never be served, and its counts approximate
    // Mongo's counters within ~0.2%), while daily_mobile holds Mongo's own counters per namespace.
    const dm = await this.dmByMobile(metric, fromDailyMobile, clientId, namespace, ctx);
    const old = dm && before.length
      ? await this.byMobileBeforeDailyMobile(metric, before, clientId, namespace, `${from}T00:00:00+05:30`, ctx)
      : [];
    if (!dm || !old) {
      return this.mongoFallback('byMobile', await this.mongoByMobile(metric, dates, clientId, namespace), ctx);
    }
    return this.mergeByMobile(metric, [...old, ...dm]);
  }

  /**
   * The per-mobile answer as it was before daily_mobile existed: promotion_send for an eligible
   * promote window in 'pg' mode (no namespace, window from PROMOTION_SEND_FROM_DAY; `until` caps it
   * where daily_mobile takes over), otherwise Mongo. With `until` (the split case) a promotion_send
   * failure resolves undefined so the caller falls back for the whole window.
   */
  private async byMobileBeforeDailyMobile(
    metric: DailyMetric,
    dates: string[],
    clientId?: string,
    namespace?: string,
    until?: string,
    ctx: PgCtx = {},
  ): Promise<Record<string, unknown>[] | undefined> {
    // promotion_send has no namespace column, so a namespace-scoped request stays on Mongo.
    if (metric === 'promote' && dailyAnalyticsSource() === 'pg' && !namespace && dates[0] >= PROMOTION_SEND_FROM_DAY) {
      const pg = await this.pgPromoteByMobile(dates, clientId, until, ctx);
      if (pg) return pg;
      if (until) return undefined;
      return this.mongoFallback('byMobile', await this.mongoByMobile(metric, dates, clientId, namespace), ctx);
    }
    return this.mongoByMobile(metric, dates, clientId, namespace);
  }

  private async mongoByMobile(metric: DailyMetric, dates: string[], clientId?: string, namespace?: string) {
    const fields = this.numericFields(metric);
    const match: Record<string, unknown> = { date: { $in: dates } };
    if (clientId) match.clientId = clientId;
    if (namespace) match.namespace = namespace;
    const group: Record<string, unknown> = { _id: { clientId: '$clientId', mobile: '$mobile' } };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([
        { $match: match },
        { $group: group },
        { $sort: { '_id.clientId': 1, '_id.mobile': 1 } },
      ] as any[])
      .exec();
    return agg.map((d: any) => {
      const out: Record<string, unknown> = { clientId: d._id.clientId, mobile: d._id.mobile };
      for (const f of fields) out[f] = d[f] || 0;
      if (metric === 'user') {
        out.revenue = 0;
        out.revenueSource = 'unavailable' as RevenueSource;
      }
      return out;
    });
  }

  /** Per-(client, mobile) sums from daily_mobile, Mongo field names. Undefined if PG failed. */
  private async dmByMobile(metric: DailyMetric, dates: string[], clientId?: string, namespace?: string, ctx: PgCtx = {}) {
    const params: unknown[] = [dates];
    const filters = this.dmFilters(params, clientId, namespace);
    return this.pg.query<Record<string, unknown>>(
      `SELECT client_id AS "clientId", mobile, ${this.pgSelect(metric)}
         FROM daily_mobile
        WHERE day = ANY($1::date[]) ${filters} AND ${this.dmNonZero(metric)}
        GROUP BY client_id, mobile`,
      params,
      this.onErr(ctx),
    );
  }

  /** Sums rows per (clientId, mobile) into the Mongo byMobile shape and order. */
  private mergeByMobile(metric: DailyMetric, rows: Record<string, unknown>[]) {
    const fields = this.numericFields(metric);
    const totals = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = JSON.stringify([String(r.clientId), String(r.mobile)]);
      const t = totals.get(key) || { clientId: String(r.clientId), mobile: String(r.mobile), ...Object.fromEntries(fields.map((f) => [f, 0])) };
      for (const f of fields) t[f] = (t[f] as number) + num(r[f]);
      totals.set(key, t);
    }
    return [...totals.values()]
      .sort((a, b) => cmp(a.clientId as string, b.clientId as string) || cmp(a.mobile as string, b.mobile as string))
      .map((t) => (metric === 'user' ? { ...t, revenue: 0, revenueSource: 'unavailable' as RevenueSource } : t));
  }

  /**
   * Per-mobile promotion totals from promotion_send, mapped to the Mongo field meanings:
   * sent excludes 'deleted' (a second row about a delivered message), failed = banned + failed
   * (Mongo's failed counter includes bans). Undefined if Postgres is unavailable.
   */
  private async pgPromoteByMobile(dates: string[], clientId?: string, until?: string, ctx: PgCtx = {}) {
    const params: unknown[] = [`${dates[0]}T00:00:00+05:30`];
    let clientClause = '';
    if (clientId) {
      params.push(clientId);
      clientClause = `AND client_id = $${params.length}`;
    }
    if (until) {
      params.push(until);
      clientClause += ` AND ts < $${params.length}::timestamptz`;
    }
    const rows = await this.pg.query<Record<string, unknown>>(
      `SELECT client_id, mobile,
              count(*) FILTER (WHERE outcome <> 'deleted')              AS sent,
              count(*) FILTER (WHERE outcome = 'delivered')             AS success,
              count(*) FILTER (WHERE outcome IN ('banned', 'failed'))   AS failed,
              count(*) FILTER (WHERE outcome = 'banned')                AS banned
         FROM promotion_send
        WHERE ts >= $1::timestamptz ${clientClause}
        GROUP BY client_id, mobile
        ORDER BY client_id, mobile`,
      params,
      this.onErr(ctx),
    );
    if (!rows) return undefined;
    return rows.map((r) => ({
      clientId: String(r.client_id),
      mobile: String(r.mobile),
      sent: num(r.sent),
      success: num(r.success),
      failed: num(r.failed),
      banned: num(r.banned),
    }));
  }

  /** Combined dashboard overview: fleet daily totals for all three metrics in one call. */
  async overview(days = 14) {
    const [promote, reaction, user] = await Promise.all([
      this.dailyTotals('promote', days),
      this.dailyTotals('reaction', days),
      this.dailyTotals('user', days),
    ]);
    return { days, promote, reaction, user };
  }
}
