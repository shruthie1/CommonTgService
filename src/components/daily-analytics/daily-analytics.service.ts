import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AnalyticsPgError, AnalyticsPgReader } from './analytics-pg.reader';

export type DailyMetric = 'promote' | 'reaction' | 'user';

/**
 * `revenue` (number, same key as before) is the OWNER revenue: SUM(owner_amount) from the Postgres
 * view payment_event_owner (credits minus every credit of a chat cheat-flagged on any persona, or
 * with is_cheat). `grossRevenue` is SUM(amount) of the same rows (every credit, as `revenue` meant
 * before 2026-10-28) and `flaggedRevenue` = grossRevenue - revenue. payment_event has
 * data from this IST day onward. Otherwise it is 0 and `revenueSource` says so: 'payment_event' |
 * 'payment_event_partial' (window starts before REVENUE_FROM_DAY) | 'unavailable' (0 means
 * "unknown", not "no revenue").
 */
export const REVENUE_FROM_DAY = '2026-10-04';
export type RevenueSource = 'payment_event' | 'payment_event_partial' | 'unavailable';
/** Collects the first Postgres error of ONE public call (per call: no shared state between requests). */
type PgCtx = { error?: AnalyticsPgError };
/** One (day, client) revenue cell: owner = SUM(owner_amount), gross = SUM(amount). */
type Rev = { owner: number; gross: number };
const ZERO_REV: Rev = { owner: 0, gross: 0 };
const addRev = (a: Rev, b: Rev): Rev => ({ owner: a.owner + b.owner, gross: a.gross + b.gross });
/** The three additive revenue keys of a user-metric row. */
const revFields = (r: Rev) => ({ revenue: r.owner, grossRevenue: r.gross, flaggedRevenue: r.gross - r.owner });

/**
 * Response field -> daily_client / daily_mobile column (same names in both tables). Fixed map:
 * column names never come from request input. The response keys are the historical Mongo
 * *StatsDaily counter names, kept so the API shape does not change.
 */
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

const num = (v: unknown): number => Number(v) || 0;
/** Binary string order (JS `<`, as the old Mongo answers were sorted), not the Postgres collation. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Read-only daily analytics for the dashboard (per-day trends, per-client and per-mobile
 * breakdowns, fleet totals), served ONLY from Postgres (owner decision 2026-10-26):
 * daily_client (+ payment_event_owner for revenue) for totals and by-client, daily_mobile for by-mobile
 * and rows. The Mongo *StatsDaily collections are never read. A Postgres failure is a 503
 * (ServiceUnavailableException), never a substitute answer. Never writes.
 */
@Injectable()
export class DailyAnalyticsService {
  constructor(private readonly pg: AnalyticsPgReader) {}

  private numericFields(metric: DailyMetric): string[] {
    return Object.keys(PG_COLUMNS[metric]);
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

  private onErr(ctx: PgCtx) {
    return (e: AnalyticsPgError) => {
      if (!ctx.error) ctx.error = e;
    };
  }

  /** The explicit error for a call whose Postgres read failed (HTTP 503, with the reader's error). */
  private pgUnavailable(method: string, ctx: PgCtx): ServiceUnavailableException {
    const e = ctx.error;
    return new ServiceUnavailableException(
      `daily-analytics ${method}: Postgres unavailable: ${e ? `${e.message}${e.code ? ` [${e.code}]` : ''}` : 'unknown error'}`,
    );
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
   * A daily_mobile row carries all three metrics; a row with every column of this metric at 0 is
   * not part of that metric's answer (as before, when only incremented counters had a doc).
   */
  private dmNonZero(metric: DailyMetric): string {
    return `(${Object.values(PG_COLUMNS[metric]).map((c) => `${c} <> 0`).join(' OR ')})`;
  }

  private pgSelect(metric: DailyMetric): string {
    return Object.entries(PG_COLUMNS[metric])
      .map(([key, col]) => `COALESCE(SUM(${col}), 0)::bigint AS "${key}"`)
      .join(', ');
  }

  /**
   * Owner and gross revenue per (IST day, client) from payment_event_owner. Undefined if PG failed.
   * `NOT is_cheat` alone is not the owner rule: tg-aut always writes is_cheat=false, so cheat-flagged
   * chats (cheat_flag) are only excluded through the view's owner_amount.
   */
  private async pgRevenue(dates: string[], ctx: PgCtx): Promise<Map<string, Map<string, Rev>> | undefined> {
    const from = dates.find((d) => d >= REVENUE_FROM_DAY);
    const out = new Map<string, Map<string, Rev>>();
    if (!from) return out;
    const rows = await this.pg.query<{ d: string; client_id: string; owner: string; gross: string }>(
      `SELECT to_char((ts AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS d, client_id,
              SUM(owner_amount)::bigint AS owner, SUM(amount)::bigint AS gross
         FROM payment_event_owner
        WHERE ts >= $1::timestamptz AND amount > 0
        GROUP BY 1, 2`,
      [`${from}T00:00:00+05:30`],
      this.onErr(ctx),
    );
    if (!rows) return undefined;
    const set = new Set(dates);
    for (const r of rows) {
      if (!set.has(r.d)) continue;
      if (!out.has(r.d)) out.set(r.d, new Map());
      out.get(r.d)!.set(r.client_id, { owner: num(r.owner), gross: num(r.gross) });
    }
    return out;
  }

  private windowRevenueSource(dates: string[]): RevenueSource {
    if (dates[0] >= REVENUE_FROM_DAY) return 'payment_event';
    return dates[dates.length - 1] >= REVENUE_FROM_DAY ? 'payment_event_partial' : 'unavailable';
  }

  /** Per-day fleet totals for a metric (summed across all clients), gap-filled with zeroes. */
  async dailyTotals(metric: DailyMetric, days = 14) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
    const pgRows = await this.pg.query<Record<string, unknown>>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS d, ${this.pgSelect(metric)}
         FROM daily_client WHERE day = ANY($1::date[]) GROUP BY day`,
      [dates],
      this.onErr(ctx),
    );
    if (!pgRows) throw this.pgUnavailable('dailyTotals', ctx);
    const revenue = metric === 'user' ? await this.pgRevenue(dates, ctx) : new Map<string, Map<string, Rev>>();
    if (!revenue) throw this.pgUnavailable('dailyTotals', ctx);
    const byDate = new Map(pgRows.map((r) => [String(r.d), r]));
    const fields = this.numericFields(metric);
    return dates.map((date) => {
      const row: Record<string, unknown> = byDate.get(date) || {};
      const out: Record<string, unknown> = { date };
      for (const f of fields) out[f] = num(row[f]);
      if (metric === 'user') {
        const perClient = revenue.get(date);
        Object.assign(out, revFields(perClient ? [...perClient.values()].reduce(addRev, ZERO_REV) : ZERO_REV));
        out.revenueSource = (date >= REVENUE_FROM_DAY ? 'payment_event' : 'unavailable') as RevenueSource;
      }
      return out;
    });
  }

  /** Per-client totals for a metric over the last N days (leaderboard/table view). */
  async byClient(metric: DailyMetric, days = 14, namespace?: string) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
    const fields = this.numericFields(metric);
    const params: unknown[] = [dates];
    let nsClause = '';
    if (namespace) {
      params.push(namespace);
      nsClause = 'AND namespace = $2';
    }
    const pgRows = await this.pg.query<Record<string, unknown>>(
      `SELECT client_id, ${this.pgSelect(metric)}
         FROM daily_client WHERE day = ANY($1::date[]) ${nsClause} GROUP BY client_id`,
      params,
      this.onErr(ctx),
    );
    if (!pgRows) throw this.pgUnavailable('byClient', ctx);
    // payment_event carries no namespace; it is tg-aut revenue.
    const revenueApplies = metric === 'user' && (!namespace || namespace === 'tg-aut');
    const revenue = revenueApplies ? await this.pgRevenue(dates, ctx) : new Map<string, Map<string, Rev>>();
    if (!revenue) throw this.pgUnavailable('byClient', ctx);
    const perClientRevenue = new Map<string, Rev>();
    for (const m of revenue.values()) for (const [c, a] of m) perClientRevenue.set(c, addRev(perClientRevenue.get(c) || ZERO_REV, a));

    const totals = new Map<string, Record<string, number>>();
    const add = (id: unknown, row: Record<string, unknown>) => {
      const key = String(id);
      const t = totals.get(key) || Object.fromEntries(fields.map((f) => [f, 0]));
      for (const f of fields) t[f] += num(row?.[f]);
      totals.set(key, t);
    };
    for (const r of pgRows) add(r.client_id, r);
    // A client with payments but no daily row yet still shows its revenue.
    for (const c of perClientRevenue.keys()) if (!totals.has(c)) add(c, {});
    const source: RevenueSource = revenueApplies ? this.windowRevenueSource(dates) : 'unavailable';
    return [...totals.entries()]
      .sort(([a], [b]) => cmp(a, b))
      .map(([clientId, t]) => {
        const out: Record<string, unknown> = { clientId, ...t };
        if (metric === 'user') {
          Object.assign(out, revFields(perClientRevenue.get(clientId) || ZERO_REV));
          out.revenueSource = source;
        }
        return out;
      });
  }

  /**
   * Per-mobile totals for a metric over the last N days — the per-mobile breakdown view, from
   * daily_mobile for every day of the window. promote-clients runs MANY mobiles per clientId, so
   * this is the only way to see e.g. which mobile under a clientId is failing. Optionally scoped
   * to one clientId and/or namespace. Per-mobile revenue is unknown (payment_event has no mobile):
   * user rows carry revenue 0 + revenueSource 'unavailable'.
   */
  async byMobile(metric: DailyMetric, days = 14, clientId?: string, namespace?: string) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
    const params: unknown[] = [dates];
    const filters = this.dmFilters(params, clientId, namespace);
    const rows = await this.pg.query<Record<string, unknown>>(
      `SELECT client_id AS "clientId", mobile, ${this.pgSelect(metric)}
         FROM daily_mobile
        WHERE day = ANY($1::date[]) ${filters} AND ${this.dmNonZero(metric)}
        GROUP BY client_id, mobile`,
      params,
      this.onErr(ctx),
    );
    if (!rows) throw this.pgUnavailable('byMobile', ctx);
    const fields = this.numericFields(metric);
    return rows
      .map((r) => {
        const out: Record<string, unknown> = { clientId: String(r.clientId), mobile: String(r.mobile) };
        for (const f of fields) out[f] = num(r[f]);
        if (metric === 'user') {
          Object.assign(out, revFields(ZERO_REV));
          out.revenueSource = 'unavailable' as RevenueSource;
        }
        return out;
      })
      .sort((a, b) => cmp(a.clientId as string, b.clientId as string) || cmp(a.mobile as string, b.mobile as string));
  }

  /**
   * Raw per-(day, namespace, client, mobile) rows from daily_mobile over the last N days, optionally
   * filtered by client/namespace/mobile: date, namespace, clientId, mobile, profile when set, then
   * every counter of the metric as a number. User rows carry revenue 0 + 'unavailable'.
   */
  async rows(metric: DailyMetric, days = 14, clientId?: string, namespace?: string, mobile?: string) {
    const dates = this.lastNDates(days);
    const ctx: PgCtx = {};
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
    if (!found) throw this.pgUnavailable('rows', ctx);
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
          Object.assign(out, revFields(ZERO_REV));
          out.revenueSource = 'unavailable' as RevenueSource;
        }
        return out;
      })
      .sort((a, b) => cmp(a.date as string, b.date as string) || cmp(a.clientId as string, b.clientId as string));
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
