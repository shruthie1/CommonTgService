/**
 * GET /monitor/history: long-run series for the tg-chats History tab (design
 * tg-chats/docs/design/2026-11-07-analytics-history-and-insights.md §0.7, §6). Read-only, additive.
 *
 * Ranges (IST): 7d = hourly buckets of the last 7 IST days up to the current hour; 90d = daily buckets
 * of the last 90 IST days up to today; 24m = monthly buckets of the last 24 IST months up to this month.
 * The last bucket is partial (up to now).
 *
 * Sources, finest first. A bucket is read from the finest source whose data has started by then (the
 * source's first row, fleet-wide); an older bucket falls back to the next coarser source; a bucket no
 * source covers is null (an explicit gap, never 0). Inside a covered bucket a missing counter row is a
 * real 0; a missing pool sample is null (gauges are never zero-filled).
 *  - revenue / payers: payment_event_owner (revenue = owner_amount of credits under ₹1,000, payers =
 *    distinct clean chats, the same rules as monitor-merge.ts toCredit), then monthly_revenue
 *    (owner_revenue) for revenue of months before payment_event; payers there stay null (its payers are
 *    per client x persona). Payers are distinct per bucket and are NOT summable across buckets.
 *  - hourly_client (writer live per process from its natural restart) is read only for closed IST days whose
 *    hours add up to daily_client for that column; other days are null.
 *  - sends: hour = promotion_send (as history.sql hourly_sends), then hourly_client; day = daily_client;
 *    month = daily_client, then monthly_client. failed = outcome IN ('failed','banned') on promotion_send,
 *    and the `failed` column (which already counts banned) on the rollup tables (monitor-sql.ts sendsLiveSql).
 *  - new users (tg-aut namespace, as dailyClientSql): hour = hourly_client (verified days only); day =
 *    daily_client; month = daily_client, then monthly_client.
 *  - pool (gauges; b.active and p.eligible have no source, never read): hour = pool_snapshot; day / month =
 *    the last sample per (bucket, pool, client) from pool_snapshot, then daily_pool, then monthly_pool.
 */
import { BadRequestException } from '@nestjs/common';
import { SqlQuery } from './monitor-sql';
import { addDays, istDate, istDayStart, istHour } from './monitor-time';
import { num } from './monitor-util';
import type { CacheInfo } from './monitor.service';

export const HISTORY_RANGES = ['7d', '90d', '24m'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export type HistoryGrain = 'hour' | 'day' | 'month';

export const HISTORY_GRAIN: Record<HistoryRange, HistoryGrain> = { '7d': 'hour', '90d': 'day', '24m': 'month' };
/** Whole history responses: fresh 5 min, then served stale while one rebuild runs (up to 15 min). */
export const HISTORY_PAGE_FRESH_MS = 5 * 60_000;
export const HISTORY_PAGE_MAX_STALE_MS = 15 * 60_000;
/** Snapshot names: 'history:<range>:<clientId|*>'. */
export const HISTORY_PAGE_RE = /^history:(7d|90d|24m):/;

export function parseHistoryRange(range?: string): HistoryRange {
  if (range === undefined || range === '') return '90d';
  if ((HISTORY_RANGES as readonly string[]).includes(range)) return range as HistoryRange;
  throw new BadRequestException(`range must be one of ${HISTORY_RANGES.join('|')}`);
}

export interface HistoryWindow {
  range: HistoryRange;
  grain: HistoryGrain;
  /** first bucket's start (epoch ms, IST boundary) and now */
  start: number;
  end: number;
  /** IST date of the first bucket and today */
  fromDate: string;
  toDate: string;
  /** bucket labels: 'YYYY-MM-DDTHH' (hour), 'YYYY-MM-DD' (day), 'YYYY-MM' (month), IST, oldest first */
  buckets: string[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  return `${yy}-${pad2((((m % 12) + 12) % 12) + 1)}`;
}

export function historyWindow(range: HistoryRange, now: number): HistoryWindow {
  const today = istDate(now);
  const grain = HISTORY_GRAIN[range];
  const buckets: string[] = [];
  let fromDate: string;
  if (range === '7d') {
    fromDate = addDays(today, -6);
    const last = `${today}T${pad2(istHour(now))}`;
    for (let t = istDayStart(fromDate); ; t += 3_600_000) {
      const b = `${istDate(t)}T${pad2(istHour(t))}`;
      buckets.push(b);
      if (b >= last) break;
    }
  } else if (range === '90d') {
    fromDate = addDays(today, -89);
    for (let d = fromDate; d <= today; d = addDays(d, 1)) buckets.push(d);
  } else {
    const cur = today.slice(0, 7);
    fromDate = `${addMonths(cur, -23)}-01`;
    for (let i = 23; i >= 0; i--) buckets.push(addMonths(cur, -i));
  }
  return { range, grain, start: istDayStart(fromDate), end: now, fromDate, toDate: today, buckets };
}

// ---------------------------------------------------------------- SQL

const IST_TZ = `'Asia/Kolkata'`;
const FMT: Record<HistoryGrain, string> = { hour: 'YYYY-MM-DD"T"HH24', day: 'YYYY-MM-DD', month: 'YYYY-MM' };
const tsBucket = (col: string, g: HistoryGrain) => `to_char(${col} AT TIME ZONE ${IST_TZ}, '${FMT[g]}')`;
const dayBucket = (col: string, g: Exclude<HistoryGrain, 'hour'>) => `to_char(${col}, '${FMT[g]}')`;
const iso = (ms: number) => new Date(ms).toISOString();

function q(name: string, sql: string, params: unknown[]): SqlQuery {
  return { name, sql: `/* monitor.${name} */ ${sql}`, params };
}

/** `AND client_id = $n` when filtered (params gets the id), else nothing. */
function clientPred(clientId: string | null, params: unknown[], col = 'client_id'): string {
  if (clientId === null) return '';
  params.push(clientId);
  return ` AND ${col} = $${params.length}`;
}

/**
 * First row of every source, fleet-wide (coverage, not per client). min() / ORDER BY ... LIMIT 1 on the
 * leading key of each table's primary key or ts index. Labels are IST, at the source's own precision.
 * promotion_send has no ts-leading index (min(ts) over all partitions: 190-330 ms live 2026-11-08), so for the
 * hour grain it is probed inside the window only: the first day of the window (one partition), else the whole
 * window. Its `from` is therefore clamped to the window start. It is NULL for day / month.
 */
export function historyCoverSql(w: HistoryWindow): SqlQuery {
  const hour = w.grain === 'hour';
  const params: unknown[] = hour ? [iso(w.start), iso(w.end), iso(w.start + 86_400_000)] : [];
  const ps = (hi: string) => `(SELECT min(ts) FROM promotion_send WHERE ts >= $1::timestamptz AND ts < ${hi})`;
  return q(
    'history_cover',
    `SELECT
  (SELECT ${tsBucket('min(ts)', 'hour')} FROM payment_event) AS payment_event,
  (SELECT to_char(min(month), 'YYYY-MM') FROM monthly_revenue) AS monthly_revenue,
  ${hour ? tsBucket(`coalesce(${ps('$3::timestamptz')}, ${ps('$2::timestamptz')})`, 'hour') : 'NULL::text'} AS promotion_send,
  (SELECT to_char(min(day), 'YYYY-MM-DD') FROM daily_client) AS daily_client,
  (SELECT to_char(min(month), 'YYYY-MM') FROM monthly_client) AS monthly_client,
  (SELECT ${tsBucket('min(ts_hour)', 'hour')} FROM pool_snapshot) AS pool_snapshot,
  (SELECT to_char(min(day), 'YYYY-MM-DD') FROM daily_pool) AS daily_pool,
  (SELECT to_char(min(month), 'YYYY-MM') FROM monthly_pool) AS monthly_pool`,
    params,
  );
}

/** Revenue + distinct payers per bucket from payment_event_owner (rules of monitor-merge.ts toCredit). */
export function historyRevenueSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [iso(w.start), iso(w.end)];
  const pred = clientPred(clientId, params);
  return q(
    `history_revenue_${w.grain}`,
    `SELECT ${tsBucket('ts', w.grain)} AS b, coalesce(sum(owner_amount), 0) AS revenue,
  count(DISTINCT chat_id) FILTER (WHERE NOT cheat_flagged) AS payers
FROM payment_event_owner
WHERE ts >= $1::timestamptz AND ts < $2::timestamptz AND amount > 0 AND amount < 1000${pred}
GROUP BY 1`,
    params,
  );
}

/** monthly_revenue per month (fallback for months before payment_event; no ₹1,000 cap in that rollup). */
export function historyMonthlyRevenueSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [w.fromDate, w.toDate];
  const pred = clientPred(clientId, params);
  return q(
    'history_revenue_monthly',
    `SELECT ${dayBucket('month', 'month')} AS b, coalesce(sum(owner_revenue), 0) AS revenue, coalesce(sum(owner_payers), 0) AS payers
FROM monthly_revenue
WHERE month >= $1::date AND month <= $2::date${pred}
GROUP BY 1`,
    params,
  );
}

/** promotion_send per IST hour, exactly as history.sql hourly_sends (failed includes banned). count(*) only. */
export function historySendsRawSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [iso(w.start), iso(w.end)];
  const pred = clientPred(clientId, params);
  return q(
    'history_sends_hour',
    `SELECT ${tsBucket('ts', 'hour')} AS b,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE outcome IN ('failed', 'banned')) AS failed
FROM promotion_send
WHERE ts >= $1::timestamptz AND ts < $2::timestamptz${pred}
GROUP BY 1`,
    params,
  );
}

const COUNTER_SUMS = `coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(failed), 0) AS failed,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users`;

/** hourly_client per IST hour: sends (fallback before promotion_send) and tg-aut new users. */
export function historyHourlyClientSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [w.fromDate, w.toDate];
  const pred = clientPred(clientId, params);
  return q(
    'history_hourly_client',
    `SELECT to_char(day, 'YYYY-MM-DD') || 'T' || lpad(hour::text, 2, '0') AS b, ${COUNTER_SUMS}
FROM hourly_client
WHERE day >= $1::date AND day <= $2::date${pred}
GROUP BY day, hour`,
    params,
  );
}

/** daily_client per IST day or month: sends and tg-aut new users. */
export function historyDailyClientSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const g = w.grain === 'month' ? 'month' : 'day';
  const params: unknown[] = [w.fromDate, w.toDate];
  const pred = clientPred(clientId, params);
  return q(
    `history_daily_client_${g}`,
    `SELECT ${dayBucket('day', g)} AS b, ${COUNTER_SUMS}
FROM daily_client
WHERE day >= $1::date AND day <= $2::date${pred}
GROUP BY 1`,
    params,
  );
}

/** monthly_client per month (fallback for months before daily_client). */
export function historyMonthlyClientSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [w.fromDate, w.toDate];
  const pred = clientPred(clientId, params);
  return q(
    'history_monthly_client',
    `SELECT ${dayBucket('month', 'month')} AS b, ${COUNTER_SUMS}
FROM monthly_client
WHERE month >= $1::date AND month <= $2::date${pred}
GROUP BY 1`,
    params,
  );
}

/** `c` = the client predicate (' AND client_id = $n') or ''; applied inside the sums (see historyPoolSnapshotSql). */
const POOL_SUMS = (total: string, active: string, c: string) =>
  `coalesce(sum(${total}) FILTER (WHERE pool = 'b'${c}), 0) AS b_total,
  coalesce(sum(${total}) FILTER (WHERE pool = 'p'${c}), 0) AS p_total,
  coalesce(sum(${active}) FILTER (WHERE pool = 'p'${c}), 0) AS p_active`;

/**
 * pool_snapshot: hour = the sample of that hour; day / month = the last sample per (bucket, pool, client).
 * Without a client filter, every bucket with a sample returns a row; with one, the client filter is applied
 * inside the sums so a sampled bucket where the client has no row is 0 (not a missing sample).
 */
export function historyPoolSnapshotSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [iso(w.start), iso(w.end)];
  const c = clientId === null ? '' : (params.push(clientId), ` AND client_id = $${params.length}`);
  const sums = POOL_SUMS('total', 'active', c);
  const inner =
    w.grain === 'hour'
      ? `SELECT ${tsBucket('ts_hour', 'hour')} AS b, pool, client_id, total, active FROM pool_snapshot
WHERE ts_hour >= $1::timestamptz AND ts_hour < $2::timestamptz`
      : `SELECT DISTINCT ON (1, pool, client_id) ${tsBucket('ts_hour', w.grain)} AS b, pool, client_id, total, active FROM pool_snapshot
WHERE ts_hour >= $1::timestamptz AND ts_hour < $2::timestamptz
ORDER BY 1, pool, client_id, ts_hour DESC`;
  return q(`history_pool_snapshot_${w.grain}`, `SELECT b, ${sums}\nFROM (${inner}) x\nGROUP BY b`, params);
}

/** daily_pool: day = that day's last sample; month = the last day's last sample per (month, pool, client). */
export function historyDailyPoolSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const g = w.grain === 'month' ? 'month' : 'day';
  const params: unknown[] = [w.fromDate, w.toDate];
  const c = clientId === null ? '' : (params.push(clientId), ` AND client_id = $${params.length}`);
  const sums = POOL_SUMS('total_last', 'active_last', c);
  return q(
    `history_daily_pool_${g}`,
    `SELECT b, ${sums}
FROM (SELECT DISTINCT ON (1, pool, client_id) ${dayBucket('day', g)} AS b, pool, client_id, total_last, active_last FROM daily_pool
WHERE day >= $1::date AND day <= $2::date
ORDER BY 1, pool, client_id, day DESC) x
GROUP BY b`,
    params,
  );
}

/** monthly_pool per month (fallback for months before daily_pool). */
export function historyMonthlyPoolSql(w: HistoryWindow, clientId: string | null): SqlQuery {
  const params: unknown[] = [w.fromDate, w.toDate];
  const c = clientId === null ? '' : (params.push(clientId), ` AND client_id = $${params.length}`);
  const sums = POOL_SUMS('total_last', 'active_last', c);
  return q(
    'history_monthly_pool',
    `SELECT ${dayBucket('month', 'month')} AS b, ${sums}
FROM monthly_pool
WHERE month >= $1::date AND month <= $2::date
GROUP BY 1`,
    params,
  );
}

/** Every statement a range needs (all run concurrently; each one is small). */
export function historySqls(w: HistoryWindow, clientId: string | null): Record<string, SqlQuery> {
  const s: Record<string, SqlQuery> = {
    cover: historyCoverSql(w),
    revenue: historyRevenueSql(w, clientId),
    pool: historyPoolSnapshotSql(w, clientId),
  };
  // hour grain: daily_client per day is the check that a day's hourly_client rows are complete
  s.daily = historyDailyClientSql(w, clientId);
  if (w.grain === 'hour') {
    s.sendsRaw = historySendsRawSql(w, clientId);
    s.hourly = historyHourlyClientSql(w, clientId);
  } else {
    s.dailyPool = historyDailyPoolSql(w, clientId);
  }
  if (w.grain === 'month') {
    s.monthlyRevenue = historyMonthlyRevenueSql(w, clientId);
    s.monthly = historyMonthlyClientSql(w, clientId);
    s.monthlyPool = historyMonthlyPoolSql(w, clientId);
  }
  return s;
}

// ---------------------------------------------------------------- assembly

export type HistoryRows = Partial<Record<keyof ReturnType<typeof historySqls> | string, any[]>>;

export interface HistorySeries {
  /** one value per bucket; null = no source covers that bucket (or no pool sample) */
  values: Array<number | null>;
  /** source table(s) actually read for this window, coarse to fine, '+'-joined */
  source: string;
  /** IST label of the first data any source in the chain holds (null = none yet) */
  from: string | null;
}

export const HISTORY_SERIES = [
  'revenue',
  'payers',
  'sent',
  'delivered',
  'failed',
  'newUsers',
  'poolBufferTotal',
  'poolPromoteTotal',
  'poolPromoteActive',
] as const;
export type HistorySeriesKey = (typeof HISTORY_SERIES)[number];

export interface HistoryResponse {
  range: HistoryRange;
  grain: HistoryGrain;
  tz: 'Asia/Kolkata';
  clientId: string | null;
  from: string;
  to: string;
  buckets: string[];
  /** the last bucket runs up to now */
  partialLast: true;
  series: Record<HistorySeriesKey, HistorySeries>;
  notes: string[];
  generatedAt: string;
  timingsMs: Record<string, number>;
  /** filled by the snapshot layer (withSnapshotCache): snapshot state, source, age */
  cache: CacheInfo;
}

interface Link {
  source: string;
  first: string | null | undefined;
  rows: any[] | undefined;
  col: string;
  /** gauge: a covered bucket without a row is null (missing sample), not 0 */
  gauge?: boolean;
  /** when set, only buckets of these IST days are covered (hour buckets of verified-complete days) */
  days?: Set<string>;
}

/** a bucket at or after `first` (labels compare as strings; a coarser first covers its whole period) */
const covers = (b: string, first: string) => b >= first.slice(0, Math.min(first.length, b.length));

/**
 * Sort key of a first label: a coarser label sorts after every finer label inside its period, so a month
 * source starting '2026-10' loses to a day source starting '2026-10-04' (same data, more precise start).
 */
const startKey = (f: string) => (f.length === 7 ? `${f}-99T99` : f.length === 10 ? `${f}T99` : f);

/** One series over the buckets from a finest-first chain of sources. */
export function chainSeries(buckets: string[], chain: Link[]): HistorySeries {
  const maps = chain.map((l) => new Map((l.rows ?? []).map((r) => [String(r.b), r[l.col]])));
  const used = new Set<number>();
  const values = buckets.map((b) => {
    for (let i = 0; i < chain.length; i++) {
      const first = chain[i].first;
      if (!first || !covers(b, first)) continue;
      if (chain[i].days && !chain[i].days!.has(b.slice(0, 10))) continue;
      used.add(i);
      const v = maps[i].get(b);
      if (v === undefined || v === null) return chain[i].gauge ? null : 0;
      return num(v);
    }
    return null;
  });
  const firsts = chain.map((l) => l.first).filter((f): f is string => !!f);
  const from = firsts.length ? firsts.reduce((a, f) => (startKey(f) < startKey(a) ? f : a)) : null;
  const order = chain.map((_, i) => i).reverse();
  const names = order.filter((i) => used.has(i)).map((i) => chain[i].source);
  return { values, source: names.length ? names.join('+') : chain[0].source, from };
}

/** Builds the response from the rows of historySqls (missing statements = no rows). */
export function assembleHistory(
  w: HistoryWindow,
  clientId: string | null,
  rows: HistoryRows,
  now: number,
  timings: Record<string, number> = {},
): HistoryResponse {
  const cover = (rows.cover ?? [])[0] ?? {};
  const B = w.buckets;
  // monthly_revenue payers are per client x persona (a chat paying two personas counts twice), so the
  // fallback serves revenue only; payers before payment_event stay null.
  const revenueChain = (col: string): Link[] => [
    { source: 'payment_event', first: cover.payment_event, rows: rows.revenue, col },
    ...(w.grain === 'month' && col === 'revenue'
      ? [{ source: 'monthly_revenue', first: cover.monthly_revenue, rows: rows.monthlyRevenue, col }]
      : []),
  ];
  /**
   * hourly_client is written by each process from its next natural restart (and repaired for sends only by
   * history.sql, days <= today - 8), so an hour of it is used only on a closed IST day whose hours add up
   * to daily_client for that column (same client filter). Other days are null, never a partial count.
   */
  const verifiedDays = (col: string): { days: Set<string>; first: string | null } => {
    const days = new Set<string>();
    if (w.grain !== 'hour') return { days, first: null };
    const hourly = new Map<string, number>();
    for (const r of rows.hourly ?? []) hourly.set(String(r.b).slice(0, 10), (hourly.get(String(r.b).slice(0, 10)) ?? 0) + num(r[col]));
    const daily = new Map((rows.daily ?? []).map((r) => [String(r.b), num(r[col])]));
    for (const d of hourly.keys()) {
      if (d >= w.toDate || !cover.daily_client || d < cover.daily_client) continue;
      if (hourly.get(d) === (daily.get(d) ?? 0)) days.add(d);
    }
    const first = [...days].sort()[0];
    return { days, first: first ? `${first}T00` : null };
  };
  const hourlyLink = (col: string): Link => {
    const v = verifiedDays(col);
    return { source: 'hourly_client', first: v.first, rows: rows.hourly, col, days: v.days };
  };
  const counterChain = (col: string, newUsers = false): Link[] =>
    w.grain === 'hour'
      ? newUsers
        ? [hourlyLink(col)]
        : [{ source: 'promotion_send', first: cover.promotion_send, rows: rows.sendsRaw, col }, hourlyLink(col)]
      : [
          { source: 'daily_client', first: cover.daily_client, rows: rows.daily, col },
          ...(w.grain === 'month' ? [{ source: 'monthly_client', first: cover.monthly_client, rows: rows.monthly, col }] : []),
        ];
  const poolChain = (col: string): Link[] => [
    { source: 'pool_snapshot', first: cover.pool_snapshot, rows: rows.pool, col, gauge: true },
    ...(w.grain !== 'hour' ? [{ source: 'daily_pool', first: cover.daily_pool, rows: rows.dailyPool, col, gauge: true }] : []),
    ...(w.grain === 'month' ? [{ source: 'monthly_pool', first: cover.monthly_pool, rows: rows.monthlyPool, col, gauge: true }] : []),
  ];
  const series: Record<HistorySeriesKey, HistorySeries> = {
    revenue: chainSeries(B, revenueChain('revenue')),
    payers: chainSeries(B, revenueChain('payers')),
    sent: chainSeries(B, counterChain('sent')),
    delivered: chainSeries(B, counterChain('delivered')),
    failed: chainSeries(B, counterChain('failed')),
    newUsers: chainSeries(B, counterChain('new_users', true)),
    poolBufferTotal: chainSeries(B, poolChain('b_total')),
    poolPromoteTotal: chainSeries(B, poolChain('p_total')),
    poolPromoteActive: chainSeries(B, poolChain('p_active')),
  };
  const notes = [`payers are distinct per ${w.grain}; not summable across ${w.grain}s`];
  if (w.grain === 'hour') notes.push('hourly new users only on closed days whose hours add up to daily_client');
  if (series.revenue.source.includes('monthly_revenue')) notes.push('monthly_revenue months include credits of ₹1,000 or more');
  return {
    range: w.range,
    grain: w.grain,
    tz: 'Asia/Kolkata',
    clientId,
    from: w.fromDate,
    to: w.toDate,
    buckets: B,
    partialLast: true,
    series,
    notes,
    generatedAt: new Date(now).toISOString(),
    timingsMs: timings,
    cache: { history: null, today: null, ageSec: null, historyAgeSec: null },
  };
}
