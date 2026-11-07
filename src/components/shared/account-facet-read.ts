/**
 * Reader switch of the account collection split (tg-platform docs/design/2026-11-07-account-collection-split.md, S2
 * "Readers to switch"; reader ids R1-R16 are that table's). One env flag per facet, read per call (no DB read):
 *
 *   ACCOUNT_HEALTH_READ / ACCOUNT_WARMUP_READ / ACCOUNT_MEMBERSHIP_READ / ACCOUNT_IDENTITY_READ
 *     off (default; unset, empty or ANY other value = off, fail closed): today's reads only, the facet collection
 *         is never queried.
 *     shadow: the reader returns the old value; the facet doc is read in the background (no added latency) and the
 *         would-be result compared; kinds counted (accountFacetReadStats), differences logged at most once per reader
 *         and kind per minute (a benign kind never starves a mismatch line), mobile masked.
 *     on: the reader uses the facet value, merged with the old fields by the parity rules (old value whenever the
 *         facet doc is missing, invalid, older, or disagrees at the same verdict time; old value on a read error).
 *   <FLAG>_READERS = list of reader ids (e.g. "R7" or "r8; R9 R7"; comma, semicolon or whitespace separated, trimmed,
 *     case-insensitive): when set, the facet flag applies only to those readers, so readers can move one per deploy
 *     with their own rollback (design S2 exit gate). Unset = every reader. Set but with no ids ("", " ", ",") = NO
 *     reader (fail closed). CMS readers: R2 buildBufferSupplyPlan (R1 = its projection), R3 tier-1/2 candidate re-check,
 *     R4 adjustSupplyDateForPoolState (R10 = its projection), R5 degraded tiers 3/4, R6 pool-return availableDate,
 *     R7 isSpamSafeForSwap, R8 readMainState.limited, R9 currentMeetsTier1.
 *
 * Rollback: unset the flag (or set it to off) and restart the service.
 * MIRROR of tg-platform packages/tg-db/src/collections/account-facet-read.ts (same parsing and merge rule; the
 * tg-platform test tests/unit/packages/tg-db/account-facet-read.test.mjs transpiles this file and compares both).
 * Keep this file free of imports other than maskMobile (that test stubs only that one).
 */
import { maskMobile } from '../monitor/monitor-util';

export type AccountFacetName = 'health' | 'warmup' | 'membership' | 'identity';
export type AccountFacetReadMode = 'off' | 'shadow' | 'on';

export const ACCOUNT_FACET_READ_ENV: Readonly<Record<AccountFacetName, string>> = {
  health: 'ACCOUNT_HEALTH_READ',
  warmup: 'ACCOUNT_WARMUP_READ',
  membership: 'ACCOUNT_MEMBERSHIP_READ',
  identity: 'ACCOUNT_IDENTITY_READ',
};

export const ACCOUNT_FACET_READ_MAX_TIME_MS = 2_000;
export const ACCOUNT_FACET_READ_DEADLINE_MS = 2_500;
/** At most one shadow warn per facet + reader + kind in this window. */
export const ACCOUNT_FACET_SHADOW_LOG_EVERY_MS = 60_000;

type EnvLike = Record<string, string | undefined>;

export function accountFacetReadMode(facet: AccountFacetName, reader: string, env: EnvLike = process.env): AccountFacetReadMode {
  const key = ACCOUNT_FACET_READ_ENV[facet];
  const raw = String(env[key] ?? '').trim().toLowerCase();
  const mode: AccountFacetReadMode = raw === 'on' ? 'on' : raw === 'shadow' ? 'shadow' : 'off';
  if (mode === 'off') return 'off';
  const list = env[`${key}_READERS`];
  if (list === undefined || list === null) return mode;
  const readers = String(list).split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return readers.includes(String(reader).trim().toUpperCase()) ? mode : 'off';
}

// ---- counters + rate-limited shadow log ----

export type AccountHealthCompareKind = 'equal' | 'newerInHealth' | 'newerInOld' | 'missingInHealth' | 'mismatch';
export type AccountFacetReadCounter = AccountHealthCompareKind | 'differs' | 'readError';
export type AccountFacetReadStats = Record<string, Record<string, Record<AccountFacetReadCounter, number>>>;

export interface AccountFacetReadLogger {
  warn(message: string, meta?: unknown): void;
}

const stats: AccountFacetReadStats = {};
const lastLogAt = new Map<string, number>();
const pendingShadow = new Set<Promise<void>>();

function counters(facet: AccountFacetName, reader: string): Record<AccountFacetReadCounter, number> {
  const byReader = (stats[facet] ??= {});
  return (byReader[reader] ??= { equal: 0, newerInHealth: 0, newerInOld: 0, missingInHealth: 0, mismatch: 0, differs: 0, readError: 0 });
}

export function accountFacetReadStats(): AccountFacetReadStats {
  return JSON.parse(JSON.stringify(stats)) as AccountFacetReadStats;
}

/** Tests only. */
export function resetAccountFacetReadStats(): void {
  for (const k of Object.keys(stats)) delete stats[k];
  lastLogAt.clear();
}

/** Tests only: waits for the background shadow comparisons started so far. */
export async function flushAccountFacetShadowReads(): Promise<void> {
  while (pendingShadow.size > 0) await Promise.all([...pendingShadow]);
}

function logRateLimited(logger: AccountFacetReadLogger | undefined, facet: AccountFacetName, reader: string, kind: AccountFacetReadCounter, now: number, message: string): void {
  const key = `${facet}:${reader}:${kind}`;
  const last = lastLogAt.get(key);
  if (last !== undefined && now - last < ACCOUNT_FACET_SHADOW_LOG_EVERY_MS) return;
  lastLogAt.set(key, now);
  try {
    logger?.warn(`[account-facet-read] ${facet} ${reader}: ${message}; counts ${JSON.stringify(counters(facet, reader))}`);
  } catch { /* a broken logger must not break the reader */ }
}

// ---- value helpers (MIRROR of tg-db account-facet-common: normalizeFacetMobile, facetToDate, withFacetDeadline) ----

function normalizeMobile(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  const normalized = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return normalized || null;
}

function toMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms (client-side deadline)`)), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---- accountHealth (S2) ----

export const ACCOUNT_HEALTH_READ_COLLECTION = 'accountHealth';
const HEALTH_STATUSES: ReadonlySet<string> = new Set(['free', 'limited', 'harsh']);

/** The health facts a reader decides on. verdictAtMs = last verdict (freshness); statusSinceMs = status-change time
 * (harsh rest anchor). From the pool doc both are its spamCheckedAt (today: last verdict). */
export interface AccountHealthView {
  spamStatus: string | null;
  limitedUntilMs: number | null;
  verdictAtMs: number | null;
  statusSinceMs: number | null;
  source: 'pool' | 'accountHealth';
}

export type AccountHealthPoolFields = { spamStatus?: unknown; limitedUntil?: unknown; spamCheckedAt?: unknown } | null | undefined;

export function healthViewFromPool(doc: AccountHealthPoolFields): AccountHealthView {
  const at = toMs(doc?.spamCheckedAt);
  return {
    spamStatus: typeof doc?.spamStatus === 'string' && doc.spamStatus ? doc.spamStatus : null,
    limitedUntilMs: toMs(doc?.limitedUntil),
    verdictAtMs: at,
    statusSinceMs: at,
    source: 'pool',
  };
}

/**
 * Pool-shaped health fields of a view, for a reader that takes a pool doc (pure functions, query-built
 * candidates): spamCheckedAt = the view's LAST VERDICT (the pool doc's meaning today), not the status-change time;
 * epoch ms become Dates, nulls stay null. Callers use it only for views from accountHealth (on mode), so off /
 * shadow / fallback keep handing the pool doc itself to today's expressions.
 */
export function poolHealthFields(view: AccountHealthView): { spamStatus: string | null; limitedUntil: Date | null; spamCheckedAt: Date | null } {
  return {
    spamStatus: view.spamStatus,
    limitedUntil: view.limitedUntilMs === null ? null : new Date(view.limitedUntilMs),
    spamCheckedAt: view.verdictAtMs === null ? null : new Date(view.verdictAtMs),
  };
}

/** On-mode merge of one pool view with its accountHealth doc (parity rules; see the tg-db MIRROR for the table). */
export function chooseAccountHealthView(old: AccountHealthView, facet: Record<string, unknown> | null | undefined): { kind: AccountHealthCompareKind; view: AccountHealthView } {
  const status = facet && typeof facet.spamStatus === 'string' && HEALTH_STATUSES.has(facet.spamStatus) ? facet.spamStatus : null;
  const verdictAtMs = facet ? toMs(facet.verdictAt) : null;
  if (!facet || !status || verdictAtMs === null) return { kind: 'missingInHealth', view: old };
  const statusChangeMs = toMs(facet.spamCheckedAt);
  const view: AccountHealthView = {
    spamStatus: status,
    limitedUntilMs: toMs(facet.limitedUntil),
    verdictAtMs,
    statusSinceMs: statusChangeMs ?? verdictAtMs,
    source: 'accountHealth',
  };
  const oldAt = old.verdictAtMs;
  if (!old.spamStatus || oldAt === null) return { kind: 'newerInHealth', view };
  const sameVerdict = verdictAtMs === oldAt || statusChangeMs === oldAt;
  if (!sameVerdict) return verdictAtMs > oldAt ? { kind: 'newerInHealth', view } : { kind: 'newerInOld', view: old };
  if (status !== old.spamStatus) return { kind: 'mismatch', view: old };
  if (status === 'limited' && view.limitedUntilMs !== old.limitedUntilMs) {
    return verdictAtMs > oldAt ? { kind: 'newerInHealth', view } : { kind: 'mismatch', view: old };
  }
  return { kind: 'equal', view };
}

function sameView(a: AccountHealthView, b: AccountHealthView): boolean {
  return a.spamStatus === b.spamStatus && a.limitedUntilMs === b.limitedUntilMs && a.verdictAtMs === b.verdictAtMs && a.statusSinceMs === b.statusSinceMs;
}

/** The slice of a native collection the reader uses (model.db.collection(...)). */
export interface AccountFacetReadCollection {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): { toArray(): Promise<Record<string, unknown>[]> };
}

/** `model.db.collection(name)` with a `find`, or null (tests, broken wiring). Never throws. */
export function accountFacetReadCollectionOf(model: unknown, name: string): AccountFacetReadCollection | null {
  try {
    const db = (model as { db?: { collection?: (n: string) => unknown } } | null | undefined)?.db;
    if (!db || typeof db.collection !== 'function') return null;
    const collection = db.collection(name) as AccountFacetReadCollection | null;
    return collection && typeof collection.find === 'function' ? collection : null;
  } catch {
    return null;
  }
}

export interface AccountHealthReadEntry {
  mobile: unknown;
  doc: AccountHealthPoolFields;
}

export interface AccountFacetReadOptions {
  env?: EnvLike;
  mode?: AccountFacetReadMode;
  logger?: AccountFacetReadLogger;
  now?: () => number;
  deadlineMs?: number;
}

async function readHealthDocs(collection: AccountFacetReadCollection | null | undefined, ids: string[], deadlineMs: number): Promise<Map<string, Record<string, unknown>>> {
  if (!collection || typeof collection.find !== 'function') throw new Error('no accountHealth handle');
  const docs = await withDeadline(
    Promise.resolve().then(() => collection.find(
      { _id: { $in: ids } },
      { projection: { spamStatus: 1, limitedUntil: 1, verdictAt: 1, spamCheckedAt: 1 }, maxTimeMS: ACCOUNT_FACET_READ_MAX_TIME_MS },
    ).toArray()),
    deadlineMs,
    `${ACCOUNT_HEALTH_READ_COLLECTION}.find`,
  );
  return new Map(docs.map((d) => [String(d._id), d]));
}

/**
 * The health views per entry (same order) for several readers that share one pool read (R8 + R9), with ONE
 * accountHealth read. Each reader gets its own mode (flag + _READERS): off and shadow readers get the pool views; on
 * readers the merged views; counters and shadow logs are per reader. No query when every reader is off; shadow-only
 * compares in the background. A read error or a missing handle gives the pool views. Never throws.
 */
export async function resolveAccountHealthViewsByReader(
  collection: AccountFacetReadCollection | null | undefined,
  readers: readonly string[],
  entries: AccountHealthReadEntry[],
  options: AccountFacetReadOptions = {},
): Promise<Record<string, AccountHealthView[]>> {
  const old = entries.map((e) => healthViewFromPool(e.doc));
  const result: Record<string, AccountHealthView[]> = {};
  const modes = new Map<string, AccountFacetReadMode>();
  for (const reader of readers) {
    result[reader] = old;
    const mode = options.mode ?? accountFacetReadMode('health', reader, options.env ?? process.env);
    if (mode !== 'off' && entries.length > 0) modes.set(reader, mode);
  }
  if (modes.size === 0) return result;
  const now = options.now ?? Date.now;
  const mobiles = entries.map((e) => normalizeMobile(e.mobile));
  const ids = [...new Set(mobiles.filter((m): m is string => m !== null))];

  const compare = async (): Promise<void> => {
    let docs: Map<string, Record<string, unknown>>;
    try {
      docs = ids.length > 0 ? await readHealthDocs(collection, ids, options.deadlineMs ?? ACCOUNT_FACET_READ_DEADLINE_MS) : new Map();
    } catch (error) {
      for (const reader of modes.keys()) {
        counters('health', reader).readError++;
        logRateLimited(options.logger, 'health', reader, 'readError', now(), `accountHealth read failed (${errorText(error)}); old fields used`);
      }
      return;
    }
    for (const [reader, mode] of modes) {
      const c = counters('health', reader);
      const views = old.map((o, i) => {
        const m = mobiles[i];
        const { kind, view } = chooseAccountHealthView(o, m ? docs.get(m) : null);
        c[kind]++;
        const differs = !sameView(view, o);
        if (differs) c.differs++;
        if (mode === 'shadow' && (differs || kind === 'mismatch' || kind === 'newerInOld' || kind === 'missingInHealth')) {
          logRateLimited(options.logger, 'health', reader, kind, now(),
            `${kind} for ${maskMobile(m ?? '') ?? '?'}: old ${JSON.stringify(o)} on-mode ${JSON.stringify(view)}`);
        }
        return view;
      });
      if (mode === 'on') result[reader] = views;
    }
  };

  if (![...modes.values()].includes('on')) {
    const p: Promise<void> = compare().then(() => undefined, () => undefined).finally(() => { pendingShadow.delete(p); });
    pendingShadow.add(p);
    return result;
  }
  try {
    await compare();
  } catch { /* result keeps the pool views */ }
  return result;
}

/**
 * The health view per entry (same order) for reader `reader`. off: the pool views, no query. shadow: the pool views at
 * once; the comparison runs in the background. on: the merged views; a read error or a missing handle returns the
 * pool views. Never throws.
 */
export async function resolveAccountHealthViews(
  collection: AccountFacetReadCollection | null | undefined,
  reader: string,
  entries: AccountHealthReadEntry[],
  options: AccountFacetReadOptions = {},
): Promise<AccountHealthView[]> {
  return (await resolveAccountHealthViewsByReader(collection, [reader], entries, options))[reader];
}

/** One mobile: resolveAccountHealthViews for a single pool doc. */
export async function resolveAccountHealthView(
  collection: AccountFacetReadCollection | null | undefined,
  reader: string,
  mobile: unknown,
  doc: AccountHealthPoolFields,
  options: AccountFacetReadOptions = {},
): Promise<AccountHealthView> {
  return (await resolveAccountHealthViews(collection, reader, [{ mobile, doc }], options))[0];
}
