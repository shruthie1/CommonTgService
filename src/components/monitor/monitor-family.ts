/**
 * The two promotion families (design-v2 §2): tg-aut (buffer/main accounts promoting directly) and
 * promote (promote-clients accounts routing users to the main account). Postgres names them three ways:
 * daily_client/daily_mobile.namespace 'tg-aut' | 'promote-clients', promotion_send/conversion_event.service
 * 't' | 'p' (NULL before 2026-10-25), heartbeat svc 'tg-aut' | 'promote'. Pure functions only.
 */
import { num } from './monitor-util';

export type Family = 'tg-aut' | 'promote';
export const FAMILIES: readonly Family[] = ['tg-aut', 'promote'];

/** Family of a namespace / service / heartbeat svc value; null = not attributed (e.g. service NULL). */
export function familyOf(v: unknown): Family | null {
  const s = v === null || v === undefined ? '' : String(v);
  if (s === 'tg-aut' || s === 't') return 'tg-aut';
  if (s === 'promote-clients' || s === 'promote' || s === 'p') return 'promote';
  return null;
}

/** Per-family numbers added to fleet / previous / clients[] / daily[] (null = source unavailable). */
export interface FamilyMetrics {
  sends: number | null;
  sendSuccess: number | null;
  banned: number | null;
  failed: number | null;
  dms: number | null;
}
export type ByFamily = Record<Family, FamilyMetrics>;

export interface FamSend {
  sent: number;
  delivered: number;
  banned: number;
  failed: number;
}
const zero = (): FamSend => ({ sent: 0, delivered: 0, banned: 0, failed: 0 });
const perFam = <T>(f: () => T): Record<Family, T> => ({ 'tg-aut': f(), promote: f() });

export interface FamSplit<T> {
  total: Record<Family, T>;
  byClient: Map<string, Record<Family, T>>;
  /** Rows that name no family (service NULL): counted in the merged numbers only. */
  unattributed: T;
}

interface SendLike {
  client_id?: string | null;
  namespace?: string | null;
  service?: string | null;
  sent?: unknown;
  delivered?: unknown;
  banned?: unknown;
  failed?: unknown;
}

/** Sends per family (fleet + per client) of rows passing `keep`; family read from row[`field`]. */
export function sendsByFamily<R extends SendLike>(rows: R[], field: 'namespace' | 'service', keep: (r: R) => boolean = () => true): FamSplit<FamSend> {
  const total = perFam(zero);
  const byClient = new Map<string, Record<Family, FamSend>>();
  const unattributed = zero();
  const add = (a: FamSend, r: SendLike) => {
    a.sent += num(r.sent);
    a.delivered += num(r.delivered);
    a.banned += num(r.banned);
    a.failed += num(r.failed);
  };
  for (const r of rows) {
    if (!keep(r)) continue;
    const fam = familyOf(r[field]);
    if (!fam) {
      add(unattributed, r);
      continue;
    }
    add(total[fam], r);
    if (!r.client_id) continue;
    const e = byClient.get(r.client_id) ?? perFam(zero);
    add(e[fam], r);
    byClient.set(r.client_id, e);
  }
  return { total, byClient, unattributed };
}

/** Sends per family per IST date (daily_client rows) for one scope (client id, or null = all). */
export function sendsByFamilyDate(rows: Array<SendLike & { d: string }>, scope: string | null): Map<string, Record<Family, FamSend>> {
  const out = new Map<string, Record<Family, FamSend>>();
  for (const r of rows) {
    if (scope !== null && r.client_id !== scope) continue;
    const fam = familyOf(r.namespace);
    if (!fam) continue;
    const e = out.get(r.d) ?? perFam(zero);
    e[fam].sent += num(r.sent);
    e[fam].delivered += num(r.delivered);
    e[fam].banned += num(r.banned);
    e[fam].failed += num(r.failed);
    out.set(r.d, e);
  }
  return out;
}

interface DmsDayLike {
  d: string;
  client_id: string | null;
  service?: string | null;
  g?: unknown;
  dms: unknown;
}

const isServiceRow = (r: DmsDayLike) => r.g !== undefined && r.g !== null && num(r.g) === 0;

/** DMs per family over from <= d <= to, from the per-service (g = 0) rows of dms_hist. */
export function dmsFamilyDays(rows: DmsDayLike[], from: string, to: string): FamSplit<number> {
  const total = perFam(() => 0);
  const byClient = new Map<string, Record<Family, number>>();
  let unattributed = 0;
  for (const r of rows) {
    if (!isServiceRow(r) || r.d < from || r.d > to) continue;
    const fam = familyOf(r.service);
    const n = num(r.dms);
    if (!fam) {
      unattributed += n;
      continue;
    }
    total[fam] += n;
    if (!r.client_id) continue;
    const e = byClient.get(r.client_id) ?? perFam(() => 0);
    e[fam] += n;
    byClient.set(r.client_id, e);
  }
  return { total, byClient, unattributed };
}

/** DMs per family per date for one scope, from the per-service rows of dms_hist. */
export function dmsFamilyByDate(rows: DmsDayLike[], scope: string | null): Map<string, Record<Family, number>> {
  const out = new Map<string, Record<Family, number>>();
  for (const r of rows) {
    if (!isServiceRow(r) || (scope !== null && r.client_id !== scope)) continue;
    const fam = familyOf(r.service);
    if (!fam) continue;
    const e = out.get(r.d) ?? perFam(() => 0);
    e[fam] += num(r.dms);
    out.set(r.d, e);
  }
  return out;
}

/** Distinct conversions per family among raw DM rows with ts < before (and passing `keep`). */
export function dmsFamilyRows(
  rows: Array<{ client_id: string | null; conversion_id: string; ts: Date | string; service?: string | null }>,
  before = Number.POSITIVE_INFINITY,
  keep: (r: { client_id: string | null }) => boolean = () => true,
): FamSplit<number> {
  const all = perFam(() => new Set<string>());
  const per = new Map<string, Record<Family, Set<string>>>();
  const un = new Set<string>();
  for (const r of rows) {
    if (new Date(r.ts).getTime() >= before || !keep(r)) continue;
    const fam = familyOf(r.service);
    if (!fam) {
      un.add(r.conversion_id);
      continue;
    }
    all[fam].add(r.conversion_id);
    if (!r.client_id) continue;
    const e = per.get(r.client_id) ?? perFam(() => new Set<string>());
    e[fam].add(r.conversion_id);
    per.set(r.client_id, e);
  }
  const byClient = new Map<string, Record<Family, number>>();
  for (const [k, v] of per) byClient.set(k, { 'tg-aut': v['tg-aut'].size, promote: v.promote.size });
  return { total: { 'tg-aut': all['tg-aut'].size, promote: all.promote.size }, byClient, unattributed: un.size };
}

/**
 * ByFamily from a send split and a DM split. `id` undefined = fleet total, else that client (0 when
 * the client has no rows). A null split leaves its fields null.
 */
export function byFamily(sends: FamSplit<FamSend> | null, dms: FamSplit<number> | null, id?: string): ByFamily {
  const pick = <T>(s: FamSplit<T> | null): Record<Family, T> | null | undefined =>
    s ? (id === undefined ? s.total : s.byClient.get(id)) : null;
  const s = pick(sends);
  const d = pick(dms);
  const one = (f: Family): FamilyMetrics => ({
    sends: sends ? (s?.[f].sent ?? 0) : null,
    sendSuccess: sends ? (s?.[f].delivered ?? 0) : null,
    banned: sends ? (s?.[f].banned ?? 0) : null,
    failed: sends ? (s?.[f].failed ?? 0) : null,
    dms: dms ? (d?.[f] ?? 0) : null,
  });
  return { 'tg-aut': one('tg-aut'), promote: one('promote') };
}

/** ByFamily of one date from per-date maps (null map = source unavailable for that date). */
export function byFamilyOfDate(
  sends: Map<string, Record<Family, FamSend>> | null,
  dms: Map<string, Record<Family, number>> | null,
  date: string,
): ByFamily {
  const s = sends?.get(date);
  const d = dms?.get(date);
  const one = (f: Family): FamilyMetrics => ({
    sends: sends ? (s?.[f].sent ?? 0) : null,
    sendSuccess: sends ? (s?.[f].delivered ?? 0) : null,
    banned: sends ? (s?.[f].banned ?? 0) : null,
    failed: sends ? (s?.[f].failed ?? 0) : null,
    dms: dms ? (d?.[f] ?? 0) : null,
  });
  return { 'tg-aut': one('tg-aut'), promote: one('promote') };
}
