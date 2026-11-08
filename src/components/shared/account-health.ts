/**
 * accountHealth writer (tg-platform docs/design/2026-11-07-account-collection-split.md, step S2 + "S2 review fixes").
 *
 * One SpamBot verdict per account, `_id` = canonical mobile, for buffer and promote alike. Today the verdict sits on
 * bufferClients (spamStatus / limitedUntil / spamCheckedAt / spamCheckSource), in tg-platform's Redis
 * tg::acct::{mobile}, and nowhere for promote accounts in Mongo.
 *
 * S2 is ADDITIVE (dual-write only):
 *   - every producer keeps its existing write; this mirrors it AFTER, fire-and-forget;
 *   - nothing reads it yet (no reader switched, no field removed, no backfill run);
 *   - NEVER throws and never delays the caller: `recordAccountHealthSoon` returns at once, and the write races a
 *     CLIENT-SIDE deadline, so a stalled socket cannot hold anything;
 *   - a failure is logged once at warn (mobile masked) and dropped.
 *
 * CMS producer: BufferClientService.update() / create() whenever a spam field is written (PATCH / PUT /bufferclients;
 * the swap SpamBot probe in clients/client.service.ts isSpamSafeForSwap passes by 'cms:swap-probe'). The pool
 * health-check stamps (lastChecked / lastHealthCheckAttemptAt) are not health facts and stay on the pool docs.
 *
 * Two times (tg-platform docs/design/2026-10-30-unified-account-health.md §2.5 / C17): `verdictAt` = this verdict's
 * time and the stale-write guard (applied only when the stored verdictAt is <= the incoming one, or absent);
 * `spamCheckedAt` = the time the status last changed (kept while a verdict repeats the stored status, so a repeat harsh
 * does not restart the 30-day rest). The update is an aggregation pipeline because it reads the stored status. A newer
 * stored doc makes the guarded upsert hit E11000 on `_id`; the writer retries once without upsert (match = it lost an
 * insert race and is applied; no match = 'stale', not logged). daysLeft is not stored (2026-11-08): it is derived
 * from status + limitedUntil; old docs keep their daysLeft / daysLeftBy values, nothing unsets them.
 *
 * No secondary index (lookups by `_id`). A write creates the collection.
 * MIRROR: the write shape (ACCOUNT_HEALTH_VERSION, field names, statuses, buildAccountHealthWrite) must stay identical
 * to tg-platform packages/tg-db/src/collections/account-health.repository.ts. Change both together; tg-platform
 * tests/unit/packages/tg-db/account-health.test.mjs diffs both builders over the same inputs.
 */
import { maskMobile } from '../monitor/monitor-util';

export const ACCOUNT_HEALTH_COLLECTION = 'accountHealth';
export const ACCOUNT_HEALTH_VERSION = 1;
/** Client-side cap on one write including its single retry. */
export const ACCOUNT_HEALTH_DEADLINE_MS = 3_000;
/** Server-side cap per accountHealth update (review L9), under the client-side deadline above. */
export const ACCOUNT_HEALTH_OP_MAX_TIME_MS = 2_500;

export const ACCOUNT_HEALTH_SPAM_STATUSES = ['free', 'limited', 'harsh'] as const;
export type AccountHealthSpamStatus = typeof ACCOUNT_HEALTH_SPAM_STATUSES[number];
const STATUS_SET: ReadonlySet<string> = new Set(ACCOUNT_HEALTH_SPAM_STATUSES);

export type AccountHealthTime = Date | number | string | null | undefined;

export interface AccountHealthVerdictInput {
  spamStatus: string | null | undefined;
  /** Kept only for `limited`; free / harsh store null. */
  limitedUntil?: AccountHealthTime;
  /** The time of this verdict; the stale-write guard. spamCheckedAt (status-change time) is derived from it. */
  verdictAt: AccountHealthTime;
  /** 'tg-aut' | 'promote' | 'cms-probe' (the existing spamCheckSource / tg::acct source values). */
  spamCheckSource: string | null | undefined;
}

export interface AccountHealthInput {
  mobile: string | number | null | undefined;
  /** Producer id, `<app>:<site>`. */
  by: string;
  verdict?: AccountHealthVerdictInput | null;
}

export interface AccountHealthWrite {
  filter: Record<string, unknown>;
  /** Aggregation-pipeline update (reads the stored spamStatus / spamCheckedAt). */
  update: Record<string, unknown>[];
}

/** 'stale' = a newer verdict is stored (guard held). Only 'failed' is logged. */
export type AccountHealthWriteResult = 'written' | 'stale' | 'failed' | 'skipped';

/** The slice of a native driver collection the writer uses (model.db.collection(...)). */
export interface AccountHealthCollection {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown>;
}

export interface AccountHealthLogger {
  warn(message: string, meta?: unknown): void;
}

export interface AccountHealthOptions {
  logger?: AccountHealthLogger;
  deadlineMs?: number;
  now?: () => Date;
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.substring(0, max) : null;
}

/** Canonical mobile (pool docs' form): trimmed, no leading '+'. MIRROR of tg-db normalizeAccountHealthMobile. */
function normalizeAccountHealthMobile(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  const normalized = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return normalized || null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

/**
 * The guarded pipeline update for one verdict. Null when there is nothing valid to write (no mobile / producer / verdict,
 * an unknown status, no verdict time, no source). Strings go in as `$literal` (a pipeline would read a leading `$` as a
 * field path). MIRROR of tg-db buildAccountHealthWrite.
 */
export function buildAccountHealthWrite(input: AccountHealthInput, now: Date): AccountHealthWrite | null {
  const mobile = normalizeAccountHealthMobile(input?.mobile);
  const by = cleanString(input?.by, 60);
  const verdict = input?.verdict;
  if (!mobile || !by || !verdict) return null;
  const spamStatus = typeof verdict.spamStatus === 'string' && STATUS_SET.has(verdict.spamStatus) ? verdict.spamStatus : null;
  const verdictAt = toDate(verdict.verdictAt);
  const spamCheckSource = cleanString(verdict.spamCheckSource, 40);
  if (!spamStatus || !verdictAt || !spamCheckSource) return null;
  const set: Record<string, unknown> = {
    v: ACCOUNT_HEALTH_VERSION,
    spamStatus: { $literal: spamStatus },
    limitedUntil: spamStatus === 'limited' ? toDate(verdict.limitedUntil) : null,
    // Status-change time: the stored one while the status repeats (expressions read the doc BEFORE this stage).
    spamCheckedAt: { $cond: [{ $eq: ['$spamStatus', { $literal: spamStatus }] }, { $ifNull: ['$spamCheckedAt', verdictAt] }, verdictAt] },
    verdictAt,
    spamCheckSource: { $literal: spamCheckSource },
    spamCheckBy: { $literal: by },
    updatedAt: now,
  };
  return {
    // `verdictAt: null` also matches a doc without the field.
    filter: { _id: mobile, $or: [{ verdictAt: { $lte: verdictAt } }, { verdictAt: null }] },
    update: [{ $set: set }],
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

/** One guarded write. Never throws; resolves within the deadline. */
export async function recordAccountHealth(
  collection: AccountHealthCollection | null | undefined,
  input: AccountHealthInput,
  options: AccountHealthOptions = {},
): Promise<AccountHealthWriteResult> {
  try {
    if (!collection || typeof collection.updateOne !== 'function') return 'skipped';
    const write = buildAccountHealthWrite(input, options.now ? options.now() : new Date());
    if (!write) return 'skipped';
    const attempt = async (): Promise<AccountHealthWriteResult> => {
      try {
        await collection.updateOne(write.filter, write.update, { upsert: true, maxTimeMS: ACCOUNT_HEALTH_OP_MAX_TIME_MS });
        return 'written';
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // The doc exists but did not match: a newer verdict (stale) or a lost insert race. Once more, without upsert.
        const retry = (await collection.updateOne(write.filter, write.update, { maxTimeMS: ACCOUNT_HEALTH_OP_MAX_TIME_MS })) as { matchedCount?: number } | undefined;
        return (retry?.matchedCount ?? 0) > 0 ? 'written' : 'stale';
      }
    };
    return await withDeadline(
      Promise.resolve().then(attempt),
      options.deadlineMs ?? ACCOUNT_HEALTH_DEADLINE_MS,
      `${ACCOUNT_HEALTH_COLLECTION}.updateOne`,
    );
  } catch (error) {
    try {
      options.logger?.warn(`accountHealth: verdict for ${maskMobile(String(input?.mobile ?? '')) ?? '?'} not mirrored (the existing health write is unaffected)`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch { /* a broken logger must not throw either */ }
    return 'failed';
  }
}

/** Fire-and-forget form for producers: returns immediately, never rejects. */
export function recordAccountHealthSoon(
  collection: AccountHealthCollection | null | undefined,
  input: AccountHealthInput,
  options: AccountHealthOptions = {},
): void {
  void recordAccountHealth(collection, input, options).catch(() => undefined);
}

/** `model.db.collection('accountHealth')`, or null when the model has no db handle (tests, broken wiring). */
export function accountHealthCollectionOf(model: unknown): AccountHealthCollection | null {
  try {
    const db = (model as { db?: { collection?: (name: string) => unknown } } | null | undefined)?.db;
    if (!db || typeof db.collection !== 'function') return null;
    const collection = db.collection(ACCOUNT_HEALTH_COLLECTION) as AccountHealthCollection | null;
    return collection && typeof collection.updateOne === 'function' ? collection : null;
  } catch {
    return null;
  }
}
