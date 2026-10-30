/**
 * Read-only SQL for the monitor endpoints (Postgres analytics store). Every query is a parameterised
 * SELECT; instants are passed as ISO strings ($n::timestamptz), IST dates as 'YYYY-MM-DD' ($n::date).
 * Each statement starts with a `/* monitor.<name> *\/` comment (visible in pg_stat_activity).
 *
 * Shape (2026-10-28 lightweight rework): the work of every response is split into
 *  - HISTORY: closed IST days (before today). Fleet-wide where possible, so one cached result serves
 *    every page (fleet 7d/30d, fleet detail, every client page filter it in memory). Cached until the
 *    IST day rolls over, refreshed in the background every 10 min (late sink rows, 00:35 IST rollup).
 *  - TODAY: [IST today 00:00, now). Small, cached 60 s, refreshed in the background.
 *
 * Definitions (scratchpad metrics.md, 2026-10-28):
 *  - revenue = payment_event_owner.owner_amount with amount < 1000 (owner rule 8). Computed in memory
 *    from the raw credit rows (~250/day fleet-wide), so payers stay distinct over any window.
 *  - daily_client.revenue is always 0 and active_users is an event count: never read.
 *  - sends over whole days come from daily_client; promotion_send (raw, 30 d, no client index) only
 *    for today, yesterday's hours and per-client channel sends; never COUNT(DISTINCT) on it.
 *  - DMs: conversion_event kind='dm' rows are one per conversion (prod 2026-10-28: 37,937 rows = Σ
 *    per-channel distinct, 34,227 = fleet distinct = Σ per-day distinct = Σ per-client distinct over
 *    30 d), so per-day counts add up to any window exactly. daily_channel.dms equals per-channel
 *    distinct per day (7 closed days, 4,535 cells, 0 differences).
 */
import { Window } from './monitor-time';

export interface SqlQuery {
  name: string;
  sql: string;
  params: unknown[];
}

const IST = `(ts AT TIME ZONE 'Asia/Kolkata')`;
const iso = (ms: number) => new Date(ms).toISOString();

function q(name: string, sql: string, params: unknown[]): SqlQuery {
  return { name, sql: `/* monitor.${name} */ ${sql}`, params };
}

/**
 * Raw credit rows in [start, end) (end omitted = up to now), every client. Revenue, payers, spark and
 * the client-page distributions are computed from these in memory. chat_id never leaves the service.
 */
export function paymentRowsSql(name: 'pay_hist' | 'pay_today', start: number, end?: number): SqlQuery {
  const params: unknown[] = [iso(start)];
  let range = 'ts >= $1::timestamptz';
  if (end !== undefined) {
    params.push(iso(end));
    range += ' AND ts < $2::timestamptz';
  }
  return q(
    name,
    `SELECT client_id, ts, chat_id, amount, owner_amount, cheat_flagged
FROM payment_event_owner
WHERE ${range} AND amount > 0`,
    params,
  );
}

/**
 * Reaction outcome counters on daily_client / daily_mobile (tg-reactions recordReaction, from 2026-09-18
 * on daily_client and 2026-10-10 on daily_mobile). Added to the existing daily_client and promotions
 * statements so /monitor/reactions needs no statement of its own.
 */
export const REACTION_COLUMNS = ['reactions_success', 'reactions_restricted', 'reactions_failed', 'reactions_floods'] as const;
const REACTION_SUMS = REACTION_COLUMNS.map((c) => `, coalesce(sum(${c}), 0) AS ${c}`).join('');

/**
 * daily_client per (IST day, client, namespace) for from..to inclusive: sends + tg-aut new users.
 * Grouped by namespace (2026-10-29) so the family split is exact; summing the namespaces gives the
 * former per-(day, client) row. `ns_new_users` = new_users of that namespace (promote-clients: first DMs
 * to a promote account).
 */
export function dailyClientSql(name: 'dc_hist' | 'dc_today', from: string, to: string): SqlQuery {
  return q(
    name,
    `SELECT day::text AS d, client_id, namespace,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  coalesce(sum(failed), 0) AS failed,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users,
  coalesce(sum(new_users), 0) AS ns_new_users${REACTION_SUMS}
FROM daily_client
WHERE day BETWEEN $1::date AND $2::date
GROUP BY day, client_id, namespace`,
    [from, to],
  );
}

/**
 * Route counters written by promote-clients into daily_client / daily_mobile (tg-platform P4, 2026-10-29;
 * routed_users = distinct users first routed that IST day per mobile, tg-platform 2026-10-30).
 * Each column is detected on its own, so routed_users may be absent while the 10-29 four are present.
 * Read only when present (feature-detected through information_schema), so the CMS works before and
 * after the columns ship.
 */
export const ROUTED_COLUMNS = ['routes_sent', 'routed_reached', 'route_calls_ok', 'route_calls_failed', 'routed_users'] as const;

function routedSums(cols: readonly string[]): string {
  const ok = cols.filter((c) => (ROUTED_COLUMNS as readonly string[]).includes(c));
  return ok.map((c) => `, coalesce(sum(${c}), 0) AS ${c}`).join('');
}

/**
 * Route counters per (IST day, client) over from..to inclusive, promote-clients rows only (primary-key
 * range on day). Run only for the columns routedColumnsSql found; never with an empty list.
 */
export function routedDailySql(name: 'routed_hist' | 'routed_today', from: string, to: string, cols: readonly string[]): SqlQuery {
  return q(
    name,
    `SELECT day::text AS d, client_id${routedSums(cols)}
FROM daily_client
WHERE day BETWEEN $1::date AND $2::date AND namespace = 'promote-clients'
GROUP BY day, client_id`,
    [from, to],
  );
}

/** Which ROUTED_COLUMNS exist on daily_client and on daily_mobile (catalog read, no table scan). */
export function routedColumnsSql(): SqlQuery {
  return q(
    'routed_columns',
    `SELECT table_name::text AS t, column_name::text AS c
FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name IN ('daily_client', 'daily_mobile') AND column_name = ANY($1::text[])`,
    [[...ROUTED_COLUMNS]],
  );
}

/**
 * Attributed DMs per (IST day, client) in [start, end); client_id NULL rows (before 2026-10-26) included.
 * GROUPING SETS (2026-10-29): rows with g = 1 are the former per-(day, client) distinct counts (used for
 * every merged number, unchanged); rows with g = 0 split them by service ('t' tg-aut, 'p' promote-clients
 * routed DMs, NULL before 2026-10-25) for the family view.
 */
export function dmsByDaySql(start: number, end: number): SqlQuery {
  return q(
    'dms_hist',
    `SELECT ${IST}::date::text AS d, client_id, service, GROUPING(service) AS g, count(DISTINCT conversion_id) AS dms
FROM conversion_event
WHERE kind = 'dm' AND ts >= $1::timestamptz AND ts < $2::timestamptz
GROUP BY GROUPING SETS ((1, 2), (1, 2, 3))`,
    [iso(start), iso(end)],
  );
}

/**
 * Raw attributed-DM rows in [start, end) (end omitted = up to now): yesterday (to cut the
 * yesterday-same-time window in memory) and today (fleet dms, today's daily row, today's channel DMs).
 * ~1.5k rows/day. conversion_id never leaves the service.
 */
export function dmRowsSql(name: 'dm_rows_yday' | 'dm_rows_today', start: number, end?: number): SqlQuery {
  const params: unknown[] = [iso(start)];
  let range = 'ts >= $1::timestamptz';
  if (end !== undefined) {
    params.push(iso(end));
    range += ' AND ts < $2::timestamptz';
  }
  return q(
    name,
    `SELECT client_id, channel_id, conversion_id, ts, service
FROM conversion_event
WHERE kind = 'dm' AND ${range}`,
    params,
  );
}

/**
 * promotion_send live: today per (client, IST hour) plus yesterday up to `cut` (= now - 24 h) per
 * (client, IST hour). One statement scans the two newest partitions; count(*) only.
 */
export function sendsLiveSql(today: Window, cut: number): SqlQuery {
  return q(
    'sends_live',
    `SELECT client_id, ts >= $1::timestamptz AS today, extract(hour FROM ${IST})::int AS h, service,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE outcome = 'banned') AS banned,
  count(*) FILTER (WHERE outcome = 'failed') AS failed
FROM promotion_send
WHERE ts >= $2::timestamptz AND ts < $3::timestamptz AND (ts >= $1::timestamptz OR ts < $4::timestamptz)
GROUP BY 1, 2, 3, 4`,
    [iso(today.start), iso(today.start - 86_400_000), iso(today.end), iso(cut)],
  );
}

/** Yesterday's sends per (client, IST hour) for hourly.yesterday (one closed partition, count(*) only). */
export function sendsHourlySql(day: Window): SqlQuery {
  return q(
    'sends_yday_hourly',
    `SELECT client_id, extract(hour FROM ${IST})::int AS h, count(*) FILTER (WHERE outcome <> 'deleted') AS sent
FROM promotion_send
WHERE ts >= $1::timestamptz AND ts < $2::timestamptz
GROUP BY 1, 2`,
    [iso(day.start), iso(day.end)],
  );
}

/**
 * daily_mobile per (mobile, client, namespace) over from..to inclusive (namespace added 2026-10-29 for
 * mobiles[].family; the merge sums namespaces). Mobiles are masked before leaving the service.
 */
export function mobilesSql(name: 'mobiles_hist' | 'mobiles_today', from: string, to: string): SqlQuery {
  return q(
    name,
    `SELECT mobile, client_id, namespace,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'tg-aut'), 0) AS new_users,
  coalesce(sum(new_users) FILTER (WHERE namespace = 'promote-clients'), 0) AS dms,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  min(day)::text AS first_day, max(day)::text AS last_day
FROM daily_mobile
WHERE day BETWEEN $1::date AND $2::date
GROUP BY mobile, client_id, namespace`,
    [from, to],
  );
}

/**
 * The closed IST days `from` .. day before `today`, split at daily_channel's last rolled day: days up
 * to it come from the rollup, later closed days (only between 00:00 and the 00:35 IST rollup, or if
 * the rollup is late) from the raw table. The raw branch sits behind a one-time filter on the
 * rollup's max(day), so it is never executed when the rollup is current.
 */
const ROLLED = `rolled AS (SELECT coalesce(max(day), DATE '1970-01-01') AS d FROM daily_channel WHERE day < $2::date)`;
const RAW_FROM = `greatest($3::timestamptz, (((SELECT d FROM rolled) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))`;
const RAW_GATE = `(SELECT d FROM rolled) < $2::date - 1`;

/**
 * Attributed DMs per channel over closed days. Fleet: daily_channel (+ raw for unrolled days). One
 * client: conversion_event (daily_channel has no client column).
 */
export function channelDmsHistSql(clientId: string | null, from: string, today: string, start: number, today0: number): SqlQuery {
  if (clientId === null) {
    return q(
      'channels_dms_hist',
      `WITH ${ROLLED}
SELECT channel_id, sum(dms) AS dms, (SELECT d FROM rolled)::text AS rolled_to
FROM (
  SELECT channel_id, dms FROM daily_channel
  WHERE day >= $1::date AND day <= (SELECT d FROM rolled) AND dms > 0
  UNION ALL
  SELECT channel_id, count(DISTINCT conversion_id) FROM conversion_event
  WHERE ${RAW_GATE} AND kind = 'dm' AND ts >= ${RAW_FROM} AND ts < $4::timestamptz AND channel_id IS NOT NULL
  GROUP BY 1
) x
GROUP BY 1`,
      [from, today, iso(start), iso(today0)],
    );
  }
  return q(
    'client_channels_dms_hist',
    `SELECT channel_id, count(DISTINCT conversion_id) AS dms
FROM conversion_event
WHERE kind = 'dm' AND client_id = $1 AND ts >= $2::timestamptz AND ts < $3::timestamptz AND channel_id IS NOT NULL
GROUP BY 1`,
    [clientId, iso(start), iso(today0)],
  );
}

/**
 * Sends over closed days for a set of channels. Fleet: daily_channel (+ promotion_send by channel
 * index for unrolled days). One client: promotion_send through its (channel_id, ts) index.
 */
export function channelSendsHistSql(clientId: string | null, ids: string[], from: string, today: string, start: number, today0: number): SqlQuery {
  if (clientId === null) {
    return q(
      'channels_sends_hist',
      `WITH ${ROLLED}
SELECT channel_id, sum(sent)::bigint AS sent, (SELECT d FROM rolled)::text AS rolled_to
FROM (
  SELECT channel_id, sent FROM daily_channel
  WHERE channel_id = ANY($5::text[]) AND day >= $1::date AND day <= (SELECT d FROM rolled)
  UNION ALL
  SELECT channel_id, count(*) FILTER (WHERE outcome <> 'deleted') FROM promotion_send
  WHERE ${RAW_GATE} AND channel_id = ANY($5::text[]) AND ts >= ${RAW_FROM} AND ts < $4::timestamptz
  GROUP BY 1
) x
GROUP BY 1`,
      [from, today, iso(start), iso(today0), ids],
    );
  }
  return q(
    'client_channels_sends_hist',
    `SELECT channel_id, count(*) FILTER (WHERE outcome <> 'deleted') AS sent
FROM promotion_send
WHERE channel_id = ANY($2::text[]) AND client_id = $1 AND ts >= $3::timestamptz AND ts < $4::timestamptz
GROUP BY 1`,
    [clientId, ids, iso(start), iso(today0)],
  );
}

/** Today's sends for a set of channels (promotion_send channel index, today's partition only). */
export function channelSendsTodaySql(clientId: string | null, ids: string[], today0: number): SqlQuery {
  const params: unknown[] = [ids, iso(today0)];
  let client = '';
  if (clientId !== null) {
    params.push(clientId);
    client = ' AND client_id = $3';
  }
  return q(
    clientId === null ? 'channels_sends_today' : 'client_channels_sends_today',
    `SELECT channel_id, count(*) FILTER (WHERE outcome <> 'deleted') AS sent
FROM promotion_send
WHERE channel_id = ANY($1::text[]) AND ts >= $2::timestamptz${client}
GROUP BY 1`,
    params,
  );
}

/**
 * Paid chats of one IST day (GET /monitor/paid-chats): ONE row per (client_id, chat_id) credited in
 * [istDayStart(date), istDayStart(date + 1)). payment_event has a row only per credit, so a re-sent
 * screenshot that was not credited never adds a row or amount. A chat belongs to one persona per
 * client, so min(persona_id) only carries it. Fleet-wide (~250 rows/day); clientId filters in memory.
 */
export function paidChatsSql(dayStart: number, dayEnd: number): SqlQuery {
  return q(
    'paid_chats',
    `SELECT client_id, chat_id, min(persona_id) AS persona_id,
  count(*)::int AS credits, sum(amount)::bigint AS amount, sum(owner_amount)::bigint AS owner_amount,
  bool_or(cheat_flagged) AS cheat_flagged, min(ts) AS first_at, max(ts) AS last_at
FROM payment_event_owner
WHERE ts >= $1::timestamptz AND ts < $2::timestamptz AND amount > 0
GROUP BY client_id, chat_id
ORDER BY max(ts) DESC`,
    [iso(dayStart), iso(dayEnd)],
  );
}

// ---------------------------------------------------------------- promotions + funnel (2026-10-29)

/**
 * Promotion sends of one intraday window per (current?, service, client, mobile, error_type), current =
 * [curStart, end), previous = [prevStart, prevEnd) (prevEnd <= curStart). One scan of the partitions the
 * range covers (2 for today, 3 for 24h); count(*) only. error_type is NULL on non-failed rows, so the
 * failed rows carry the per-mobile error mix. max(ts) = last send.
 */
export function promoSendsSql(cur: Window, prev: Window): SqlQuery {
  return q(
    'promo_sends',
    `SELECT ts >= $1::timestamptz AS cur, service, client_id, mobile, error_type,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE outcome = 'banned') AS banned,
  count(*) FILTER (WHERE outcome = 'failed') AS failed,
  max(ts) FILTER (WHERE outcome <> 'deleted') AS last_ts
FROM promotion_send
WHERE ts >= $2::timestamptz AND ts < $3::timestamptz AND (ts >= $1::timestamptz OR ts < $4::timestamptz)
GROUP BY 1, 2, 3, 4, 5`,
    [iso(cur.start), iso(prev.start), iso(cur.end), iso(prev.end)],
  );
}

/**
 * daily_mobile over two closed-day ranges in one statement (primary-key range on day): per (current?,
 * namespace, client, mobile). `cur` = day >= curFrom. Profile = the latest non-null one.
 */
export function promoMobilesHistSql(prevFrom: string, curFrom: string, to: string, routed: readonly string[] = []): SqlQuery {
  return q(
    'promo_mobiles_hist',
    `SELECT day >= $2::date AS cur, namespace, client_id, mobile, max(profile) AS profile,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  coalesce(sum(failed), 0) AS failed, coalesce(sum(new_users), 0) AS new_users, max(day)::text AS last_day${REACTION_SUMS}${routedSums(routed)}
FROM daily_mobile
WHERE day BETWEEN $1::date AND $3::date
GROUP BY 1, 2, 3, 4`,
    [prevFrom, curFrom, to],
  );
}

/** Today's daily_mobile rows (profile, promote first DMs and route counters per mobile). */
export function promoMobilesTodaySql(today: string, routed: readonly string[] = []): SqlQuery {
  return q(
    'promo_mobiles_today',
    `SELECT namespace, client_id, mobile, max(profile) AS profile, coalesce(sum(new_users), 0) AS new_users${REACTION_SUMS}${routedSums(routed)}
FROM daily_mobile
WHERE day = $1::date
GROUP BY 1, 2, 3`,
    [today],
  );
}

/**
 * Origin of the chats that paid since `payFrom`: the first attributed DM conversion of the same
 * (chat, client) since `dmFrom` and its service ('t' direct tg-aut promotion, 'p' routed by a promote
 * account). payment_event's ts index bounds the payers; conversion_event has no chat index, so its
 * scan is the dm rows since dmFrom (same rows dms_hist reads). Chat ids never leave the service.
 */
export function paidOriginSql(dmFrom: number, payFrom: number): SqlQuery {
  return q(
    'paid_origin',
    `SELECT DISTINCT ON (c.chat_id, c.client_id) c.chat_id, c.client_id, c.service
FROM conversion_event c
WHERE c.kind = 'dm' AND c.ts >= $1::timestamptz AND c.client_id IS NOT NULL
  AND (c.chat_id, c.client_id) IN (SELECT chat_id, client_id FROM payment_event WHERE ts >= $2::timestamptz AND amount > 0)
ORDER BY c.chat_id, c.client_id, c.ts`,
    [iso(dmFrom), iso(payFrom)],
  );
}
