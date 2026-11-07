/**
 * accountRoleEvents writer (tg-platform docs/design/2026-11-07-account-collection-split.md, step S1).
 *
 * An append-only history of every change of an account's role: enrolled into a pool, ready, became a client's main,
 * swapped out, returned to the pool, retired (inactive), reactivated. Today nothing records which account was main
 * when, or why it left (clients.swappedAt keeps only the latest time); this collection closes that gap.
 *
 * S1 is ADDITIVE:
 *   - every producer keeps its existing writes; this is one extra insert AFTER the real write succeeded;
 *   - nothing reads it yet (no reader switched, no field removed);
 *   - NEVER throws and never delays the caller: `recordAccountRoleEventSoon` is fire-and-forget, and the insert races
 *     a CLIENT-SIDE deadline (insertOne ignores maxTimeMS), so a stalled socket cannot hold anything;
 *   - a failure is logged once at warn and dropped (history is best-effort; the pool docs stay the truth).
 *
 * Indexes ({mobile:1, at:-1, _id:-1}, {clientId:1, at:-1, _id:-1}, and the partial unique {opId:1, event:1, mobile:1}
 * on docs that carry an opId) are created by tg-platform packages/tg-db/src/collections/account-role-events.repository.ts
 * (ensureAllIndexes, on process start). A duplicate of the same operation's event (E11000 on that unique index) is
 * dropped silently and counts as success.
 * MIRROR: the document shape (ACCOUNT_ROLE_EVENT_VERSION, field names, event names, reason codes and the reason
 * classifier) must stay identical to that repository's AccountRoleEventDocument / classifyRoleEventReason. Change both
 * together.
 */
import { maskMobile } from '../monitor/monitor-util';
import { normalizeMobileInput } from '../shared/mobile-utils';

export const ACCOUNT_ROLE_EVENTS_COLLECTION = 'accountRoleEvents';
/**
 * Stays 1: opId / reasonCode / details.permanent were added before any v1 row was written (S1 never shipped without
 * them). Readers must still tolerate a row without reasonCode (treat it as 'other') and without opId.
 */
export const ACCOUNT_ROLE_EVENT_VERSION = 1;
/** Client-side cap on the insert (a stalled socket must not hold a promise open for long). */
export const ACCOUNT_ROLE_EVENT_DEADLINE_MS = 3_000;
const REASON_MAX = 200;
const DETAIL_STRING_MAX = 120;
const OP_ID_MAX = 100;

export type AccountRoleEventName =
  | 'enrolled'
  | 'ready'
  | 'became_main'
  | 'swapped_out'
  | 'returned'
  | 'retired'
  | 'reactivated'
  | 'parked'
  | 'unparked';

export type AccountRolePool = 'buffer' | 'promote' | 'main';

/** Machine-readable cause, next to the free-text `reason`. MIRROR of tg-platform ACCOUNT_ROLE_REASON_CODES. */
export const ACCOUNT_ROLE_REASON_CODES = [
  'spam_harsh', 'spam_limited', 'deactivated_user', 'auth_error', 'refill', 'rescue', 'manual', 'warmup', 'enrolment',
  'status_change', 'other',
] as const;
export type AccountRoleReasonCode = typeof ACCOUNT_ROLE_REASON_CODES[number];
const REASON_CODE_SET: ReadonlySet<string> = new Set(ACCOUNT_ROLE_REASON_CODES);

/**
 * Free-text reason -> reason code. Order matters: the rescue / refill markers win over the error text they carry
 * ('DEAD_MAIN_RESCUE: USER_DEACTIVATED' is a rescue). `fallback` when nothing matches. MIRROR of tg-platform
 * classifyRoleEventReason.
 */
export function classifyRoleEventReason(reason: unknown, fallback: AccountRoleReasonCode = 'other'): AccountRoleReasonCode {
  const text = typeof reason === 'string' ? reason : '';
  if (/DEAD_MAIN_RESCUE/i.test(text)) return 'rescue';
  if (/POOL_REFILL/i.test(text)) return 'refill';
  if (/harsh/i.test(text)) return 'spam_harsh';
  if (/\blimited\b|limited until|spam.?limit/i.test(text)) return 'spam_limited';
  if (/USER_DEACTIVATED|PHONE_NUMBER_BANNED|USER_DELETED|account (?:is )?(?:deleted|banned)/i.test(text)) return 'deactivated_user';
  if (/AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED|SESSION_PASSWORD_NEEDED|UNAUTHORIZED/i.test(text)) return 'auth_error';
  return fallback;
}

/**
 * parkedAccounts stopReason -> reason code of the `unparked` event (the exact stopReason goes to details.stopReason):
 *   harsh -> spam_harsh; peer_flood -> spam_limited; session_missing -> auth_error; inactive -> status_change;
 *   everything else (became_main, superseded, reloaded, in_use, reassigned, age_expired, shared_key, flood_cap,
 *   transient_cap, permanent_error: no RPC text on the episode) -> other.
 * MIRROR of tg-platform unparkedReasonCode. Change both together.
 */
export function unparkedReasonCode(stopReason: unknown): AccountRoleReasonCode {
  switch (stopReason) {
    case 'harsh': return 'spam_harsh';
    case 'peer_flood': return 'spam_limited';
    case 'session_missing': return 'auth_error';
    case 'inactive': return 'status_change';
    default: return 'other';
  }
}

export type AccountRoleEventDetails = Record<string, string | number | boolean | null>;

export interface AccountRoleEventInput {
  mobile: string;
  clientId?: string | null;
  event: AccountRoleEventName;
  pool?: AccountRolePool | null;
  /** Producer id, `<app>:<site>` (e.g. 'cms:cutover'). */
  by: string;
  reason?: string | null;
  /** Explicit code; when absent or unknown the builder derives one from `reason` (classifyRoleEventReason). */
  reasonCode?: AccountRoleReasonCode | null;
  /**
   * Links the events of one operation (a cutover's became_main + swapped_out + the old main's return). Unique per
   * (opId, event, mobile): a repeat of the same operation's event is dropped.
   */
  opId?: string | null;
  fromMobile?: string | null;
  toMobile?: string | null;
  fromClientId?: string | null;
  /** Small scalars only (tier, days, status, availableDate). Never a session, password or token. */
  details?: AccountRoleEventDetails;
}

export interface AccountRoleEventsCollection {
  insertOne(doc: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface AccountRoleEventLogger {
  warn(message: string, meta?: unknown): void;
}

/** 'duplicate' = the same operation's event already exists (E11000 on the opId index); a success, not logged. */
export type AccountRoleEventResult = 'written' | 'duplicate' | 'failed' | 'skipped';

export interface AccountRoleEventOptions {
  logger?: AccountRoleEventLogger;
  deadlineMs?: number;
  now?: () => Date;
}

/** Keys that must never land in a history row, even if a caller passes them in `details`. */
const FORBIDDEN_DETAIL_KEY = /session|password|token|secret|2fa/i;

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.substring(0, max) : null;
}

function cleanMobile(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = normalizeMobileInput(String(value));
  return normalized || null;
}

function cleanDetails(details: AccountRoleEventDetails | undefined): AccountRoleEventDetails | null {
  if (!details || typeof details !== 'object') return null;
  const out: AccountRoleEventDetails = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') { if (Number.isFinite(value)) out[key] = value; }
    else if (typeof value === 'string') out[key] = value.substring(0, DETAIL_STRING_MAX);
  }
  return Object.keys(out).length ? out : null;
}

/** The stored document (no `_id`: the driver adds an ObjectId). Null when the input has no usable mobile/event/by. */
export function buildAccountRoleEvent(input: AccountRoleEventInput, at: Date): Record<string, unknown> | null {
  const mobile = cleanMobile(input?.mobile);
  const by = cleanString(input?.by, 60);
  if (!mobile || !input?.event || !by) return null;
  const doc: Record<string, unknown> = {
    v: ACCOUNT_ROLE_EVENT_VERSION,
    mobile,
    clientId: cleanString(input.clientId, 80),
    event: input.event,
    pool: input.pool ?? null,
    at,
    by,
    reason: cleanString(input.reason, REASON_MAX),
    reasonCode: input.reasonCode && REASON_CODE_SET.has(input.reasonCode) ? input.reasonCode : classifyRoleEventReason(input.reason),
  };
  const opId = cleanString(input.opId, OP_ID_MAX);
  if (opId) doc.opId = opId;
  const fromMobile = cleanMobile(input.fromMobile);
  const toMobile = cleanMobile(input.toMobile);
  const fromClientId = cleanString(input.fromClientId, 80);
  const details = cleanDetails(input.details);
  if (fromMobile) doc.fromMobile = fromMobile;
  if (toMobile) doc.toMobile = toMobile;
  if (fromClientId) doc.fromClientId = fromClientId;
  if (details) doc.details = details;
  return doc;
}

/** E11000 (code, codeName or message: some topologies surface it only in text). MIRROR of tg-core isDuplicateKeyError. */
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

/** Append one event. Never throws; resolves within the deadline. */
export async function recordAccountRoleEvent(
  collection: AccountRoleEventsCollection | null | undefined,
  input: AccountRoleEventInput,
  options: AccountRoleEventOptions = {},
): Promise<AccountRoleEventResult> {
  try {
    if (!collection || typeof collection.insertOne !== 'function') return 'skipped';
    const doc = buildAccountRoleEvent(input, options.now ? options.now() : new Date());
    if (!doc) return 'skipped';
    await withDeadline(
      Promise.resolve().then(() => collection.insertOne(doc)),
      options.deadlineMs ?? ACCOUNT_ROLE_EVENT_DEADLINE_MS,
      `${ACCOUNT_ROLE_EVENTS_COLLECTION}.insertOne`,
    );
    return 'written';
  } catch (error) {
    if (isDuplicateKey(error)) return 'duplicate';
    try {
      options.logger?.warn(`accountRoleEvents: ${input?.event ?? '?'} for ${maskMobile(input?.mobile) ?? '?'} not recorded (the role change itself is unaffected)`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch { /* a broken logger must not throw either */ }
    return 'failed';
  }
}

/** Fire-and-forget form for producers: returns immediately, never rejects. */
export function recordAccountRoleEventSoon(
  collection: AccountRoleEventsCollection | null | undefined,
  input: AccountRoleEventInput,
  options: AccountRoleEventOptions = {},
): void {
  void recordAccountRoleEvent(collection, input, options).catch(() => undefined);
}

/** `model.db.collection('accountRoleEvents')`, or null when the model has no db handle (tests, broken wiring). */
export function accountRoleEventsCollectionOf(model: unknown): AccountRoleEventsCollection | null {
  try {
    const db = (model as { db?: { collection?: (name: string) => unknown } } | null | undefined)?.db;
    if (!db || typeof db.collection !== 'function') return null;
    const collection = db.collection(ACCOUNT_ROLE_EVENTS_COLLECTION) as AccountRoleEventsCollection | null;
    return collection && typeof collection.insertOne === 'function' ? collection : null;
  } catch {
    return null;
  }
}
