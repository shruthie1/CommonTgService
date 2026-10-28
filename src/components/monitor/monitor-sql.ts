/**
 * Read-only SQL for the monitor endpoints (Postgres analytics store). Every query is a parameterised
 * SELECT; instants are passed as ISO strings ($n::timestamptz), IST dates as 'YYYY-MM-DD' ($n::date).
 *
 * Definitions (scratchpad metrics.md, 2026-10-28):
 *  - revenue = payment_event_owner.owner_amount with amount < 1000 (owner rule 8: a receipt of
 *    ₹1,000 or more is never credited; the view does not apply it). gross = every credit.
 *  - payers = distinct chats with a clean (not cheat-flagged) credit under ₹1,000.
 *  - daily_client.revenue is always 0 and active_users is an event count: never read.
 *  - sends over whole days come from daily_client (sent = delivered + failed, failed ⊇ banned).
 *    promotion_send (raw, 30 d retention, no client index) only for ≤ 2-day hourly and per-client
 *    channels; never COUNT(DISTINCT) on it.
 */
import { Window } from './monitor-time';

export interface SqlQuery {
  name: string;
  sql: string;
  params: unknown[];
}

const IST = `(ts AT TIME ZONE 'Asia/Kolkata')`;
const iso = (ms: number) => new Date(ms).toISOString();
const CLEAN_CREDIT = `amount < 1000 AND cheat_flagged IS NOT TRUE`;

/** Fleet revenue/payers per client plus a fleet total row (GROUPING SETS keeps fleet payers distinct). */
export function fleetRevenueSql(cur: Window, prev: Window): SqlQuery {
  const c = `ts >= $1::timestamptz AND ts < $2::timestamptz`;
  const p = `ts >= $3::timestamptz AND ts < $4::timestamptz`;
  return {
    name: 'fleet.revenue',
    sql: `SELECT client_id, GROUPING(client_id) AS is_total,
  coalesce(sum(owner_amount) FILTER (WHERE ${c} AND amount < 1000), 0) AS revenue,
  coalesce(sum(amount) FILTER (WHERE ${c}), 0) AS gross,
  count(DISTINCT chat_id) FILTER (WHERE ${c} AND ${CLEAN_CREDIT}) AS payers,
  coalesce(sum(owner_amount) FILTER (WHERE ${p} AND amount < 1000), 0) AS prev_revenue,
  coalesce(sum(amount) FILTER (WHERE ${p}), 0) AS prev_gross,
  count(DISTINCT chat_id) FILTER (WHERE ${p} AND ${CLEAN_CREDIT}) AS prev_payers
FROM payment_event_owner
WHERE amount > 0 AND ((${c}) OR (${p}))
GROUP BY GROUPING SETS ((client_id), ())`,
    params: [iso(cur.start), iso(cur.end), iso(prev.start), iso(prev.end)],
  };
}

/** Daily owner revenue per client from `fromDate` (IST) on, for the 7-day sparkline. */
export function fleetSparkSql(fromDayStart: number): SqlQuery {
  return {
    name: 'fleet.spark',
    sql: `SELECT client_id, ${IST}::date::text AS d, coalesce(sum(owner_amount), 0) AS revenue
FROM payment_event_owner
WHERE amount > 0 AND amount < 1000 AND ts >= $1::timestamptz
GROUP BY 1, 2`,
    params: [iso(fromDayStart)],
  };
}

/** Whole-day sends + tg-aut new users per client for the current and previous date ranges. */
export function fleetDailyClientSql(from: string, to: string, prevFrom: string, prevTo: string): SqlQuery {
  const c = `day BETWEEN $1::date AND $2::date`;
  const p = `day BETWEEN $3::date AND $4::date`;
  return {
    name: 'fleet.daily_client',
    sql: `SELECT client_id,
  coalesce(sum(sent) FILTER (WHERE ${c}), 0) AS sent,
  coalesce(sum(delivered) FILTER (WHERE ${c}), 0) AS delivered,
  coalesce(sum(banned) FILTER (WHERE ${c}), 0) AS banned,
  coalesce(sum(new_users) FILTER (WHERE ${c} AND namespace = 'tg-aut'), 0) AS new_users,
  coalesce(sum(sent) FILTER (WHERE ${p}), 0) AS prev_sent,
  coalesce(sum(delivered) FILTER (WHERE ${p}), 0) AS prev_delivered,
  coalesce(sum(banned) FILTER (WHERE ${p}), 0) AS prev_banned,
  coalesce(sum(new_users) FILTER (WHERE ${p} AND namespace = 'tg-aut'), 0) AS prev_new_users
FROM daily_client
WHERE day BETWEEN $3::date AND $2::date
GROUP BY client_id`,
    params: [from, to, prevFrom, prevTo],
  };
}

/** Today vs yesterday-up-to-the-same-time sends from raw promotion_send (≤ 2 days scanned). */
export function fleetSendsIntradaySql(cur: Window, prev: Window): SqlQuery {
  const c = `ts >= $1::timestamptz`;
  const p = `ts < $2::timestamptz`;
  return {
    name: 'fleet.promotion_send_intraday',
    sql: `SELECT client_id,
  count(*) FILTER (WHERE ${c} AND outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE ${c} AND outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE ${c} AND outcome = 'banned') AS banned,
  count(*) FILTER (WHERE ${p} AND outcome <> 'deleted') AS prev_sent,
  count(*) FILTER (WHERE ${p} AND outcome = 'delivered') AS prev_delivered,
  count(*) FILTER (WHERE ${p} AND outcome = 'banned') AS prev_banned
FROM promotion_send
WHERE ts >= $3::timestamptz AND ts < $4::timestamptz AND (${c} OR ${p})
GROUP BY client_id`,
    params: [iso(cur.start), iso(prev.end), iso(prev.start), iso(cur.end)],
  };
}

/** Attributed promo DMs (conversion_event kind='dm') per client + fleet total. */
export function fleetDmsSql(cur: Window, prev: Window): SqlQuery {
  const c = `ts >= $1::timestamptz AND ts < $2::timestamptz`;
  const p = `ts >= $3::timestamptz AND ts < $4::timestamptz`;
  return {
    name: 'fleet.dms',
    sql: `SELECT client_id, GROUPING(client_id) AS is_total,
  count(DISTINCT conversion_id) FILTER (WHERE ${c}) AS dms,
  count(DISTINCT conversion_id) FILTER (WHERE ${p}) AS prev_dms
FROM conversion_event
WHERE kind = 'dm' AND ((${c}) OR (${p}))
GROUP BY GROUPING SETS ((client_id), ())`,
    params: [iso(cur.start), iso(cur.end), iso(prev.start), iso(prev.end)],
  };
}

/**
 * One client's credits since `start` (raw rows; ~10/day/client). Daily, hourly, amount, hour-of-day
 * and repeat distributions are computed from these in memory. chat_id never leaves the service.
 */
export function clientPaymentsSql(clientId: string, start: number): SqlQuery {
  return {
    name: 'client.payments',
    sql: `SELECT ts, chat_id, amount, owner_amount, cheat_flagged
FROM payment_event_owner
WHERE client_id = $1 AND ts >= $2::timestamptz AND amount > 0`,
    params: [clientId, iso(start)],
  };
}

export function clientDailyClientSql(clientId: string, from: string): SqlQuery {
  return {
    name: 'client.daily_client',
    sql: `SELECT day::text AS d,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users
FROM daily_client
WHERE client_id = $1 AND day >= $2::date
GROUP BY day`,
    params: [clientId, from],
  };
}

export function clientDmsDailySql(clientId: string, start: number): SqlQuery {
  return {
    name: 'client.dms_daily',
    sql: `SELECT ${IST}::date::text AS d, count(DISTINCT conversion_id) AS dms
FROM conversion_event
WHERE kind = 'dm' AND client_id = $1 AND ts >= $2::timestamptz
GROUP BY 1`,
    params: [clientId, iso(start)],
  };
}

/** Hourly sends today + yesterday for one client (raw promotion_send, 2 days). */
export function clientSendsHourlySql(clientId: string, start: number): SqlQuery {
  return {
    name: 'client.promotion_send_hourly',
    sql: `SELECT ${IST}::date::text AS d, extract(hour FROM ${IST})::int AS h,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent
FROM promotion_send
WHERE client_id = $1 AND ts >= $2::timestamptz
GROUP BY 1, 2`,
    params: [clientId, iso(start)],
  };
}

/**
 * Per-mobile totals. newUsers = tg-aut first contacts on that account; dms = first DMs to that
 * account when it is a promote account (namespace promote-clients new_users).
 */
export function clientMobilesSql(clientId: string, from: string): SqlQuery {
  return {
    name: 'client.daily_mobile',
    sql: `SELECT mobile,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'promote-clients'), 0) AS dms,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  min(day)::text AS first_day, max(day)::text AS last_day
FROM daily_mobile
WHERE client_id = $1 AND day >= $2::date
GROUP BY mobile
ORDER BY sent DESC`,
    params: [clientId, from],
  };
}

/**
 * Top 20 channels for one client, ranked by attributed DMs (conversion_event; per-client from
 * 2026-10-26). Sends are then read only for those channels through promotion_send's
 * (channel_id, ts) index: the one-pass FULL JOIN over every partition took 6.3 s cold / >10 s
 * timeout for 30 d on prod (2026-10-28), this pair 0.3 s + 0.8 s cold.
 */
export function clientTopDmChannelsSql(clientId: string, start: number): SqlQuery {
  return {
    name: 'client.channels_top_dms',
    sql: `SELECT channel_id, count(DISTINCT conversion_id) AS dms
FROM conversion_event
WHERE kind = 'dm' AND client_id = $1 AND ts >= $2::timestamptz AND channel_id IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 20`,
    params: [clientId, iso(start)],
  };
}

export function clientChannelSendsSql(clientId: string, start: number, channelIds: string[]): SqlQuery {
  return {
    name: 'client.channels_sends',
    sql: `SELECT channel_id, count(*) FILTER (WHERE outcome <> 'deleted') AS sent
FROM promotion_send
WHERE channel_id = ANY($3::text[]) AND client_id = $1 AND ts >= $2::timestamptz
GROUP BY 1`,
    params: [clientId, iso(start), channelIds],
  };
}
