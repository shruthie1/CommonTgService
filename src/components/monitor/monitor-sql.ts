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
 *  - revenue = payment_event_owner.owner_amount with amount < 1000 (owner rule 8); owner_amount is 0 for
 *    every payment of an operator-marked fake payer (payment_event.is_fake, 2026-11-02; no longer the cheatCount score). Computed in memory
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
 * `failed` = outcome IN ('failed','banned') = sent - delivered, the same definition as daily_client /
 * daily_mobile.failed (the sink counts a banned send in both), so today + closed days add up (owner
 * 2026-11-08, docs/design/2026-11-08-analytics-cleanup.md B). `banned` stays its own number.
 */
export function sendsLiveSql(today: Window, cut: number): SqlQuery {
  return q(
    'sends_live',
    `SELECT client_id, ts >= $1::timestamptz AS today, extract(hour FROM ${IST})::int AS h, service,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE outcome = 'banned') AS banned,
  count(*) FILTER (WHERE outcome IN ('failed', 'banned')) AS failed
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

/** LIKE pattern for a literal substring: `\`, `%` and `_` escaped (backslash is Postgres' default LIKE escape). */
export function likeContains(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Distinct chat ids credited since `from` (GET /monitor/paid-chats/search): the userData username
 * lookup is restricted to these ids (chatId_Profile index prefix), because userData has no username
 * index and an unanchored regex over it would scan the whole collection.
 */
export function paidChatIdsSql(from: number): SqlQuery {
  return q(
    'paid_chat_ids',
    `SELECT DISTINCT chat_id FROM payment_event_owner WHERE ts >= $1::timestamptz AND amount > 0`,
    [iso(from)],
  );
}

/**
 * Paid-chat search across every day and client (GET /monitor/paid-chats/search): ONE row per
 * (client_id, chat_id, IST day), the same row paidChatsSql builds for one day, plus `day`. Matches a
 * case-insensitive substring (`pattern` from likeContains) of chat_id, client_id or persona_id, or a chat
 * whose username matched in Mongo (`chatIds`). `exact` (all-digit query, else null) ranks that chat id
 * first; then newest last credit. LIMIT `limit` (caller passes its limit + 1 to detect truncation).
 * Cost: the ts range covers the whole ledger since 2026-10-04 (~250 grouped rows/day), so this is one
 * scan of payment_event_owner; no substring index exists or is needed at this size.
 */
export function paidChatsSearchSql(from: number, pattern: string, chatIds: string[], exact: string | null, limit: number): SqlQuery {
  return q(
    'paid_chats_search',
    `SELECT client_id, chat_id, to_char(${IST}, 'YYYY-MM-DD') AS day, min(persona_id) AS persona_id,
  count(*)::int AS credits, sum(amount)::bigint AS amount, sum(owner_amount)::bigint AS owner_amount,
  bool_or(cheat_flagged) AS cheat_flagged, min(ts) AS first_at, max(ts) AS last_at
FROM payment_event_owner
WHERE ts >= $1::timestamptz AND amount > 0
  AND (chat_id ILIKE $2 OR client_id ILIKE $2 OR persona_id ILIKE $2 OR chat_id = ANY($3::text[]))
GROUP BY client_id, chat_id, to_char(${IST}, 'YYYY-MM-DD')
ORDER BY (chat_id = $4::text) IS TRUE DESC, max(ts) DESC, client_id, chat_id
LIMIT $5`,
    [iso(from), pattern, chatIds, exact, limit],
  );
}

// ---------------------------------------------------------------- promotions + funnel (2026-10-29)

/**
 * Promotion sends of one intraday window per (current?, service, client, mobile, error_type), current =
 * [curStart, end), previous = [prevStart, prevEnd) (prevEnd <= curStart). One scan of the partitions the
 * range covers (2 for today, 3 for 24h); count(*) only. `failed` = outcome IN ('failed','banned'), as in
 * daily_mobile.failed (see sendsLiveSql). error_type is NULL on delivered rows; banned rows carry
 * USER_BANNED_IN_CHANNEL, so the per-mobile error mix is (failed - banned) per row = the outcome='failed'
 * rows only (monitor-promotions aggregate). max(ts) = last send.
 */
export function promoSendsSql(cur: Window, prev: Window): SqlQuery {
  return q(
    'promo_sends',
    `SELECT ts >= $1::timestamptz AS cur, service, client_id, mobile, error_type,
  count(*) FILTER (WHERE outcome <> 'deleted') AS sent,
  count(*) FILTER (WHERE outcome = 'delivered') AS delivered,
  count(*) FILTER (WHERE outcome = 'banned') AS banned,
  count(*) FILTER (WHERE outcome IN ('failed', 'banned')) AS failed,
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

/**
 * daily_mobile per (IST day, namespace, client, mobile) over from..to inclusive (primary-key range on
 * day): the shared closed-day read behind /monitor/promotions and /monitor/reactions from/to ranges,
 * folded per range in memory (foldMobileDays). Measured 2026-10-31 on prod: 62 closed days = 2,162 rows,
 * 301,510 bytes (pg_column_size), ~100 rows per day.
 */
export function promoMobileDaysSql(from: string, to: string, routed: readonly string[] = []): SqlQuery {
  return q(
    'promo_mobile_days',
    `SELECT day::text AS d, namespace, client_id, mobile, max(profile) AS profile,
  coalesce(sum(sent), 0) AS sent, coalesce(sum(delivered), 0) AS delivered, coalesce(sum(banned), 0) AS banned,
  coalesce(sum(failed), 0) AS failed, coalesce(sum(new_users), 0) AS new_users${REACTION_SUMS}${routedSums(routed)}
FROM daily_mobile
WHERE day BETWEEN $1::date AND $2::date
GROUP BY 1, 2, 3, 4`,
    [from, to],
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
 * Origin of the chats that paid since `payFrom`: the first attributed DM conversion since `dmFrom` of the
 * same chat by the same PERSONA (conversion_event.profile = payment_event.persona_id), whatever client
 * recorded the DM, and its service ('t' direct tg-aut promotion, 'p' routed by a promote account). One row
 * per paying (chat, client): the key the funnel joins on stays chat|client of the payment.
 * Why persona: conversion_id is `${profile}:${chatId}` and its Redis claim is per persona, so only the first
 * client of a persona gets the DM row (prod 2026-11-14: 267 paying rows in 14 d had their DM only on another
 * client of the same persona). Both columns are written by the same process env (dbcoll), so no Mongo map
 * from persona to client is needed.
 * payment_event's ts index bounds the payers; conversion_event has no chat index, so its scan is the dm rows
 * since dmFrom (same rows dms_hist reads), hash-joined to the payers. Chat ids never leave the service.
 * Payers read the payment_event_owner view, so a voided payment (Uncredit, 2026-11-08) is not a payer.
 */
export function paidOriginSql(dmFrom: number, payFrom: number): SqlQuery {
  return q(
    'paid_origin',
    `SELECT DISTINCT ON (p.chat_id, p.client_id) p.chat_id, p.client_id, c.service
FROM (SELECT DISTINCT chat_id, client_id, persona_id FROM payment_event_owner WHERE ts >= $2::timestamptz AND amount > 0) p
JOIN conversion_event c ON c.chat_id = p.chat_id AND c.profile = p.persona_id
WHERE c.kind = 'dm' AND c.ts >= $1::timestamptz AND c.client_id IS NOT NULL
ORDER BY p.chat_id, p.client_id, c.ts`,
    [iso(dmFrom), iso(payFrom)],
  );
}

/** "Rest" rule: a mobile whose ban rate on one IST day was above BAN_RATE on at least MIN_SENDS sends. */
export const REST_RULE = { MIN_SENDS: 20, BAN_RATE: 0.3 } as const;

/**
 * Mobiles to rest today: daily_mobile on IST day `day` (yesterday), summed over every client and namespace
 * of the mobile, with sent >= REST_RULE.MIN_SENDS and banned / sent > REST_RULE.BAN_RATE. Primary-key range
 * on day (~100 rows). Mobiles never leave the service unmasked.
 */
export function restMobilesSql(day: string): SqlQuery {
  return q(
    'rest_mobiles',
    `SELECT mobile, sum(sent) AS sent, sum(banned) AS banned
FROM daily_mobile
WHERE day = $1::date
GROUP BY mobile
HAVING sum(sent) >= $2::int AND sum(banned) > $3::numeric * sum(sent)`,
    [day, REST_RULE.MIN_SENDS, REST_RULE.BAN_RATE],
  );
}

/** Dead channel rule: delivered >= MIN_DELIVERED and 0 DMs over DAYS closed IST days (fleet, daily_channel). */
export const DEAD_CHANNEL_RULE = { DAYS: 30, MIN_DELIVERED: 200, LIMIT: 50 } as const;

/**
 * Dead channels over closed IST days from..to (daily_channel, fleet-wide: it has no client_id): channels with
 * delivered >= minDelivered and dms = 0. One statement: the summary (count, their sends and delivered, total
 * sends of every channel) on every row, plus the top `limit` dead channels by delivered (channel_id NULL when
 * there is none, so the summary still comes back). Primary-key range on day.
 */
export function deadChannelsSql(from: string, to: string, minDelivered: number = DEAD_CHANNEL_RULE.MIN_DELIVERED, limit: number = DEAD_CHANNEL_RULE.LIMIT): SqlQuery {
  return q(
    'dead_channels',
    `WITH c AS (
  SELECT channel_id, sum(sent) AS sent, sum(delivered) AS delivered, sum(dms) AS dms
  FROM daily_channel WHERE day BETWEEN $1::date AND $2::date GROUP BY channel_id
), s AS (
  SELECT coalesce(sum(sent), 0) AS total_sent,
    count(*) FILTER (WHERE delivered >= $3 AND dms = 0) AS n,
    coalesce(sum(sent) FILTER (WHERE delivered >= $3 AND dms = 0), 0) AS dead_sent,
    coalesce(sum(delivered) FILTER (WHERE delivered >= $3 AND dms = 0), 0) AS dead_delivered
  FROM c
)
SELECT s.total_sent, s.n, s.dead_sent, s.dead_delivered, d.channel_id, d.sent, d.delivered
FROM s LEFT JOIN LATERAL (
  SELECT channel_id, sent, delivered FROM c WHERE delivered >= $3 AND dms = 0 ORDER BY delivered DESC, channel_id LIMIT $4
) d ON true`,
    [from, to, minDelivered, limit],
  );
}

/** DM lookback of the attribution-per-day series, and the first day whose lookback the table fully covers. */
export const ATTRIBUTION_RULE = { LOOKBACK_DAYS: 30, CE_RETENTION_DAYS: 62, CE_FIRST_DAY: '2026-10-03' } as const;

/**
 * Attribution per (closed IST day, client) over from..to: new users (daily_client, every namespace), DM
 * conversions (conversion_event kind dm, distinct conversion_id per day and client), revenue (owner_amount of
 * credits under ₹1,000, as the monitor's revenue) and the part of it whose chat had a DM row by the same
 * persona in the `lookbackDays` before the payment. Instants: $3 = IST start of `from`, $4 = IST start of the
 * day after `to`. conversion_event keeps 62 days: the caller keeps from >= today - (62 - lookbackDays).
 */
export function attributionDailySql(from: string, to: string, fromMs: number, endMs: number, lookbackDays: number = ATTRIBUTION_RULE.LOOKBACK_DAYS): SqlQuery {
  return q(
    'attribution_daily',
    `WITH nu AS (
  SELECT day::text AS d, client_id, sum(new_users) AS new_users
  FROM daily_client WHERE day BETWEEN $1::date AND $2::date GROUP BY 1, 2
), dm AS (
  SELECT ${IST}::date::text AS d, client_id, count(DISTINCT conversion_id) AS dms
  FROM conversion_event WHERE kind = 'dm' AND ts >= $3::timestamptz AND ts < $4::timestamptz GROUP BY 1, 2
), pay AS (
  SELECT id, ts, chat_id, client_id, persona_id, owner_amount
  FROM payment_event_owner WHERE ts >= $3::timestamptz AND ts < $4::timestamptz AND amount > 0 AND amount < 1000
), hit AS (
  SELECT DISTINCT p.id
  FROM pay p JOIN conversion_event c ON c.chat_id = p.chat_id AND c.profile = p.persona_id
  WHERE c.kind = 'dm' AND c.ts >= $3::timestamptz - make_interval(days => $5) AND c.ts <= p.ts AND c.ts >= p.ts - make_interval(days => $5)
), rev AS (
  SELECT (p.ts AT TIME ZONE 'Asia/Kolkata')::date::text AS d, p.client_id, sum(p.owner_amount) AS revenue,
    coalesce(sum(p.owner_amount) FILTER (WHERE h.id IS NOT NULL), 0) AS revenue_dm
  FROM pay p LEFT JOIN hit h ON h.id = p.id GROUP BY 1, 2
), k AS (
  SELECT d, client_id FROM nu UNION SELECT d, client_id FROM dm UNION SELECT d, client_id FROM rev
)
SELECT k.d, k.client_id, coalesce(nu.new_users, 0) AS new_users, coalesce(dm.dms, 0) AS dms,
  coalesce(rev.revenue, 0) AS revenue, coalesce(rev.revenue_dm, 0) AS revenue_dm
FROM k
LEFT JOIN nu ON nu.d = k.d AND nu.client_id IS NOT DISTINCT FROM k.client_id
LEFT JOIN dm ON dm.d = k.d AND dm.client_id IS NOT DISTINCT FROM k.client_id
LEFT JOIN rev ON rev.d = k.d AND rev.client_id IS NOT DISTINCT FROM k.client_id`,
    [from, to, iso(fromMs), iso(endMs), lookbackDays],
  );
}
