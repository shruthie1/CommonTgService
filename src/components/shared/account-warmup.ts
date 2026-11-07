/**
 * accountWarmup writer (tg-platform docs/design/2026-11-07-account-collection-split.md, step S3 facet F3).
 *
 * Where one pool doc is in the 20-25 day warmup (warmupPhase, jitter, step times, update attempts) plus the health-check
 * maintenance stamps lastChecked / lastHealthCheckAttemptAt (S2 decision D-b moved them here from accountHealth).
 * One doc per POOL DOC, `_id` = `<pool>:<mobile>`: these fields are written per pool doc and read per pool
 * (selectHealthCheckCandidates / orderSessionRotatedOldestCheckedFirst / healthCheckFailedRecently in
 * base-client.service.ts query one pool model together with its status / warmupPhase / inUse).
 *
 * S3 is ADDITIVE (dual-write only):
 *   - every producer keeps its pool-doc write; this mirrors the AFTER doc (a snapshot, not the delta), fire-and-forget;
 *   - nothing reads it yet (no reader switched, no field removed, no backfill run);
 *   - NEVER throws and never delays the caller: `recordAccountWarmupSoon` returns at once, and the write races a
 *     CLIENT-SIDE deadline;
 *   - a failure is logged once at warn (mobile masked) and dropped.
 * Stale-write guard on the pool doc's own `updatedAt` (stored as `sourceUpdatedAt`): applied only when the stored one is
 * <= the incoming one (or absent); a late older snapshot hits E11000 on `_id`, the one no-upsert retry reports 'stale'.
 *
 * No secondary index (lookups by `_id`). A write creates the collection.
 * MIRROR: the write shape (ACCOUNT_WARMUP_VERSION, ACCOUNT_WARMUP_FIELDS, pools, buildAccountWarmupWrite) must stay
 * identical to tg-platform packages/tg-db/src/collections/account-warmup.repository.ts. Change both together;
 * tg-platform tests/unit/packages/tg-db/account-warmup.test.mjs diffs both builders over the same inputs.
 */
import { maskMobile } from '../monitor/monitor-util';

export const ACCOUNT_WARMUP_COLLECTION = 'accountWarmup';
export const ACCOUNT_WARMUP_VERSION = 1;
/** Client-side cap on one write including its single retry. */
export const ACCOUNT_WARMUP_DEADLINE_MS = 3_000;

export const ACCOUNT_FACET_POOLS = ['buffer', 'promote'] as const;
export type AccountFacetPool = typeof ACCOUNT_FACET_POOLS[number];
const POOL_SET: ReadonlySet<string> = new Set(ACCOUNT_FACET_POOLS);

/** Pool-doc fields mirrored (dates unless listed below). twoFASetAt / otherAuthsRemovedAt are credentials (not split). */
export const ACCOUNT_WARMUP_FIELDS = [
  'warmupPhase', 'warmupJitter', 'enrolledAt',
  'privacyUpdatedAt', 'profilePicsDeletedAt', 'nameBioUpdatedAt', 'usernameUpdatedAt', 'profilePicsUpdatedAt',
  'organicActivityAt', 'lastUpdateAttempt', 'failedUpdateAttempts', 'lastUpdateFailure',
  'lastChecked', 'lastHealthCheckAttemptAt',
] as const;
const NUMBER_FIELDS: ReadonlySet<string> = new Set(['warmupJitter', 'failedUpdateAttempts']);
const STRING_FIELDS: ReadonlySet<string> = new Set(['warmupPhase']);

export interface AccountPoolFacetInput {
  mobile?: string | number | null;
  pool: string | null | undefined;
  /** Producer id, `<app>:<site>`. */
  by: string;
  /** The pool doc AFTER the write (full doc, not a projection). Its `updatedAt` is the stale-write guard. */
  doc: Record<string, unknown> | null | undefined;
}

export interface AccountFacetWrite {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
}

/** 'stale' = a newer snapshot is stored (guard held). Only 'failed' is logged. */
export type AccountFacetWriteResult = 'written' | 'stale' | 'failed' | 'skipped';

/** The slice of a native driver collection the writers use (model.db.collection(...)). */
export interface AccountFacetCollection {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface AccountFacetLogger {
  warn(message: string, meta?: unknown): void;
}

export interface AccountFacetOptions {
  logger?: AccountFacetLogger;
  deadlineMs?: number;
  now?: () => Date;
}

/** Shared value helpers of the three facet builders (exported for account-membership.ts / account-identity.ts). */
export function facetCleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.substring(0, max) : null;
}

/** Canonical mobile (pool docs' form): trimmed, no leading '+'. */
export function normalizeFacetMobile(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  const normalized = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return normalized || null;
}

export function facetToDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function fieldValue(field: string, value: unknown): unknown {
  if (NUMBER_FIELDS.has(field)) return typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (STRING_FIELDS.has(field)) return facetCleanString(value, 40);
  return facetToDate(value);
}

/**
 * The guarded snapshot write for one pool doc. Null when there is nothing valid to write (no mobile / pool / producer /
 * doc, or a doc without a valid updatedAt). Absent / invalid fields are stored as null. MIRROR of tg-db
 * buildAccountWarmupWrite.
 */
export function buildAccountWarmupWrite(input: AccountPoolFacetInput, now: Date): AccountFacetWrite | null {
  const doc = input?.doc;
  if (!doc || typeof doc !== 'object') return null;
  const mobile = normalizeFacetMobile(input.mobile ?? doc.mobile);
  const pool = typeof input.pool === 'string' && POOL_SET.has(input.pool) ? input.pool : null;
  const by = facetCleanString(input.by, 60);
  const sourceUpdatedAt = facetToDate(doc.updatedAt);
  if (!mobile || !pool || !by || !sourceUpdatedAt) return null;
  const set: Record<string, unknown> = { v: ACCOUNT_WARMUP_VERSION, mobile, pool };
  for (const field of ACCOUNT_WARMUP_FIELDS) set[field] = fieldValue(field, doc[field]);
  set.sourceUpdatedAt = sourceUpdatedAt;
  set.by = by;
  set.updatedAt = now;
  return {
    filter: { _id: `${pool}:${mobile}`, $or: [{ sourceUpdatedAt: { $lte: sourceUpdatedAt } }, { sourceUpdatedAt: null }] },
    update: { $set: set },
  };
}

/** E11000 (code, codeName or message). MIRROR of tg-core isDuplicateKeyError. */
function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; codeName?: unknown; message?: unknown };
  return e.code === 11000 || e.code === '11000' || e.codeName === 'DuplicateKey' || (typeof e.message === 'string' && e.message.includes('E11000'));
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms (client-side deadline)`)), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Guarded upsert + one no-upsert retry on E11000, bounded by a client-side deadline. Never throws. Shared by the three
 * S3 snapshot facets (warmup, membership, identity); `label` names the collection in the warn.
 */
export async function recordAccountFacetWrite(
  collection: AccountFacetCollection | null | undefined,
  label: string,
  build: () => AccountFacetWrite | null,
  mobileForLog: unknown,
  options: AccountFacetOptions = {},
): Promise<AccountFacetWriteResult> {
  try {
    if (!collection || typeof collection.updateOne !== 'function') return 'skipped';
    const write = build();
    if (!write) return 'skipped';
    // Server-side maxTimeMS = the client-side deadline, so the server gives up too.
    const deadlineMs = options.deadlineMs ?? ACCOUNT_WARMUP_DEADLINE_MS;
    const attempt = async (): Promise<AccountFacetWriteResult> => {
      try {
        await collection.updateOne(write.filter, write.update, { upsert: true, maxTimeMS: deadlineMs });
        return 'written';
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const retry = (await collection.updateOne(write.filter, write.update, { maxTimeMS: deadlineMs })) as { matchedCount?: number } | undefined;
        return (retry?.matchedCount ?? 0) > 0 ? 'written' : 'stale';
      }
    };
    return await withDeadline(Promise.resolve().then(attempt), deadlineMs, `${label}.updateOne`);
  } catch (error) {
    try {
      options.logger?.warn(`${label}: snapshot for ${maskMobile(String(mobileForLog ?? '')) ?? '?'} not mirrored (the pool-doc write is unaffected)`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch { /* a broken logger must not throw either */ }
    return 'failed';
  }
}

/** One guarded write. Never throws; resolves within the deadline. */
export function recordAccountWarmup(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): Promise<AccountFacetWriteResult> {
  return recordAccountFacetWrite(
    collection, ACCOUNT_WARMUP_COLLECTION,
    () => buildAccountWarmupWrite(input, options.now ? options.now() : new Date()),
    input?.mobile ?? input?.doc?.mobile, options,
  );
}

/** Fire-and-forget form for producers: returns immediately, never rejects. */
export function recordAccountWarmupSoon(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): void {
  try {
    void recordAccountWarmup(collection, input, options).catch(() => undefined);
  } catch { /* never throws */ }
}

/** `model.db.collection(name)`, or null when the model has no db handle (tests, broken wiring). */
export function accountFacetCollectionOf(model: unknown, name: string): AccountFacetCollection | null {
  try {
    const db = (model as { db?: { collection?: (name: string) => unknown } } | null | undefined)?.db;
    if (!db || typeof db.collection !== 'function') return null;
    const collection = db.collection(name) as AccountFacetCollection | null;
    return collection && typeof collection.updateOne === 'function' ? collection : null;
  } catch {
    return null;
  }
}
