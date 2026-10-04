import { Injectable } from '@nestjs/common';
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
import { AnalyticsPgReader } from './analytics-pg.reader';

export type DailyMetric = 'promote' | 'reaction' | 'user';

/**
 * userStatsDaily.revenue is $inc'd on every credit event and is measured ~3.31x inflated, so it is
 * never reported. `revenue` stays in the response (number, same key) but is sourced only from
 * Postgres payment_event, which has data from this IST day onward. Otherwise it is 0 and
 * `revenueSource` says so: 'payment_event' | 'payment_event_partial' (window starts before
 * REVENUE_FROM_DAY) | 'unavailable' (0 means "unknown", not "no revenue").
 */
export const REVENUE_FROM_DAY = '2026-10-04';
export type RevenueSource = 'payment_event' | 'payment_event_partial' | 'unavailable';

/** Mongo field -> daily_client column. Fixed map: column names never come from request input. */
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

/**
 * Read-only access to the TTL-based daily analytics collections that the promote-clients and
 * tg-aut services write. Powers the dashboard: per-day trends, per-client breakdowns, and
 * fleet-wide totals. Never writes (the services own the writes).
 */
@Injectable()
export class DailyAnalyticsService {
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

  /** Raw daily rows for a metric, optionally filtered by client/namespace/mobile, over the last N days. */
  async rows(metric: DailyMetric, days = 14, clientId?: string, namespace?: string, mobile?: string) {
    const dates = this.lastNDates(days);
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
  private async pgRevenue(dates: string[]): Promise<Map<string, Map<string, number>> | undefined> {
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

  private async pgDailyRows(metric: DailyMetric, dates: string[]) {
    if (!dates.length) return [] as Record<string, unknown>[];
    return this.pg.query<Record<string, unknown>>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS d, ${this.pgSelect(metric)}
         FROM daily_client WHERE day = ANY($1::date[]) GROUP BY day`,
      [dates],
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
  private async hybridDailyTotals(metric: DailyMetric, dates: string[]) {
    const cutoff = this.mongoCutoff();
    const old = dates.filter((d) => d < cutoff);
    const recent = dates.filter((d) => d >= cutoff);
    const pgRows = await this.pgDailyRows(metric, old);
    if (!pgRows) return undefined;
    const revenue = metric === 'user' ? await this.pgRevenue(dates) : new Map<string, Map<string, number>>();
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
  private async hybridByClient(metric: DailyMetric, dates: string[], namespace?: string) {
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
      );
      if (!r) return undefined;
      pgRows = r;
    }
    // payment_event carries no namespace; it is tg-aut revenue.
    const revenueApplies = metric === 'user' && (!namespace || namespace === 'tg-aut');
    const revenue = revenueApplies ? await this.pgRevenue(dates) : new Map<string, Map<string, number>>();
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
    const hybrid = await this.hybridDailyTotals(metric, dates);
    if (hybrid) return hybrid;
    const fields = this.numericFields(metric);
    const byDate = await this.mongoDailyTotals(metric, dates);
    return dates.map((date) => {
      const row = byDate.get(date) || {};
      const out: Record<string, unknown> = { date };
      for (const f of fields) out[f] = (row as any)[f] || 0;
      if (metric === 'user') {
        out.revenue = 0;
        out.revenueSource = 'unavailable' as RevenueSource;
      }
      return out;
    });
  }

  /** Per-client totals for a metric over the last N days (leaderboard/table view). */
  async byClient(metric: DailyMetric, days = 14, namespace?: string) {
    const dates = this.lastNDates(days);
    const hybrid = await this.hybridByClient(metric, dates, namespace);
    if (hybrid) return hybrid;
    const fields = this.numericFields(metric);
    const agg = await this.mongoByClientRows(metric, dates, namespace);
    return agg.map((d: any) => {
      const out: Record<string, unknown> = { clientId: d._id };
      for (const f of fields) out[f] = d[f] || 0;
      if (metric === 'user') {
        out.revenue = 0;
        out.revenueSource = 'unavailable' as RevenueSource;
      }
      return out;
    });
  }

  /**
   * Per-mobile totals for a metric over the last N days — the per-mobile breakdown view.
   * promote-clients runs MANY mobiles per clientId, so this is the only way to see e.g. which
   * mobile under a clientId is failing (real example: meghana1 sent=75 failed=72 blended across
   * mobiles before this dimension existed). Optionally scoped to one clientId and/or namespace.
   */
  async byMobile(metric: DailyMetric, days = 14, clientId?: string, namespace?: string) {
    const dates = this.lastNDates(days);
    const fields = this.numericFields(metric);
    // By decision there is no per-mobile daily table: in 'pg' mode promotion per-mobile numbers come
    // from promotion_send (mobile on every row, 45-day retention). user/reaction stay on Mongo while
    // it is still written. promotion_send has no namespace; mobile pools are disjoint per service.
    if (metric === 'promote' && dailyAnalyticsSource() === 'pg') {
      const pg = await this.pgPromoteByMobile(dates, clientId);
      if (pg) return pg;
    }
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

  /**
   * Per-mobile promotion totals from promotion_send, mapped to the Mongo field meanings:
   * sent excludes 'deleted' (a second row about a delivered message), failed = banned + failed
   * (Mongo's failed counter includes bans). Undefined if Postgres is unavailable.
   */
  private async pgPromoteByMobile(dates: string[], clientId?: string) {
    const params: unknown[] = [`${dates[0]}T00:00:00+05:30`];
    let clientClause = '';
    if (clientId) {
      params.push(clientId);
      clientClause = 'AND client_id = $2';
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
