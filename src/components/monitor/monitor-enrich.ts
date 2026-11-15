/**
 * Monitor enrichments (2026-11-15, promo-research step 2/3): pure folds of the new SQL parts and of the
 * in-memory credit rows. No I/O here; monitor.service.ts loads the rows and caches them as parts.
 *  - rest flag per mobile (restMobilesSql, yesterday's daily_mobile)
 *  - dead channels (deadChannelsSql, daily_channel, fleet)
 *  - attribution per day (attributionDailySql)
 *  - multi-client payers and possible double credits (credit rows, no SQL)
 */
import { Credit } from './monitor-merge';
import { ATTRIBUTION_RULE, DEAD_CHANNEL_RULE, REST_RULE } from './monitor-sql';
import { addDays } from './monitor-time';
import { num, ratio } from './monitor-util';

// ---------------------------------------------------------------- rest flag

export interface RestFlag {
  /** IST day the rule was read on (yesterday). */
  day: string;
  sent: number;
  banned: number;
  banRate: number;
}

/** rest_mobiles rows -> unmasked mobile -> flag. Rows already passed the SQL rule; re-checked here. */
export function restFlags(rows: Array<{ mobile: unknown; sent: unknown; banned: unknown }>, day: string): Map<string, RestFlag> {
  const out = new Map<string, RestFlag>();
  for (const r of rows) {
    const mobile = r.mobile == null ? '' : String(r.mobile);
    const sent = num(r.sent);
    const banned = num(r.banned);
    if (!mobile || sent < REST_RULE.MIN_SENDS || banned <= REST_RULE.BAN_RATE * sent) continue;
    out.set(mobile, { day, sent, banned, banRate: banned / sent });
  }
  return out;
}

export const REST_NOTE = `mobiles[].rest = the mobile's ban rate on the previous IST day was above ${REST_RULE.BAN_RATE * 100}% on at least ${REST_RULE.MIN_SENDS} sends (daily_mobile, every client and namespace of the mobile); null = not flagged.`;

// ---------------------------------------------------------------- dead channels

export interface DeadChannels {
  from: string;
  to: string;
  days: number;
  minDelivered: number;
  /** dead channels: delivered >= minDelivered and 0 DMs in the window */
  count: number;
  sends: number;
  delivered: number;
  /** sends of every channel in the window (daily_channel) */
  totalSends: number;
  /** sends / totalSends; null when nothing was sent */
  shareOfSends: number | null;
  /** top `limit` dead channels by delivered; id = daily_channel channel_id (unique per row, titles can repeat) */
  channels: Array<{ id: string; title: string; sends: number; delivered: number }>;
}

/** The closed-day window of the dead-channel table: the last DAYS IST days before today. */
export function deadChannelWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -DEAD_CHANNEL_RULE.DAYS), to: addDays(today, -1) };
}

export function deadChannelsOf(rows: any[], titles: Map<string, string>, from: string, to: string): DeadChannels {
  const first = rows[0] ?? {};
  const totalSends = num(first.total_sent);
  const sends = num(first.dead_sent);
  return {
    from,
    to,
    days: DEAD_CHANNEL_RULE.DAYS,
    minDelivered: DEAD_CHANNEL_RULE.MIN_DELIVERED,
    count: num(first.n),
    sends,
    delivered: num(first.dead_delivered),
    totalSends,
    shareOfSends: ratio(sends, totalSends),
    channels: rows
      .filter((r) => r.channel_id != null)
      .map((r) => {
        const id = String(r.channel_id);
        return { id, title: titles.get(id) ?? `channel …${id.slice(-4)}`, sends: num(r.sent), delivered: num(r.delivered) };
      }),
  };
}

// ---------------------------------------------------------------- attribution per day

export interface AttributionDay {
  date: string;
  newUsers: number;
  /** DM conversions (conversion_event kind dm): new users that got a channel */
  dmUsers: number;
  /** dmUsers / newUsers */
  newUserChannelShare: number | null;
  revenue: number;
  /** revenue whose chat had a DM row by the same persona in the lookback before the payment */
  revenueWithDm: number;
  revenueDmShare: number | null;
}

/**
 * First closed day the attribution series may show: conversion_event keeps CE_RETENTION_DAYS, and a payment
 * needs LOOKBACK_DAYS of DM rows before it, so earlier days would count too little; never before the
 * table's first row + the lookback.
 */
export function attributionFirstDay(today: string): string {
  const byRetention = addDays(today, -(ATTRIBUTION_RULE.CE_RETENTION_DAYS - ATTRIBUTION_RULE.LOOKBACK_DAYS));
  const byTableStart = addDays(ATTRIBUTION_RULE.CE_FIRST_DAY, ATTRIBUTION_RULE.LOOKBACK_DAYS);
  return byRetention > byTableStart ? byRetention : byTableStart;
}

/** attribution_daily rows (per day and client) -> one row per day in from..to, scoped to `client` (null = fleet). */
export function attributionDays(rows: any[], from: string, to: string, client: string | null): AttributionDay[] {
  const by = new Map<string, { nu: number; dm: number; rev: number; revDm: number }>();
  for (const r of rows) {
    const d = String(r.d);
    if (d < from || d > to) continue;
    if (client !== null && r.client_id !== client) continue;
    const e = by.get(d) ?? { nu: 0, dm: 0, rev: 0, revDm: 0 };
    e.nu += num(r.new_users);
    e.dm += num(r.dms);
    e.rev += num(r.revenue);
    e.revDm += num(r.revenue_dm);
    by.set(d, e);
  }
  return [...by.keys()].sort().map((date) => {
    const e = by.get(date)!;
    return {
      date,
      newUsers: e.nu,
      dmUsers: e.dm,
      newUserChannelShare: ratio(e.dm, e.nu),
      revenue: e.rev,
      revenueWithDm: e.revDm,
      revenueDmShare: ratio(e.revDm, e.rev),
    };
  });
}

export const ATTRIBUTION_NOTE = `attribution.daily: newUserChannelShare = DM conversions (conversion_event kind dm, every DM row has a channel) / new users (daily_client, namespace tg-aut, as every other monitor new-user count); revenueDmShare = revenue (credits under ₹1,000) whose chat had a DM row by the same persona in the ${ATTRIBUTION_RULE.LOOKBACK_DAYS} days before the payment / revenue. Closed IST days only, from today - ${ATTRIBUTION_RULE.CE_RETENTION_DAYS - ATTRIBUTION_RULE.LOOKBACK_DAYS} (conversion_event keeps ${ATTRIBUTION_RULE.CE_RETENTION_DAYS} days).`;

// ---------------------------------------------------------------- payment overlaps

/** Two credits of one chat with the same amount this close are a possible double credit (research step 2 used 120 s). */
export const DOUBLE_CREDIT_WINDOW_MS = 120_000;

export interface PaymentOverlaps {
  /** chats that paid more than one client in the window (scoped: this client and at least one other) */
  multiClientChats: number;
  /** consecutive credit pairs: same chat, same amount, within DOUBLE_CREDIT_WINDOW_MS, any client */
  doublePairs: number;
  /** of doublePairs: the two credits are on different clients */
  crossClientPairs: number;
  /** owner revenue of the second credit of each pair (Credit.revenue: owner_amount under ₹1,000, as every revenue on the page) */
  doubleAmount: number;
  windowSec: number;
}

/**
 * Over the window's credit rows (every client: a chat paying two clients needs both sides). `client` scopes
 * the counts to chats / pairs that involve that client. Pairs are consecutive credits of the same chat and
 * amount, ordered by time, so three quick credits are two pairs.
 */
export function paymentOverlaps(credits: Credit[], client: string | null): PaymentOverlaps {
  const clientsByChat = new Map<string, Set<string>>();
  const byKey = new Map<string, Credit[]>();
  for (const c of credits) {
    if (!c.chat || !(c.amount > 0)) continue;
    const cl = c.client ?? '';
    let s = clientsByChat.get(c.chat);
    if (!s) clientsByChat.set(c.chat, (s = new Set()));
    s.add(cl);
    const k = `${c.chat}|${c.amount}`;
    const l = byKey.get(k);
    if (l) l.push(c);
    else byKey.set(k, [c]);
  }
  let multiClientChats = 0;
  for (const s of clientsByChat.values()) if (s.size > 1 && (client === null || s.has(client))) multiClientChats++;
  let doublePairs = 0;
  let crossClientPairs = 0;
  let doubleAmount = 0;
  for (const l of byKey.values()) {
    if (l.length < 2) continue;
    l.sort((a, b) => a.ms - b.ms);
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1];
      const b = l[i];
      if (b.ms - a.ms > DOUBLE_CREDIT_WINDOW_MS) continue;
      if (client !== null && a.client !== client && b.client !== client) continue;
      doublePairs++;
      if ((a.client ?? '') !== (b.client ?? '')) crossClientPairs++;
      doubleAmount += b.revenue;
    }
  }
  return { multiClientChats, doublePairs, crossClientPairs, doubleAmount, windowSec: DOUBLE_CREDIT_WINDOW_MS / 1000 };
}

export const OVERLAP_NOTE = `paymentOverlaps: multiClientChats = chats with credits on more than one client in the range; doublePairs = consecutive credits of the same chat and amount within ${DOUBLE_CREDIT_WINDOW_MS / 1000} s on any client (possible double credit, research rule), crossClientPairs = of those, on two clients; doubleAmount = owner revenue of the second credit of each pair (credits under ₹1,000, as the page revenue).`;
