/**
 * GET /monitor/reactions (reactions-tab design §3-§4): reaction outcomes per family, client and mobile.
 * Pure: the service loads the parts (daily_mobile per mobile, shared with /monitor/promotions; daily_client
 * per day, shared with the fleet pages; Redis reactions::* per mobile; heartbeats; Mongo activeChannels)
 * and this module turns them into the response. Mobiles are masked here.
 */
import { FAMILIES, Family, familyOf } from './monitor-family';
import type { HeartbeatMobile, PromoHeartbeats, PromoWindows } from './monitor-promotions';
import { addDays, DateRange, datesBetween } from './monitor-time';
import { DAILY_MOBILE_FROM, maskMobile, num, ratio } from './monitor-util';

export type ReactWindow = 'today' | '7d' | '30d';
export const REACT_WINDOWS: ReactWindow[] = ['today', '7d', '30d'];

/** Same values as tg-chats src/monitor/thresholds.ts REACT (owner defaults 2026-10-29). */
export const REACT_LIMITS = {
  /** mirror of tg-reactions ReactionTypes.ts HOURLY_REACTION_LIMIT (the app does not report it) */
  HOURLY_CAP: 150,
  /** reactions in the last hour at or above this = "at cap" (idle by design, not a fault) */
  CAPPED_AT: 145,
  SUCCESS_WARN: 0.7,
  SUCCESS_BAD: 0.5,
  RESTRICTED_WARN: 0.25,
  RESTRICTED_BAD: 0.4,
  FLOODS_PER_DAY_WARN: 10,
  FLOODS_PER_DAY_BAD: 30,
  /** process up (heartbeat) but no reaction for at least this long = silent */
  SILENT_MIN_HOURS: 2,
} as const;

/** Reaction data in daily_client starts 2026-09-18 (non-zero rows, probe 2026-10-29). */
export const REACTIONS_DAILY_CLIENT_FROM = '2026-09-18';

export interface ReactCounts {
  success: number;
  restricted: number;
  failed: number;
  floods: number;
}

export interface React extends ReactCounts {
  /** success + restricted + failed (a flood is a wait signal, not an attempt outcome) */
  attempts: number;
  successRate: number | null;
  restrictedRate: number | null;
  /** floods / (mobiles reacting × days in the window); null when no mobile count (today's previous) */
  floodsPerMobileDay: number | null;
  /** mobiles with at least one success; null when the source has no per-mobile grain */
  mobilesReacting: number | null;
}

export type ClientReact = React & { clientId: string; name: string | null; mobiles: number; lastDay: string | null };

export interface ReactLive {
  /** ZCOUNT reactions::hourly::<m> over the last hour */
  lastHour: number;
  capped: boolean;
  /** ZCOUNT reactions::floods::<m> over the last hour */
  floodsLastHour: number;
  /** now - reactions::state lastReactionAt (persisted at most every 10 min) */
  lastReactionAgeSec: number | null;
  /** reactions::state floodReleaseAt when still in the future */
  pausedUntil: string | null;
  timeoutPauses: number | null;
  /** HLEN reactions::restricted::<m> (channels restricted at runtime, 1 day TTL) */
  restrictedChannels: number;
}

export interface MobileReact extends ReactCounts {
  mobile: string | null;
  clientId: string | null;
  profile: string | null;
  successRate: number | null;
  restrictedRate: number | null;
  floodsPerDay: number;
  lastDay: string | null;
  /** promotion sends / ban rate of the same mobile in the window (daily_mobile, 7d/30d only) */
  promoSent: number | null;
  promoBanRate: number | null;
  live: ReactLive | null;
  heartbeat: HeartbeatMobile | null;
  /** process up (heartbeat) but nothing in the last hour and no reaction for SILENT_MIN_HOURS */
  silent: boolean;
}

export interface FamilyReact {
  totals: React;
  previous: React | null;
  clients: ClientReact[];
  mobiles: MobileReact[];
}

export interface ReactNow {
  reactionsLastHour: number;
  mobilesReacting: number;
  mobilesCapped: number;
  floodsLastHour: number;
  mobilesPaused: number;
}

export interface ReactDay extends ReactCounts {
  day: string;
  family: Family;
}

/** One (current?, family, client, mobile) row of daily_mobile reaction (and promotion) sums. */
export interface ReactRow extends ReactCounts {
  cur: boolean;
  family: Family | null;
  clientId: string | null;
  mobile: string | null;
  profile: string | null;
  lastDay: string | null;
  promoSent: number;
  promoBanned: number;
}

const isTrue = (v: unknown) => v === true || v === 't' || v === 'true';
const counts = (r: any): ReactCounts => ({
  success: num(r.reactions_success),
  restricted: num(r.reactions_restricted),
  failed: num(r.reactions_failed),
  floods: num(r.reactions_floods),
});

/** promo_mobiles_hist rows (7d / 30d, current and previous range). */
export function reactRowsFromHist(rows: any[]): ReactRow[] {
  return rows.map((r) => ({
    cur: isTrue(r.cur),
    family: familyOf(r.namespace),
    clientId: r.client_id ?? null,
    mobile: r.mobile ? String(r.mobile) : null,
    profile: r.profile ? String(r.profile) : null,
    lastDay: r.last_day ? String(r.last_day) : null,
    promoSent: num(r.sent),
    promoBanned: num(r.banned),
    ...counts(r),
  }));
}

/** promo_mobiles_today rows (today). */
export function reactRowsFromToday(rows: any[], today: string): ReactRow[] {
  return rows.map((r) => {
    const c = counts(r);
    return {
      cur: true,
      family: familyOf(r.namespace),
      clientId: r.client_id ?? null,
      mobile: r.mobile ? String(r.mobile) : null,
      profile: r.profile ? String(r.profile) : null,
      lastDay: c.success + c.restricted + c.failed + c.floods > 0 ? today : null,
      promoSent: 0,
      promoBanned: 0,
      ...c,
    };
  });
}

/** Redis reads for these mobiles (read-only, known keys, no SCAN): 4 commands per mobile, in order. */
export function reactRedisBatch(mobiles: string[], now: number): Array<['zcount' | 'hgetall' | 'hlen', string, ...Array<string | number>]> {
  const from = now - 3_600_000;
  const out: Array<['zcount' | 'hgetall' | 'hlen', string, ...Array<string | number>]> = [];
  for (const m of mobiles) {
    out.push(['zcount', `reactions::hourly::${m}`, from, '+inf']);
    out.push(['zcount', `reactions::floods::${m}`, from, '+inf']);
    out.push(['hgetall', `reactions::state::${m}`]);
    out.push(['hlen', `reactions::restricted::${m}`]);
  }
  return out;
}

const fin = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Batch results → live state per (unmasked) mobile, same order as reactRedisBatch. */
export function readReactBatch(mobiles: string[], results: unknown[], now: number): Map<string, ReactLive> {
  const out = new Map<string, ReactLive>();
  let i = 0;
  for (const m of mobiles) {
    const lastHour = num(results[i++]);
    const floods = num(results[i++]);
    const h = (results[i++] ?? {}) as Record<string, string>;
    const restricted = num(results[i++]);
    const last = fin(h.lastReactionAt);
    const release = fin(h.floodReleaseAt);
    out.set(m, {
      lastHour,
      capped: lastHour >= REACT_LIMITS.CAPPED_AT,
      floodsLastHour: floods,
      lastReactionAgeSec: last !== null && last > 0 ? Math.max(0, Math.round((now - last) / 1000)) : null,
      pausedUntil: release !== null && release > now ? new Date(release).toISOString() : null,
      timeoutPauses: fin(h.reactionTimeoutPauses),
      restrictedChannels: restricted,
    });
  }
  return out;
}

/** Process up but not reacting: heartbeat seen, nothing in the last hour, last reaction >= SILENT_MIN_HOURS ago (or never). */
export function isSilent(hb: HeartbeatMobile | null, live: ReactLive | null): boolean {
  if (!hb || hb.connected === false || !live) return false;
  if (live.lastHour > 0) return false;
  return live.lastReactionAgeSec === null || live.lastReactionAgeSec >= REACT_LIMITS.SILENT_MIN_HOURS * 3600;
}

function react(c: ReactCounts, mobilesReacting: number | null, days: number): React {
  const attempts = c.success + c.restricted + c.failed;
  return {
    success: c.success,
    restricted: c.restricted,
    failed: c.failed,
    floods: c.floods,
    attempts,
    successRate: ratio(c.success, attempts),
    restrictedRate: ratio(c.restricted, attempts),
    floodsPerMobileDay: mobilesReacting ? Math.round((c.floods / (mobilesReacting * days)) * 100) / 100 : mobilesReacting === 0 ? 0 : null,
    mobilesReacting,
  };
}

const sumCounts = (xs: ReactCounts[]): ReactCounts =>
  xs.reduce((t, x) => ({ success: t.success + x.success, restricted: t.restricted + x.restricted, failed: t.failed + x.failed, floods: t.floods + x.floods }), {
    success: 0,
    restricted: 0,
    failed: 0,
    floods: 0,
  });

/** Per (day, family) from daily_client rows (with reaction columns) over from..to, optionally one client. */
export function reactDaily(dcRows: any[], from: string, to: string, client: string | null): ReactDay[] {
  const acc = new Map<string, ReactDay>();
  for (const d of datesBetween(from, to)) for (const f of FAMILIES) acc.set(`${d}|${f}`, { day: d, family: f, success: 0, restricted: 0, failed: 0, floods: 0 });
  for (const r of dcRows) {
    const day = String(r.d);
    const f = familyOf(r.namespace);
    if (!f || day < from || day > to) continue;
    if (client !== null && r.client_id !== client) continue;
    const a = acc.get(`${day}|${f}`)!;
    const c = counts(r);
    a.success += c.success;
    a.restricted += c.restricted;
    a.failed += c.failed;
    a.floods += c.floods;
  }
  return [...acc.values()];
}

export interface ReactInputs {
  w: PromoWindows;
  /** daily_mobile rows (today's, or both closed-day ranges) */
  rows: ReactRow[];
  /** today: yesterday's daily_client totals per family (previous); null = not loaded / not today */
  yesterday: Record<Family, ReactCounts> | null;
  /** 7d / 30d: daily_client per (day, family) over the window; null = unavailable */
  daily: ReactDay[] | null;
  /** live state per unmasked mobile; null = Redis unavailable */
  live: Map<string, ReactLive> | null;
  heartbeats: PromoHeartbeats | null;
  /** extra mobiles to list with zero counts (assigned promote, live tg-aut) */
  known: Array<{ family: Family; clientId: string | null; mobile: string }>;
  names: Map<string, string | null>;
  restrictedChannels: { total: number; byDay: Array<{ day: string; n: number }> } | null;
  client: string | null;
  now: number;
}

export interface ReactionsBody {
  window: ReactWindow;
  range: DateRange;
  previousRange: DateRange;
  scope: { client: string | null };
  /** today: hours since IST midnight (pace = success / hoursElapsed vs previous.success / 24) */
  hoursElapsed: number | null;
  families: Record<Family, FamilyReact>;
  both: React;
  fleet: { both: React; families: Record<Family, { totals: React }> } | null;
  daily: ReactDay[];
  now: ReactNow | null;
  restrictedChannels: { total: number; byDay: Array<{ day: string; n: number }> } | null;
  limits: typeof REACT_LIMITS;
  notes: string[];
}

const key = (f: Family, c: string | null, m: string | null) => `${f}|${c ?? ''}|${m ?? ''}`;

interface Agg extends ReactCounts {
  family: Family;
  clientId: string | null;
  mobile: string | null;
  profile: string | null;
  lastDay: string | null;
  promoSent: number;
  promoBanned: number;
}

function aggregate(rows: ReactRow[]): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.family) continue;
    const k = key(r.family, r.clientId, r.mobile);
    const a =
      out.get(k) ??
      ({ family: r.family, clientId: r.clientId, mobile: r.mobile, profile: null, lastDay: null, success: 0, restricted: 0, failed: 0, floods: 0, promoSent: 0, promoBanned: 0 } as Agg);
    a.success += r.success;
    a.restricted += r.restricted;
    a.failed += r.failed;
    a.floods += r.floods;
    a.promoSent += r.promoSent;
    a.promoBanned += r.promoBanned;
    if (r.profile) a.profile = r.profile;
    if (r.lastDay !== null && (a.lastDay === null || r.lastDay > a.lastDay)) a.lastDay = r.lastDay;
    out.set(k, a);
  }
  return out;
}

const windowDays = (w: PromoWindows) => (w.window === '30d' ? 30 : w.window === '7d' ? 7 : 1);

/** Family / client / mobile numbers for one scope (client null = fleet). */
function familiesFor(i: ReactInputs, client: string | null): Record<Family, FamilyReact> {
  const { w } = i;
  const days = windowDays(w);
  const inScope = (c: string | null) => client === null || c === client;
  const rows = i.rows.filter((r) => inScope(r.clientId));
  const cur = aggregate(rows.filter((r) => r.cur));
  const prev = aggregate(rows.filter((r) => !r.cur));
  for (const k of i.known) {
    if (!inScope(k.clientId)) continue;
    const id = key(k.family, k.clientId, k.mobile);
    if (!cur.has(id)) cur.set(id, { family: k.family, clientId: k.clientId, mobile: k.mobile, profile: null, lastDay: null, success: 0, restricted: 0, failed: 0, floods: 0, promoSent: 0, promoBanned: 0 });
  }
  const reacting = (aggs: Agg[]) => aggs.filter((a) => a.mobile && a.success > 0).length;

  const out = {} as Record<Family, FamilyReact>;
  for (const f of FAMILIES) {
    const fc = [...cur.values()].filter((a) => a.family === f);
    const fp = [...prev.values()].filter((a) => a.family === f);
    const mobiles: MobileReact[] = fc
      .filter((a) => a.mobile)
      .map((a) => {
        const live = i.live && a.mobile ? (i.live.get(a.mobile) ?? null) : null;
        const hb = i.heartbeats && a.clientId && a.mobile ? (i.heartbeats.mobiles.get(`${a.clientId}|${a.mobile.slice(-4)}`) ?? null) : null;
        const attempts = a.success + a.restricted + a.failed;
        return {
          mobile: maskMobile(a.mobile),
          clientId: a.clientId,
          profile: a.profile,
          success: a.success,
          restricted: a.restricted,
          failed: a.failed,
          floods: a.floods,
          successRate: ratio(a.success, attempts),
          restrictedRate: ratio(a.restricted, attempts),
          floodsPerDay: Math.round((a.floods / days) * 100) / 100,
          lastDay: a.lastDay,
          promoSent: w.intraday ? null : a.promoSent,
          promoBanRate: w.intraday ? null : ratio(a.promoBanned, a.promoSent),
          live,
          heartbeat: hb,
          silent: isSilent(hb, live),
        };
      })
      .sort((x, y) => y.success - x.success || String(x.clientId).localeCompare(String(y.clientId)) || String(x.mobile).localeCompare(String(y.mobile)));

    const totals = react(sumCounts(fc), reacting(fc), days);
    let previous: React | null;
    if (w.intraday) previous = i.yesterday ? react(i.yesterday[f], null, 1) : null;
    else previous = react(sumCounts(fp), reacting(fp), days);

    const ids = new Set<string>();
    for (const a of fc) if (a.clientId) ids.add(a.clientId);
    const clients: ClientReact[] = [...ids].map((id) => {
      const mine = fc.filter((a) => a.clientId === id);
      const last = mine.reduce<string | null>((m, a) => (a.lastDay !== null && (m === null || a.lastDay > m) ? a.lastDay : m), null);
      return { clientId: id, name: i.names.get(id) ?? null, ...react(sumCounts(mine), reacting(mine), days), mobiles: mine.filter((a) => a.mobile).length, lastDay: last };
    });
    clients.sort((a, b) => b.success - a.success || a.clientId.localeCompare(b.clientId));
    out[f] = { totals, previous, clients, mobiles };
  }
  return out;
}

function bothOf(fams: Record<Family, FamilyReact>, days: number): React {
  const t = fams['tg-aut'].totals;
  const p = fams.promote.totals;
  const m = t.mobilesReacting === null || p.mobilesReacting === null ? null : t.mobilesReacting + p.mobilesReacting;
  return react(sumCounts([t, p]), m, days);
}

export function buildReactions(i: ReactInputs): ReactionsBody {
  const { w, client } = i;
  const days = windowDays(w);
  const families = familiesFor(i, client);
  const both = bothOf(families, days);
  let fleet: ReactionsBody['fleet'] = null;
  if (client !== null) {
    const ff = familiesFor(i, null);
    fleet = { both: bothOf(ff, days), families: { 'tg-aut': { totals: ff['tg-aut'].totals }, promote: { totals: ff.promote.totals } } };
  }

  let now: ReactNow | null = null;
  if (i.live) {
    const mobiles = FAMILIES.flatMap((f) => families[f].mobiles);
    const lives = mobiles.map((m) => m.live).filter((l): l is ReactLive => !!l);
    now = {
      reactionsLastHour: lives.reduce((s, l) => s + l.lastHour, 0),
      mobilesReacting: lives.filter((l) => l.lastHour > 0).length,
      mobilesCapped: lives.filter((l) => l.capped).length,
      floodsLastHour: lives.reduce((s, l) => s + l.floodsLastHour, 0),
      mobilesPaused: lives.filter((l) => l.pausedUntil !== null).length,
    };
  }

  const notes: string[] = [];
  if (w.intraday) notes.push('today: counts since IST midnight (daily_mobile, ~5 min lag); previous = yesterday full day (daily_client), so compare rates and pace per hour, not counts.');
  else notes.push('7d/30d: closed IST days from daily_mobile; previous = the same number of days before.');
  const earliest = w.intraday ? w.range.from : w.previousRange.from;
  if (earliest < DAILY_MOBILE_FROM) notes.push(`Per-mobile reaction rows start ${DAILY_MOBILE_FROM} (daily_mobile); earlier days count as zero in totals and previous.`);
  if (!w.intraday && w.range.from < REACTIONS_DAILY_CLIENT_FROM) notes.push(`Daily reaction counters start ${REACTIONS_DAILY_CLIENT_FROM}.`);
  notes.push('restricted counts both reaction sends and message fetches refused with CHANNEL_RESTRICTED; floods are FLOOD_WAIT/PEER_FLOOD waits (not attempts).');
  notes.push(`capped = >= ${REACT_LIMITS.CAPPED_AT} reactions in the last hour (hourly cap ${REACT_LIMITS.HOURLY_CAP}, a code constant); silent = heartbeat up, nothing in the last hour and no reaction for ${REACT_LIMITS.SILENT_MIN_HOURS} h.`);
  notes.push('restrictedChannels: fleet-wide (activeChannels.reactRestricted), refreshed hourly; not filtered by client.');
  if (!i.live) notes.push('live state unavailable (Redis): now and mobiles[].live are null.');

  return {
    window: w.window as ReactWindow,
    range: w.range,
    previousRange: w.intraday ? { from: addDays(w.today, -1), to: addDays(w.today, -1) } : w.previousRange,
    scope: { client },
    hoursElapsed: w.intraday ? Math.round(((i.now - w.cur.start) / 3_600_000) * 100) / 100 : null,
    families,
    both,
    fleet,
    daily: w.intraday ? [] : (i.daily ?? []),
    now,
    restrictedChannels: i.restrictedChannels,
    limits: REACT_LIMITS,
    notes,
  };
}

/** Yesterday's daily_client reaction totals per family (today's previous), optionally one client. */
export function yesterdayTotals(dcRows: any[], day: string, client: string | null): Record<Family, ReactCounts> {
  const out: Record<Family, ReactCounts> = { 'tg-aut': { success: 0, restricted: 0, failed: 0, floods: 0 }, promote: { success: 0, restricted: 0, failed: 0, floods: 0 } };
  for (const d of reactDaily(dcRows, day, day, client)) {
    out[d.family] = { success: d.success, restricted: d.restricted, failed: d.failed, floods: d.floods };
  }
  return out;
}

/** activeChannels aggregate: total flagged + newly flagged per IST day since `since` (one $facet, one scan). */
export function restrictedChannelsPipeline(since: Date): object[] {
  return [
    { $match: { reactRestricted: true } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        byDay: [
          { $match: { reactRestrictedAt: { $gte: since } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$reactRestrictedAt', timezone: '+05:30' } }, n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];
}

export function readRestrictedChannels(rows: any[]): { total: number; byDay: Array<{ day: string; n: number }> } {
  const r = rows[0] ?? {};
  return {
    total: num(r.total?.[0]?.n),
    byDay: (r.byDay ?? []).filter((d: any) => d._id).map((d: any) => ({ day: String(d._id), n: num(d.n) })),
  };
}
