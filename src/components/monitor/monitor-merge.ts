/**
 * Pure merge/derive functions: closed-day (history) results + today's results → the numbers the
 * monitor endpoints return. Kept free of Nest/Mongo/pg so specs (and the prod parity script) can run
 * them on fixtures.
 */
import { istDate } from './monitor-time';
import { num } from './monitor-util';

// ---------------------------------------------------------------- payments

export interface PayRow {
  client_id?: string | null;
  ts: Date | string;
  chat_id: string;
  amount: number | string;
  owner_amount: number | string;
  cheat_flagged: boolean | null;
}

export interface Credit {
  client: string | null;
  ms: number;
  chat: string;
  amount: number;
  /** owner revenue: owner_amount when amount < ₹1,000 (owner rule 8), else 0 */
  revenue: number;
  gross: number;
  /** counts as a payer: under ₹1,000 and not cheat-flagged */
  clean: boolean;
}

export function toCredit(r: PayRow): Credit {
  const amount = num(r.amount);
  const under = amount < 1000;
  return {
    client: r.client_id ?? null,
    ms: new Date(r.ts).getTime(),
    chat: String(r.chat_id),
    amount,
    gross: amount,
    revenue: under ? num(r.owner_amount) : 0,
    clean: under && r.cheat_flagged !== true,
  };
}

export interface RevAgg {
  revenue: number;
  gross: number;
  payers: number;
}

/**
 * Revenue/gross/payers per client and fleet total over credits with start <= ms < end. Same rules as
 * the former GROUPING SETS SQL: payers distinct by chat (fleet total distinct fleet-wide), the total
 * includes rows without a client.
 */
export function revenueBy(credits: Credit[], start: number, end: number): { byClient: Map<string, RevAgg>; total: RevAgg } {
  const acc = new Map<string, { revenue: number; gross: number; chats: Set<string> }>();
  const tot = { revenue: 0, gross: 0, chats: new Set<string>() };
  for (const c of credits) {
    if (c.ms < start || c.ms >= end) continue;
    tot.revenue += c.revenue;
    tot.gross += c.gross;
    if (c.clean) tot.chats.add(c.chat);
    if (!c.client) continue;
    const e = acc.get(c.client) ?? { revenue: 0, gross: 0, chats: new Set<string>() };
    e.revenue += c.revenue;
    e.gross += c.gross;
    if (c.clean) e.chats.add(c.chat);
    acc.set(c.client, e);
  }
  const byClient = new Map<string, RevAgg>();
  for (const [k, v] of acc) byClient.set(k, { revenue: v.revenue, gross: v.gross, payers: v.chats.size });
  return { byClient, total: { revenue: tot.revenue, gross: tot.gross, payers: tot.chats.size } };
}

/** Owner revenue per client per IST date (credits under ₹1,000). */
export function revenueByClientDay(credits: Credit[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const c of credits) {
    if (!c.client || c.amount >= 1000) continue;
    const d = istDate(c.ms);
    if (!out.has(c.client)) out.set(c.client, new Map());
    const m = out.get(c.client)!;
    m.set(d, (m.get(d) ?? 0) + c.revenue);
  }
  return out;
}

// ---------------------------------------------------------------- daily_client

export interface DailyClientRow {
  d: string;
  client_id: string | null;
  sent: number | string;
  delivered: number | string;
  banned: number | string;
  new_users: number | string;
}

export interface SendAgg {
  sent: number;
  delivered: number;
  banned: number;
  newUsers: number;
}

const zeroSend = (): SendAgg => ({ sent: 0, delivered: 0, banned: 0, newUsers: 0 });

function addSend(a: SendAgg, r: { sent: unknown; delivered: unknown; banned: unknown; new_users?: unknown }): void {
  a.sent += num(r.sent);
  a.delivered += num(r.delivered);
  a.banned += num(r.banned);
  a.newUsers += num(r.new_users);
}

/** daily_client rows with from <= d <= to: per client and fleet total. */
export function sumDailyClient(rows: DailyClientRow[], from: string, to: string): { byClient: Map<string, SendAgg>; total: SendAgg } {
  const byClient = new Map<string, SendAgg>();
  const total = zeroSend();
  for (const r of rows) {
    if (r.d < from || r.d > to) continue;
    addSend(total, r);
    if (!r.client_id) continue;
    const e = byClient.get(r.client_id) ?? zeroSend();
    addSend(e, r);
    byClient.set(r.client_id, e);
  }
  return { byClient, total };
}

/** daily_client rows for one scope (client id, or null = every client) per date. */
export function dailyClientByDate(rows: DailyClientRow[], scope: string | null): Map<string, SendAgg> {
  const out = new Map<string, SendAgg>();
  for (const r of rows) {
    if (scope !== null && r.client_id !== scope) continue;
    const e = out.get(r.d) ?? zeroSend();
    addSend(e, r);
    out.set(r.d, e);
  }
  return out;
}

// ---------------------------------------------------------------- DMs

export interface DmsDayRow {
  d: string;
  client_id: string | null;
  dms: number | string;
}

/**
 * DMs per client and fleet total for from <= d <= to, from per-(day, client) distinct counts. Exact
 * because a conversion is recorded once (prod 2026-10-28: Σ per-day distinct = distinct over 7 d and
 * 30 d, fleet and per client).
 */
export function sumDmsDays(rows: DmsDayRow[], from: string, to: string): { byClient: Map<string, number>; total: number } {
  const byClient = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (r.d < from || r.d > to) continue;
    total += num(r.dms);
    if (r.client_id) byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + num(r.dms));
  }
  return { byClient, total };
}

/** Per-date DMs for one scope (null = every row incl. unattributed). */
export function dmsByDate(rows: DmsDayRow[], scope: string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (scope !== null && r.client_id !== scope) continue;
    out.set(r.d, (out.get(r.d) ?? 0) + num(r.dms));
  }
  return out;
}

export interface DmRow {
  client_id: string | null;
  channel_id: string | null;
  conversion_id: string;
  ts: Date | string;
}

/** Distinct conversions per client and fleet-wide among raw DM rows with ts < before. */
export function distinctDms(rows: DmRow[], before = Number.POSITIVE_INFINITY): { byClient: Map<string, number>; total: number } {
  const per = new Map<string, Set<string>>();
  const all = new Set<string>();
  for (const r of rows) {
    if (new Date(r.ts).getTime() >= before) continue;
    all.add(r.conversion_id);
    if (!r.client_id) continue;
    if (!per.has(r.client_id)) per.set(r.client_id, new Set());
    per.get(r.client_id)!.add(r.conversion_id);
  }
  const byClient = new Map<string, number>();
  for (const [k, v] of per) byClient.set(k, v.size);
  return { byClient, total: all.size };
}

/** Distinct conversions per channel for one scope among raw DM rows. */
export function dmsByChannel(rows: DmRow[], scope: string | null): Map<string, number> {
  const per = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.channel_id) continue;
    if (scope !== null && r.client_id !== scope) continue;
    if (!per.has(r.channel_id)) per.set(r.channel_id, new Set());
    per.get(r.channel_id)!.add(r.conversion_id);
  }
  return new Map([...per].map(([k, v]) => [k, v.size]));
}

// ---------------------------------------------------------------- channels

/**
 * Top channels by DMs over history + today (a channel's history and today DMs are disjoint
 * conversions: prod 2026-10-28, 0 overlaps). Ties: channel id ascending (code-unit order).
 */
export function rankChannels(hist: Map<string, number>, today: Map<string, number>, limit: number): Array<{ channel_id: string; dms: number }> {
  const sum = new Map(hist);
  for (const [k, v] of today) sum.set(k, (sum.get(k) ?? 0) + v);
  return [...sum]
    .filter(([, v]) => v > 0)
    .map(([channel_id, dms]) => ({ channel_id, dms }))
    .sort((a, b) => b.dms - a.dms || (a.channel_id < b.channel_id ? -1 : a.channel_id > b.channel_id ? 1 : 0))
    .slice(0, limit);
}

// ---------------------------------------------------------------- mobiles

export interface MobileRow {
  mobile: string;
  client_id: string | null;
  new_users: number | string;
  dms: number | string;
  sent: number | string;
  delivered: number | string;
  banned: number | string;
  first_day: string;
  last_day: string;
}

export interface MobileOut {
  mobile: string;
  client_id: string | null;
  new_users: number;
  dms: number;
  sent: number;
  delivered: number;
  banned: number;
  first_day: string;
  last_day: string;
}

/**
 * Per-mobile totals over history + today rows (both per (mobile, client)). One client: that client's
 * rows, every mobile, by sends desc. Fleet (scope null): every client's rows per mobile, client = the
 * one with the latest day (ties: larger client id), top `limit` by new users, sends, mobile.
 */
export function mergeMobiles(rows: MobileRow[], scope: string | null, limit = 20): MobileOut[] {
  const by = new Map<string, MobileOut & { lastByClient: string }>();
  for (const r of rows) {
    if (scope !== null && r.client_id !== scope) continue;
    const e = by.get(r.mobile);
    if (!e) {
      by.set(r.mobile, {
        mobile: r.mobile,
        client_id: r.client_id,
        new_users: num(r.new_users),
        dms: num(r.dms),
        sent: num(r.sent),
        delivered: num(r.delivered),
        banned: num(r.banned),
        first_day: r.first_day,
        last_day: r.last_day,
        lastByClient: r.last_day,
      });
      continue;
    }
    e.new_users += num(r.new_users);
    e.dms += num(r.dms);
    e.sent += num(r.sent);
    e.delivered += num(r.delivered);
    e.banned += num(r.banned);
    if (r.first_day < e.first_day) e.first_day = r.first_day;
    if (r.last_day > e.last_day) e.last_day = r.last_day;
    if (r.last_day > e.lastByClient || (r.last_day === e.lastByClient && String(r.client_id) > String(e.client_id))) {
      e.lastByClient = r.last_day;
      e.client_id = r.client_id;
    }
  }
  const out = [...by.values()].map(({ lastByClient: _l, ...m }) => m);
  if (scope !== null) return out.sort((a, b) => b.sent - a.sent || (a.mobile < b.mobile ? -1 : 1));
  return out
    .sort((a, b) => b.new_users - a.new_users || b.sent - a.sent || (a.mobile < b.mobile ? -1 : a.mobile > b.mobile ? 1 : 0))
    .slice(0, limit);
}

// ---------------------------------------------------------------- time-to-first-pay

/** Adds two `$bucket` outputs (counts per lower bound). */
export function addBuckets(a: Array<{ _id: number | string; n: number }>, b: Array<{ _id: number | string; n: number }>): Array<{ _id: number | string; n: number }> {
  const m = new Map<string, { _id: number | string; n: number }>();
  for (const r of [...a, ...b]) {
    const k = String(r._id);
    const e = m.get(k) ?? { _id: r._id, n: 0 };
    e.n += Number(r.n) || 0;
    m.set(k, e);
  }
  return [...m.values()];
}
