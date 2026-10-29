/**
 * GET /monitor/promotions (design-v2 §4): promotion health per family, client and mobile. Pure: the
 * service loads the parts (Postgres sends, daily_mobile, DMs, Redis spam/route state, heartbeats,
 * assigned promote mobiles) and this module turns them into the response. Mobiles are masked here.
 */
import { FamSplit, FAMILIES, Family, familyOf } from './monitor-family';
import type { Credit } from './monitor-merge';
import { addDays, DateRange, DAY_MS, istDate, resolvePeriod, Window } from './monitor-time';
import { maskMobile, num, ratio } from './monitor-util';

export type PromoWindow = 'today' | '24h' | '7d' | '30d';
export const PROMO_WINDOWS: PromoWindow[] = ['today', '24h', '7d', '30d'];

/** Same values as tg-chats src/monitor/thresholds.ts PROMO (owner defaults, design-v2 §6). */
export const PROMO_LIMITS = {
  /** "looks limited" needs at least this many sends in the window: today ... */
  LIMITED_MIN_SENDS_TODAY: 50,
  /** ... 24h / 7d / 30d */
  LIMITED_MIN_SENDS_WINDOW: 200,
  /** ... and a delivered share below this */
  LIMITED_MAX_DELIVERED: 0.05,
  /** an assigned promote mobile with at most this many sends in the window is idle */
  IDLE_ASSIGNED_SENDS: 0,
} as const;

/** Redis spam states that mark a mobile limited whatever its send counts. */
const LIMITED_SPAM = new Set(['limited', 'harsh']);

export interface PromoWindows {
  window: PromoWindow;
  today: string;
  range: DateRange;
  previousRange: DateRange;
  cur: Window;
  prev: Window;
  /** true = read from promotion_send (today, 24h); false = closed IST days from daily_mobile (7d, 30d). */
  intraday: boolean;
}

/**
 * today: [IST 00:00, now) vs yesterday up to the same time; 24h: [now - 24 h, now) vs the 24 h before;
 * 7d / 30d: complete IST days ending yesterday vs the same number of days before (as /monitor/fleet).
 */
export function promoWindows(window: PromoWindow, now: number): PromoWindows {
  if (window === '24h') {
    const start = now - DAY_MS;
    return {
      window,
      today: istDate(now),
      range: { from: istDate(start), to: istDate(now) },
      previousRange: { from: istDate(start - DAY_MS), to: istDate(start) },
      cur: { start, end: now },
      prev: { start: start - DAY_MS, end: start },
      intraday: true,
    };
  }
  const w = resolvePeriod(window, now);
  return { window, today: w.today, range: w.range, previousRange: w.prevRange, cur: w.cur, prev: w.prev, intraday: !w.wholeDays };
}

/** One (current?, family, client, mobile[, error type]) row from promo_sends or promo_mobiles_hist. */
export interface PromoRow {
  cur: boolean;
  family: Family | null;
  clientId: string | null;
  mobile: string | null;
  sent: number;
  delivered: number;
  banned: number;
  failed: number;
  errorType: string | null;
  /** epoch ms of the last send (promo_sends) */
  lastAt: number | null;
  /** last IST day with a daily_mobile row (promo_mobiles_hist) */
  lastDay: string | null;
  profile: string | null;
  newDms: number;
  routed: Record<string, number>;
}

const isTrue = (v: unknown) => v === true || v === 't' || v === 'true';

export function rowsFromSends(rows: any[]): PromoRow[] {
  return rows.map((r) => ({
    cur: isTrue(r.cur),
    family: familyOf(r.service),
    clientId: r.client_id ?? null,
    mobile: r.mobile ? String(r.mobile) : null,
    sent: num(r.sent),
    delivered: num(r.delivered),
    banned: num(r.banned),
    failed: num(r.failed),
    errorType: r.error_type ? String(r.error_type) : null,
    lastAt: r.last_ts ? new Date(r.last_ts).getTime() : null,
    lastDay: null,
    profile: null,
    newDms: 0,
    routed: {},
  }));
}

export function rowsFromHist(rows: any[], routedCols: readonly string[]): PromoRow[] {
  return rows.map((r) => ({
    cur: isTrue(r.cur),
    family: familyOf(r.namespace),
    clientId: r.client_id ?? null,
    mobile: r.mobile ? String(r.mobile) : null,
    sent: num(r.sent),
    delivered: num(r.delivered),
    banned: num(r.banned),
    failed: num(r.failed),
    errorType: null,
    lastAt: null,
    lastDay: r.last_day ? String(r.last_day) : null,
    profile: r.profile ? String(r.profile) : null,
    newDms: num(r.new_users),
    routed: Object.fromEntries(routedCols.map((c) => [c, num(r[c])])),
  }));
}

export interface MobileExtra {
  profile: string | null;
  newDms: number;
  routed: Record<string, number>;
}

/** Today's daily_mobile rows (profile, first DMs, route counters) keyed family|client|mobile. */
export function extrasFromToday(rows: any[], routedCols: readonly string[]): Map<string, MobileExtra> {
  const out = new Map<string, MobileExtra>();
  for (const r of rows) {
    const fam = familyOf(r.namespace);
    if (!fam || !r.mobile) continue;
    out.set(key(fam, r.client_id ?? null, String(r.mobile)), {
      profile: r.profile ? String(r.profile) : null,
      newDms: num(r.new_users),
      routed: Object.fromEntries(routedCols.map((c) => [c, num(r[c])])),
    });
  }
  return out;
}

export interface SpamState {
  status: string | null;
  daysLeft: number | null;
  limitedUntil: string | null;
  checkedAt: string | null;
}

const nullish = (v: unknown) => v === undefined || v === null || v === '' || v === 'null' || v === 'undefined';
const isoOrRaw = (v: unknown): string | null => {
  if (nullish(v)) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e11) return new Date(n).toISOString();
  return String(v);
};

/** tg::acct::<mobile> hash → spam state (fields are written with String(value), so 'null' means null). */
export function parseSpam(h: Record<string, string> | null | undefined): SpamState | null {
  if (!h || !Object.keys(h).length) return null;
  const days = nullish(h.daysLeft) ? null : Number(h.daysLeft);
  return {
    status: nullish(h.spamStatus) ? null : String(h.spamStatus),
    daysLeft: days !== null && Number.isFinite(days) ? days : null,
    limitedUntil: isoOrRaw(h.limitedUntil),
    checkedAt: isoOrRaw(h.spamCheckedAt),
  };
}

export interface RouteState {
  /** users mid-route (HLEN promote::route::<mobile>) */
  pending: number;
  /** confirmed route sends awaiting a conversion (ZCARD promote::routebacklog::<mobile>) */
  backlog: number;
  /** main-account replies sent for this promote mobile (ZCARD promote::mainreply::<mobile>) */
  mainReplies: number;
}

export interface HeartbeatMobile {
  connected: boolean | null;
  health: string | null;
}

export interface EngineState {
  state: string;
  runnerStatus: string | null;
  failStreak: number | null;
  lastAnyAgeSec: number | null;
}

export interface PromoHeartbeats {
  /** client|last4 → state; null = two mobiles of that client share the last 4 digits (no join). */
  mobiles: Map<string, HeartbeatMobile | null>;
  /** tg-aut clientId → its promotion engine state */
  engines: Map<string, EngineState>;
}

/** Heartbeat joins from live entries (raw payloads; only live/stopping ones count). */
export function heartbeatJoins(entries: Array<{ svc: string; clientId: string; payload: Record<string, any> | null; state: string }>): PromoHeartbeats {
  const mobiles = new Map<string, HeartbeatMobile | null>();
  const engines = new Map<string, EngineState>();
  const put = (k: string, v: HeartbeatMobile) => mobiles.set(k, mobiles.has(k) ? null : v);
  for (const e of entries) {
    const p = e.payload;
    if (!p || (e.state !== 'live' && e.state !== 'stopping')) continue;
    if (e.svc === 'promote' && Array.isArray(p.mobiles)) {
      for (const m of p.mobiles) {
        const id = m?.mobile ?? m?.m;
        if (!id) continue;
        put(`${e.clientId}|${String(id).slice(-4)}`, {
          connected: typeof m.connected === 'boolean' ? m.connected : null,
          health: m.health === undefined || m.health === null ? null : String(m.health),
        });
      }
    }
    if (e.svc === 'tg-aut') {
      if (p.mobile) put(`${e.clientId}|${String(p.mobile).slice(-4)}`, { connected: typeof p.telegramReady === 'boolean' ? p.telegramReady : null, health: e.state });
      const pr = p.promotions;
      if (pr && typeof pr === 'object') {
        engines.set(e.clientId, {
          state: e.state,
          runnerStatus: pr.runnerStatus === undefined || pr.runnerStatus === null ? null : String(pr.runnerStatus),
          failStreak: Number.isFinite(Number(pr.failStreak)) ? Number(pr.failStreak) : null,
          lastAnyAgeSec: Number.isFinite(Number(pr.lastAnyAgeSec)) ? Number(pr.lastAnyAgeSec) : null,
        });
      }
    }
  }
  return { mobiles, engines };
}

export interface Promo {
  sent: number;
  delivered: number;
  banned: number;
  failed: number;
  deliveryRate: number | null;
  banRate: number | null;
  dms: number | null;
  dmsPer100Delivered: number | null;
  mobilesSending: number;
  mobilesLimited: number;
  /** promote only: first DMs to promote accounts (daily_mobile promote-clients new_users) */
  incomingDms?: number | null;
  /** promote only: route counters (null until tg-platform writes the columns) */
  routesSent?: number | null;
  routedReached?: number | null;
}

export interface MobilePromo {
  mobile: string | null;
  clientId: string | null;
  profile: string | null;
  sent: number;
  delivered: number;
  banned: number;
  failed: number;
  deliveryRate: number | null;
  banRate: number | null;
  newDms: number | null;
  topError: { type: string; count: number } | null;
  lastSendAt: string | null;
  lastDay: string | null;
  spam: SpamState | null;
  looksLimited: boolean;
  idle: boolean;
  heartbeat: HeartbeatMobile | null;
  route24h: RouteState | null;
}

export type ClientPromo = Promo & {
  clientId: string;
  name: string | null;
  mobilesAssigned: number | null;
  lastSendAt: string | null;
  engine?: EngineState | null;
};

export interface FamilyPromo {
  totals: Promo;
  previous: Promo | null;
  clients: ClientPromo[];
  mobiles: MobilePromo[];
}

export interface PromoInputs {
  w: PromoWindows;
  rows: PromoRow[];
  /** today's daily_mobile extras (intraday windows); null = not loaded */
  extra: Map<string, MobileExtra> | null;
  dms: { cur: FamSplit<number> | null; prev: FamSplit<number> | null };
  spam: Map<string, SpamState | null> | null;
  route: Map<string, RouteState> | null;
  heartbeats: PromoHeartbeats | null;
  /** active promoteClients (unmasked mobile, clientId); null = not loaded */
  assigned: Array<{ mobile: string; clientId: string | null }> | null;
  names: Map<string, string | null>;
  /** ROUTED_COLUMNS present on daily_mobile */
  routedCols: readonly string[];
  client: string | null;
}

const key = (f: Family, c: string | null, m: string | null) => `${f}|${c ?? ''}|${m ?? ''}`;

interface Agg {
  family: Family;
  clientId: string | null;
  mobile: string | null;
  sent: number;
  delivered: number;
  banned: number;
  failed: number;
  errors: Map<string, number>;
  lastAt: number | null;
  lastDay: string | null;
  profile: string | null;
  newDms: number;
  routed: Record<string, number>;
}

function aggregate(rows: PromoRow[]): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.family) continue;
    const k = key(r.family, r.clientId, r.mobile);
    const a =
      out.get(k) ??
      ({ family: r.family, clientId: r.clientId, mobile: r.mobile, sent: 0, delivered: 0, banned: 0, failed: 0, errors: new Map(), lastAt: null, lastDay: null, profile: null, newDms: 0, routed: {} } as Agg);
    a.sent += r.sent;
    a.delivered += r.delivered;
    a.banned += r.banned;
    a.failed += r.failed;
    if (r.errorType && r.failed > 0) a.errors.set(r.errorType, (a.errors.get(r.errorType) ?? 0) + r.failed);
    if (r.lastAt !== null && (a.lastAt === null || r.lastAt > a.lastAt)) a.lastAt = r.lastAt;
    if (r.lastDay !== null && (a.lastDay === null || r.lastDay > a.lastDay)) a.lastDay = r.lastDay;
    if (r.profile) a.profile = r.profile;
    a.newDms += r.newDms;
    for (const [c, v] of Object.entries(r.routed)) a.routed[c] = (a.routed[c] ?? 0) + v;
    out.set(k, a);
  }
  return out;
}

/** "looks limited": enough sends in the window with almost none delivered, or Redis spam state limited/harsh. */
export function looksLimited(window: PromoWindow, sent: number, delivered: number, spamStatus: string | null | undefined): boolean {
  const min = window === 'today' ? PROMO_LIMITS.LIMITED_MIN_SENDS_TODAY : PROMO_LIMITS.LIMITED_MIN_SENDS_WINDOW;
  const byRate = sent >= min && delivered / sent < PROMO_LIMITS.LIMITED_MAX_DELIVERED;
  return byRate || (!!spamStatus && LIMITED_SPAM.has(spamStatus));
}

function promo(aggs: Agg[], dms: number | null, window: PromoWindow, limited: (a: Agg) => boolean): Promo {
  const s = aggs.reduce(
    (t, a) => ({ sent: t.sent + a.sent, delivered: t.delivered + a.delivered, banned: t.banned + a.banned, failed: t.failed + a.failed }),
    { sent: 0, delivered: 0, banned: 0, failed: 0 },
  );
  return {
    ...s,
    deliveryRate: ratio(s.delivered, s.sent),
    banRate: ratio(s.banned, s.sent),
    dms,
    dmsPer100Delivered: dms === null || !s.delivered ? null : Math.round((dms / s.delivered) * 10000) / 100,
    mobilesSending: aggs.filter((a) => a.mobile && a.sent > 0).length,
    mobilesLimited: aggs.filter((a) => a.mobile && limited(a)).length,
  };
}

const dmsOf = (split: FamSplit<number> | null, f: Family, id?: string): number | null =>
  split ? (id === undefined ? split.total[f] : (split.byClient.get(id)?.[f] ?? 0)) : null;

/** Fleet DMs of a family, or of one client when the page is filtered. */
const scopedDms = (split: FamSplit<number> | null, f: Family, client: string | null) => dmsOf(split, f, client ?? undefined);

export interface PromotionsBody {
  window: PromoWindow;
  clientId: string | null;
  range: DateRange;
  previousRange: DateRange;
  families: Record<Family, FamilyPromo>;
  both: Promo;
  unattributed: { sends: number; dms: number | null } | null;
  notes: string[];
}

export function buildPromotions(i: PromoInputs): PromotionsBody {
  const { w, client } = i;
  const inScope = (r: { clientId: string | null }) => client === null || r.clientId === client;
  const rows = i.rows.filter(inScope);
  const cur = aggregate(rows.filter((r) => r.cur));
  const prev = aggregate(rows.filter((r) => !r.cur));
  const notes: string[] = [];

  // today's daily_mobile extras (profile, first DMs, route counters) onto intraday rows
  if (w.intraday && i.extra) {
    for (const [k, x] of i.extra) {
      const a = cur.get(k);
      if (a) {
        a.profile = x.profile ?? a.profile;
        a.newDms = x.newDms;
        a.routed = x.routed;
      } else {
        const [fam, c, m] = k.split('|');
        if (client !== null && c !== client) continue;
        if (!x.newDms && !Object.values(x.routed).some(Boolean)) continue;
        cur.set(k, { family: fam as Family, clientId: c || null, mobile: m || null, sent: 0, delivered: 0, banned: 0, failed: 0, errors: new Map(), lastAt: null, lastDay: null, profile: x.profile, newDms: x.newDms, routed: x.routed });
      }
    }
  }

  // assigned promote mobiles that did not send: idle rows
  const assigned = (i.assigned ?? []).filter((a) => client === null || a.clientId === client);
  const assignedSet = new Set(assigned.map((a) => key('promote', a.clientId, a.mobile)));
  for (const a of assigned) {
    const k = key('promote', a.clientId, a.mobile);
    if (!cur.has(k)) cur.set(k, { family: 'promote', clientId: a.clientId, mobile: a.mobile, sent: 0, delivered: 0, banned: 0, failed: 0, errors: new Map(), lastAt: null, lastDay: null, profile: null, newDms: 0, routed: {} });
  }

  const spamOf = (m: string | null) => (m && i.spam ? (i.spam.get(m) ?? null) : null);
  const limitedCur = (a: Agg) => looksLimited(w.window, a.sent, a.delivered, spamOf(a.mobile)?.status);
  const limitedPrev = (a: Agg) => looksLimited(w.window, a.sent, a.delivered, null);
  const hasRouted = (c: string) => i.routedCols.includes(c);

  const families = {} as Record<Family, FamilyPromo>;
  for (const f of FAMILIES) {
    const fc = [...cur.values()].filter((a) => a.family === f);
    const fp = [...prev.values()].filter((a) => a.family === f);
    const mobiles: MobilePromo[] = fc
      .filter((a) => a.mobile)
      .map((a) => {
        const spam = spamOf(a.mobile);
        const top = [...a.errors].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
        const hb = i.heartbeats && a.clientId && a.mobile ? (i.heartbeats.mobiles.get(`${a.clientId}|${a.mobile.slice(-4)}`) ?? null) : null;
        return {
          mobile: maskMobile(a.mobile),
          clientId: a.clientId,
          profile: a.profile,
          sent: a.sent,
          delivered: a.delivered,
          banned: a.banned,
          failed: a.failed,
          deliveryRate: ratio(a.delivered, a.sent),
          banRate: ratio(a.banned, a.sent),
          newDms: w.intraday && !i.extra ? null : a.newDms,
          topError: top ? { type: top[0], count: top[1] } : null,
          lastSendAt: a.lastAt !== null ? new Date(a.lastAt).toISOString() : null,
          lastDay: a.lastDay,
          spam,
          looksLimited: limitedCur(a),
          idle: f === 'promote' && assignedSet.has(key('promote', a.clientId, a.mobile)) && a.sent <= PROMO_LIMITS.IDLE_ASSIGNED_SENDS,
          heartbeat: hb,
          route24h: f === 'promote' && i.route && a.mobile ? (i.route.get(a.mobile) ?? null) : null,
        };
      })
      .sort((x, y) => y.sent - x.sent || String(x.clientId).localeCompare(String(y.clientId)) || String(x.mobile).localeCompare(String(y.mobile)));

    const promoteExtras = (aggs: Agg[]): Partial<Promo> =>
      f === 'promote'
        ? {
            incomingDms: w.intraday && !i.extra ? null : aggs.reduce((s, a) => s + a.newDms, 0),
            routesSent: hasRouted('routes_sent') ? aggs.reduce((s, a) => s + (a.routed.routes_sent ?? 0), 0) : null,
            routedReached: hasRouted('routed_reached') ? aggs.reduce((s, a) => s + (a.routed.routed_reached ?? 0), 0) : null,
          }
        : {};

    const totals: Promo = { ...promo(fc, scopedDms(i.dms.cur, f, client), w.window, limitedCur), ...promoteExtras(fc) };
    const previous: Promo | null = { ...promo(fp, scopedDms(i.dms.prev, f, client), w.window, limitedPrev), ...(f === 'promote' && !w.intraday ? promoteExtras(fp) : {}) };

    const ids = new Set<string>();
    for (const a of fc) if (a.clientId) ids.add(a.clientId);
    if (f === 'promote') for (const a of assigned) if (a.clientId) ids.add(a.clientId);
    if (f === 'tg-aut' && i.heartbeats) for (const id of i.heartbeats.engines.keys()) if (client === null || id === client) ids.add(id);
    const clients: ClientPromo[] = [...ids].map((id) => {
      const mine = fc.filter((a) => a.clientId === id);
      const last = mine.reduce<number | null>((m, a) => (a.lastAt !== null && (m === null || a.lastAt > m) ? a.lastAt : m), null);
      const row: ClientPromo = {
        clientId: id,
        name: i.names.get(id) ?? null,
        ...promo(mine, dmsOf(i.dms.cur, f, id), w.window, limitedCur),
        ...promoteExtras(mine),
        mobilesAssigned: f === 'promote' && i.assigned ? assigned.filter((a) => a.clientId === id).length : null,
        lastSendAt: last !== null ? new Date(last).toISOString() : null,
      };
      if (f === 'tg-aut') row.engine = i.heartbeats?.engines.get(id) ?? null;
      return row;
    });
    clients.sort((a, b) => b.sent - a.sent || a.clientId.localeCompare(b.clientId));
    families[f] = { totals, previous, clients, mobiles };
  }

  const sum = (k: 'sent' | 'delivered' | 'banned' | 'failed' | 'mobilesSending' | 'mobilesLimited') =>
    families['tg-aut'].totals[k] + families.promote.totals[k];
  const bothDms =
    families['tg-aut'].totals.dms === null || families.promote.totals.dms === null ? null : families['tg-aut'].totals.dms + families.promote.totals.dms;
  const both: Promo = {
    sent: sum('sent'),
    delivered: sum('delivered'),
    banned: sum('banned'),
    failed: sum('failed'),
    deliveryRate: ratio(sum('delivered'), sum('sent')),
    banRate: ratio(sum('banned'), sum('sent')),
    dms: bothDms,
    dmsPer100Delivered: bothDms === null || !sum('delivered') ? null : Math.round((bothDms / sum('delivered')) * 10000) / 100,
    mobilesSending: sum('mobilesSending'),
    mobilesLimited: sum('mobilesLimited'),
  };

  const unSends = rows.filter((r) => r.cur && !r.family).reduce((s, r) => s + r.sent, 0);
  const unDms = client === null ? (i.dms.cur?.unattributed ?? null) : null;
  const unattributed = unSends || unDms ? { sends: unSends, dms: unDms } : null;

  if (w.window === '24h') notes.push('24h: previous.dms is null (DMs are kept per IST day); mobiles[].newDms / incomingDms = today since IST midnight.');
  if (w.intraday) notes.push('today/24h sends come from promotion_send (per send); 7d/30d from daily_mobile (closed IST days).');
  else notes.push('7d/30d: topError is null (daily_mobile keeps no error types); lastDay = last IST day with a daily_mobile row.');
  if (w.range.from < '2026-10-25' || w.previousRange.from < '2026-10-25') {
    notes.push('Per-family DMs (conversion_event.service) start 2026-10-25; earlier DMs count only in unattributed.');
  }
  if (!i.routedCols.includes('routes_sent')) notes.push('routesSent/routedReached: history starts when counters ship (daily_mobile route columns not present yet).');
  notes.push(
    `looksLimited = sent >= ${PROMO_LIMITS.LIMITED_MIN_SENDS_TODAY} today (>= ${PROMO_LIMITS.LIMITED_MIN_SENDS_WINDOW} for 24h/7d/30d) with < ${PROMO_LIMITS.LIMITED_MAX_DELIVERED * 100}% delivered, or Redis spam state limited/harsh; previous.mobilesLimited uses the rate rule only.`,
  );
  notes.push('idle = an active promoteClients mobile with no sends in the window.');

  return { window: w.window, clientId: client, range: w.range, previousRange: w.previousRange, families, both, unattributed, notes };
}

/** Keys of the Redis batch for these mobiles: HGETALL tg::acct (all), HLEN/ZCARD route keys (promote). */
export function redisBatch(mobiles: string[], promoteMobiles: Set<string>): Array<['hgetall' | 'hlen' | 'zcard', string]> {
  const out: Array<['hgetall' | 'hlen' | 'zcard', string]> = [];
  for (const m of mobiles) {
    out.push(['hgetall', `tg::acct::${m}`]);
    if (promoteMobiles.has(m)) {
      out.push(['hlen', `promote::route::${m}`]);
      out.push(['zcard', `promote::routebacklog::${m}`]);
      out.push(['zcard', `promote::mainreply::${m}`]);
    }
  }
  return out;
}

/** Batch results → spam + route maps (same order as redisBatch). */
export function readBatch(
  mobiles: string[],
  promoteMobiles: Set<string>,
  results: unknown[],
): { spam: Map<string, SpamState | null>; route: Map<string, RouteState> } {
  const spam = new Map<string, SpamState | null>();
  const route = new Map<string, RouteState>();
  let i = 0;
  for (const m of mobiles) {
    spam.set(m, parseSpam(results[i++] as Record<string, string> | null));
    if (promoteMobiles.has(m)) {
      route.set(m, { pending: num(results[i++]), backlog: num(results[i++]), mainReplies: num(results[i++]) });
    }
  }
  return { spam, route };
}

/** Previous closed-day range start for 7d/30d (prevRange.from) and current start; used by the hist query. */
export function histBounds(w: PromoWindows): { prevFrom: string; curFrom: string; to: string } {
  return { prevFrom: w.previousRange.from, curFrom: w.range.from, to: addDays(w.today, -1) };
}

// ---------------------------------------------------------------- funnel by origin (design-v2 P3)

export type Origin = 'direct' | 'routed' | 'unattributed';
export interface OriginNumbers {
  newUsers: number | null;
  payers: number | null;
  revenue: number | null;
}

/**
 * New users / payers / revenue by origin for one scope (id null = fleet). direct/routed new users =
 * attributed DMs of service t / p; unattributed = the rest of `newUsers` (floored at 0). Payers and
 * revenue: credits whose (chat, client) had a first attributed DM of that service (origin map);
 * everything else is unattributed. Payers distinct by chat, clean credits only (as revenueBy).
 */
export function funnelOrigins(
  credits: Credit[] | null,
  dms: FamSplit<number> | null,
  newUsers: number | null,
  origin: Map<string, string | null> | null,
  id: string | null,
): Record<Origin, OriginNumbers> {
  const direct = dms ? (id === null ? dms.total['tg-aut'] : (dms.byClient.get(id)?.['tg-aut'] ?? 0)) : null;
  const routed = dms ? (id === null ? dms.total.promote : (dms.byClient.get(id)?.promote ?? 0)) : null;
  const rest = newUsers === null || direct === null || routed === null ? null : Math.max(0, newUsers - direct - routed);
  const money = { direct: { chats: new Set<string>(), revenue: 0 }, routed: { chats: new Set<string>(), revenue: 0 }, unattributed: { chats: new Set<string>(), revenue: 0 } };
  const ok = !!credits && !!origin;
  if (ok) {
    for (const c of credits!) {
      if (id !== null && c.client !== id) continue;
      const o = c.client ? origin!.get(`${c.chat}|${c.client}`) : undefined;
      const k: Origin = o === 't' ? 'direct' : o === 'p' ? 'routed' : 'unattributed';
      money[k].revenue += c.revenue;
      if (c.clean) money[k].chats.add(c.chat);
    }
  }
  const out = (k: Origin, n: number | null): OriginNumbers => ({
    newUsers: n,
    payers: ok ? money[k].chats.size : null,
    revenue: ok ? money[k].revenue : null,
  });
  return { direct: out('direct', direct), routed: out('routed', routed), unattributed: out('unattributed', rest) };
}
