/**
 * Parked-responder swap episode (tg-platform docs/design/2026-11-05-parked-account-responder.md §7.3.2, P4).
 *
 * After a swap returned the OLD main to the buffer pool, CMS opens one `parkedAccounts` episode for it so the
 * client's tg-aut process can answer DMs that still arrive on the old account (one reply pointing at the new
 * main). CMS never connects the account for this: it only inserts the episode document.
 *
 *   - idempotent: `_id` = `tg-aut:{mobile}:{clients.swappedAt ms}`, the same key tg-aut's boot fallback derives
 *     (apps/tg-aut/src/adapters/parked.ts), so whichever producer writes first wins and the other gets `exists`;
 *   - another OPEN tg-aut episode of the same mobile (an older swap) is stopped as `superseded`, then the insert is
 *     retried (at most 3 tries); an UNEXPIRED open episode of ANOTHER app is left alone (the insert then ends
 *     `failed`); an expired one of any app is superseded (final review M1);
 *   - NEVER throws: every failure is logged and returned as `failed`; the swap has already happened;
 *   - bounded: every op races a CLIENT-SIDE deadline (insertOne ignores maxTimeMS, review nit P4), so a stalled
 *     socket cannot hold the caller; update/find also carry maxTimeMS;
 *   - `swapDays` (the rest CMS gave the old main on return) is stamped on the episode so tg-aut runs it at the
 *     limited pace while it rests (P4 review S1).
 *   - `cutoverOpId` (`<clientId>:<swappedAt ms>`, the accountRoleEvents opId of the cutover) links the episode to the
 *     cutover's became_main / swapped_out / returned events.
 *   - accountRoleEvents (split doc §4.2): `parked` when the insert really happened, `unparked` (stopReason
 *     superseded) for each older episode the supersede really closed; opId = the episode _id (a retry is dropped by
 *     the unique {opId, event, mobile} index). Fire-and-forget (3 s deadline), only when `roleEvents` is given.
 *
 *   - gated (final review M1): opens only while parkedControl enables tg-aut for the client (`tgAutParkedEnabled`);
 *     otherwise returns `disabled` and writes nothing.
 *   - review M5: on `exists` where tg-aut's boot fallback wrote the doc first (`createdBy: 'tg-aut'`), CMS's
 *     `swapDays` and `reason` are merged in, only where the doc lacks them (reason missing, empty, or tg-aut's
 *     placeholder 'swap'). One atomic pipeline update filtered on `_id` + `createdBy` (no read-then-write, no version
 *     bump, so a runner's version CAS is not disturbed). Best-effort: a failure is logged, the result stays `exists`.
 *
 * MIRROR: the document shape, the stop pipeline and the insert-retry must stay IDENTICAL to tg-platform
 * packages/tg-db/src/collections/parked-accounts.repository.ts (`openEpisode`, `stopPipeline`) and the
 * constants in packages/tg-parked/src/constants.ts (PARK_MAX_AGE_MS['tg-aut'] 7 d, FIRST_PASS_DELAY 10-15 min).
 * Change both together (field names, counters, GC window, version bump, `open` unset).
 */
import { AccountRoleEventsCollection, classifyRoleEventReason, recordAccountRoleEventSoon, unparkedReasonCode } from './account-role-events';
import { parkedMobileForms } from './parked-session-guard';
import { maskMobile } from '../monitor/monitor-util';

export const TGAUT_PARK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SWAP_FIRST_PASS_MIN_MS = 10 * 60 * 1000;
export const SWAP_FIRST_PASS_MAX_MS = 15 * 60 * 1000;
/** Server-side cap per Mongo update/find (insertOne does not honour maxTimeMS). */
export const SWAP_EPISODE_OP_MAX_TIME_MS = 5_000;
/** Client-side cap per Mongo op, insert included (P4 review nit). */
export const SWAP_EPISODE_OP_DEADLINE_MS = 6_000;
const PARKED_EPISODE_GC_MS = 30 * 24 * 60 * 60 * 1000;
const OPEN_RETRIES = 3;
const SUPERSEDE_LOOP_MAX = 10;

export interface SwapEpisodeCollection {
  insertOne(doc: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>[], options?: Record<string, unknown>): Promise<{ modifiedCount?: number }>;
  /** Driver >= 6 shape: the document (or null), not a ModifyResult. */
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

/** `parkedControl` (tg-platform ParkedControlRepository): docs `global`, `promote`, `tg-aut`. */
export interface SwapEpisodeControlCollection {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): { toArray(): Promise<unknown[]> };
}

export interface SwapEpisodeLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
}

export interface SwapEpisodeInput {
  /** The OLD main (returned to the pool), canonical form as on clients.mobile. */
  mobile: string;
  clientId: string;
  /** clients.dbcoll (userData.profile), for reach attribution. */
  persona: string;
  /** CMS swap reason ('POOL_REFILL', 'harsh', ...). */
  reason: string;
  /** clients.swappedAt written by the cutover commit (the episode anchor). */
  swappedAt: Date;
  /**
   * The rest (days) the old main got on its pool return (handleReplacedClient `days`). MIRROR: tg-platform
   * ParkedEpisodeDocument.swapDays / EpisodeRecord.swapDays (name and unit: days).
   */
  swapDays?: number;
}

/** `disabled`: parkedControl does not enable tg-aut for this client (or could not be read); nothing written. */
export type SwapEpisodeResult = 'inserted' | 'exists' | 'failed' | 'disabled';

/** `tg-aut:{mobile}:{swappedAtMs}` (tg-platform @tg/parked registry/episode-key.ts). */
export function swapEpisodeKey(mobile: string, swappedAt: Date): string {
  const ms = swappedAt instanceof Date ? swappedAt.getTime() : NaN;
  if (!Number.isFinite(ms)) throw new Error('swapEpisodeKey: invalid swappedAt');
  if (!mobile) throw new Error('swapEpisodeKey: empty mobile');
  return `tg-aut:${mobile}:${Math.trunc(ms)}`;
}

/** The cutover's accountRoleEvents opId (client.service.ts cutoverRoleEventOpId): `<clientId>:<swappedAt ms>`. */
export function swapCutoverOpId(clientId: string, swappedAt: Date): string {
  return `${clientId}:${Math.trunc(swappedAt.getTime())}`;
}

/** The episode document (tg-platform ParkedEpisodeDocument), state `pending`, version 0. */
export function buildSwapEpisode(input: SwapEpisodeInput, now: Date, random: () => number): Record<string, unknown> {
  const anchor = input.swappedAt.getTime();
  const delay = SWAP_FIRST_PASS_MIN_MS + Math.round((SWAP_FIRST_PASS_MAX_MS - SWAP_FIRST_PASS_MIN_MS) * random());
  return {
    _id: swapEpisodeKey(input.mobile, input.swappedAt),
    app: 'tg-aut',
    mobile: input.mobile,
    clientId: input.clientId,
    persona: input.persona,
    reason: input.reason,
    cutoverOpId: swapCutoverOpId(input.clientId, input.swappedAt),
    ...(typeof input.swapDays === 'number' && Number.isFinite(input.swapDays) && input.swapDays > 0 ? { swapDays: input.swapDays } : {}),
    liveSince: null,
    parkedAt: new Date(anchor),
    expiresAt: new Date(anchor + TGAUT_PARK_MAX_AGE_MS),
    nextRunAt: new Date(anchor + delay),
    createdBy: 'cms',
    open: true,
    state: 'pending',
    passes: 0,
    connectsToday: { day: '', n: 0 },
    transientCount: 0,
    emptyStreak: 0,
    repliesTotal: 0,
    repliesToday: { day: '', n: 0 },
    runner: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** MIRROR of tg-platform parked-accounts.repository.ts `stopPipeline('superseded')`. */
export function supersededStopPipeline(): Record<string, unknown>[] {
  return [
    {
      $set: {
        state: 'stopped',
        stopReason: { $literal: 'superseded' },
        stoppedAt: '$$NOW',
        updatedAt: '$$NOW',
        gcAt: { $add: ['$$NOW', PARKED_EPISODE_GC_MS] },
        runner: null,
        version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
      },
    },
    { $unset: ['open'] },
  ];
}

/**
 * Open episodes the new one may supersede: tg-aut ones, or any app's once expired (server clock; final review M1:
 * an episode nobody closed must not block the mobile forever). MIRROR: tg-platform parked-accounts.repository.ts
 * `supersedeFilter`. Change both together.
 */
export function swapSupersedeFilter(mobile: string, id: string): Record<string, unknown> {
  // Review M1: both stored forms (canonical, '+canonical'), as parked-session-guard.ts; the value as given otherwise.
  const forms = parkedMobileForms(mobile);
  return { mobile: { $in: forms.length ? forms : [mobile] }, open: true, _id: { $ne: id }, $or: [{ app: 'tg-aut' }, { $expr: { $lte: ['$expiresAt', '$$NOW'] } }] };
}

/** tg-aut's boot fallback writes this fixed reason (tg-platform apps/tg-aut/src/adapters/parked.ts). */
const TGAUT_FALLBACK_REASON = 'swap';

/**
 * Review M5: the update that merges CMS's swapDays / reason into a tg-aut-created episode, only where it lacks them.
 * Null when there is nothing to merge. Pipeline form so each field is decided on the stored value atomically.
 */
export function tgAutExistsMergePipeline(input: Pick<SwapEpisodeInput, 'reason' | 'swapDays'>): Record<string, unknown>[] | null {
  const set: Record<string, unknown> = {};
  if (typeof input.swapDays === 'number' && Number.isFinite(input.swapDays) && input.swapDays > 0) {
    set.swapDays = { $ifNull: ['$swapDays', { $literal: input.swapDays }] };
  }
  if (typeof input.reason === 'string' && input.reason) {
    set.reason = { $cond: [{ $in: [{ $ifNull: ['$reason', ''] }, ['', TGAUT_FALLBACK_REASON]] }, { $literal: input.reason }, '$reason'] };
  }
  return Object.keys(set).length ? [{ $set: set }] : null;
}

/**
 * One `unparked` event for an episode a stop really closed (`stopped` = the episode after the stop). MIRROR of
 * tg-platform ParkedAccountsRepository.recordUnparked (pool: promote episodes -> promote, tg-aut -> buffer).
 */
export function recordUnparked(
  roleEvents: AccountRoleEventsCollection | null | undefined,
  stopped: Record<string, unknown>,
  by: string,
  logger: { warn(message: string, meta?: unknown): void },
): void {
  try {
    const stopReason = typeof stopped.stopReason === 'string' ? stopped.stopReason : 'unknown';
    const app = typeof stopped.app === 'string' ? stopped.app : null;
    recordAccountRoleEventSoon(roleEvents, {
      mobile: String(stopped.mobile ?? ''), clientId: typeof stopped.clientId === 'string' ? stopped.clientId : null,
      event: 'unparked', pool: app === 'promote' ? 'promote' : app === 'tg-aut' ? 'buffer' : null, by,
      reason: stopReason, reasonCode: unparkedReasonCode(stopReason), opId: String(stopped._id ?? ''),
      details: { app, stopReason },
    }, { logger });
  } catch { /* history is best-effort */ }
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

function onIdIndex(error: unknown): boolean {
  const pattern = (error as { keyPattern?: Record<string, unknown> } | null)?.keyPattern;
  if (pattern) return '_id' in pattern;
  return /_id_/.test(String((error as Error | null)?.message ?? ''));
}

function describe(error: unknown): string {
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

/**
 * Final review M1: is the tg-aut parked path enabled for `clientId`? Enabled = `global.enabled === true` AND the
 * `tg-aut` doc's `enabled === true` AND (no `clientIds` array OR it includes clientId). A missing doc, a read error,
 * a timeout or no handle = NOT enabled (fail closed): an episode nobody runs would never close and would make the
 * parked-session guard skip heal/rotate/session on the old main until it expires.
 * MIRROR: tg-platform packages/tg-db/src/collections/parked-control.repository.ts `readState`. Change both together.
 */
export async function tgAutParkedEnabled(
  control: SwapEpisodeControlCollection | null | undefined,
  clientId: string,
  deadlineMs: number = SWAP_EPISODE_OP_DEADLINE_MS,
): Promise<{ enabled: boolean; error?: string }> {
  if (!control || typeof control.find !== 'function') return { enabled: false, error: 'no parkedControl handle' };
  try {
    const docs = await withDeadline(
      control.find({ _id: { $in: ['global', 'tg-aut'] } }, { maxTimeMS: SWAP_EPISODE_OP_MAX_TIME_MS }).toArray(),
      deadlineMs,
      'parkedControl.find',
    );
    const byId = new Map<unknown, Record<string, unknown>>();
    for (const d of docs) if (d && typeof d === 'object') byId.set((d as { _id?: unknown })._id, d as Record<string, unknown>);
    const app = byId.get('tg-aut');
    if (byId.get('global')?.enabled !== true || app?.enabled !== true) return { enabled: false };
    if (Array.isArray(app.clientIds) && !app.clientIds.includes(clientId)) return { enabled: false };
    return { enabled: true };
  } catch (error) {
    return { enabled: false, error: describe(error) };
  }
}

export async function openSwapEpisode(
  collection: SwapEpisodeCollection,
  input: SwapEpisodeInput,
  opts: {
    logger: SwapEpisodeLogger;
    /** `parkedControl`; null/undefined = do not open (fail closed). */
    control: SwapEpisodeControlCollection | null | undefined;
    now?: () => Date;
    random?: () => number;
    opDeadlineMs?: number;
    /** `accountRoleEvents`; null/undefined = no parked / unparked events. */
    roleEvents?: AccountRoleEventsCollection | null;
  },
): Promise<SwapEpisodeResult> {
  const deadlineMs = opts.opDeadlineMs ?? SWAP_EPISODE_OP_DEADLINE_MS;
  const { logger } = opts;
  const meta = { mobile: maskMobile(input.mobile), clientId: input.clientId, reason: input.reason };
  let doc: Record<string, unknown>;
  try {
    doc = buildSwapEpisode(input, (opts.now ?? (() => new Date()))(), opts.random ?? Math.random);
  } catch (error) {
    logger.warn(`[${input.clientId}] Parked swap episode not opened: ${describe(error)}`, meta);
    return 'failed';
  }
  const gate = await tgAutParkedEnabled(opts.control, input.clientId, deadlineMs);
  if (!gate.enabled) {
    if (gate.error) logger.warn(`[${input.clientId}] Parked swap episode not opened: parkedControl unreadable (${gate.error})`, meta);
    else logger.info(`[${input.clientId}] Parked swap episode not opened: parkedControl does not enable tg-aut for this client`, meta);
    return 'disabled';
  }
  const OP = { maxTimeMS: SWAP_EPISODE_OP_MAX_TIME_MS };
  const exists = async (): Promise<SwapEpisodeResult> => {
    const merge = tgAutExistsMergePipeline(input);
    if (!merge) return 'exists';
    try {
      await withDeadline(
        collection.findOneAndUpdate({ _id: doc._id, createdBy: 'tg-aut' }, merge, { ...OP, projection: { _id: 1 } }),
        deadlineMs,
        'parkedAccounts.findOneAndUpdate(merge)',
      );
    } catch (error) {
      logger.warn(`[${input.clientId}] Parked swap episode exists; merging swapDays/reason into the tg-aut episode failed: ${describe(error)}`, meta);
    }
    return 'exists';
  };
  for (let attempt = 0; attempt < OPEN_RETRIES; attempt++) {
    try {
      await withDeadline(collection.insertOne(doc), deadlineMs, 'parkedAccounts.insertOne');
      logger.info(`[${input.clientId}] Parked swap episode opened for the old main`, { ...meta, episode: String(doc._id).replace(input.mobile, String(meta.mobile)) });
      recordAccountRoleEventSoon(opts.roleEvents, {
        mobile: input.mobile, clientId: input.clientId, event: 'parked', pool: 'buffer', by: 'cms:parked-swap',
        reason: input.reason, reasonCode: classifyRoleEventReason(input.reason, 'other'), opId: String(doc._id),
        details: { app: 'tg-aut', cutoverOpId: String(doc.cutoverOpId), ...(typeof doc.swapDays === 'number' ? { swapDays: doc.swapDays } : {}) },
      }, { logger });
      return 'inserted';
    } catch (error) {
      if (!isDuplicateKey(error)) {
        logger.warn(`[${input.clientId}] Parked swap episode insert failed: ${describe(error)}`, meta);
        return 'failed';
      }
      if (onIdIndex(error)) return exists();
      try {
        // findOneAndUpdate (not updateMany) to learn WHICH episode closed, for its unparked event. The partial unique
        // {mobile} index on open episodes allows one per mobile; the loop cap only bounds a missing index.
        let closed = 0;
        while (closed < SUPERSEDE_LOOP_MAX) {
          const stopped = await withDeadline(collection.findOneAndUpdate(
            swapSupersedeFilter(input.mobile, String(doc._id)),
            supersededStopPipeline(),
            { ...OP, returnDocument: 'after', projection: { _id: 1, app: 1, mobile: 1, clientId: 1, stopReason: 1 } },
          ), deadlineMs, 'parkedAccounts.findOneAndUpdate') as Record<string, unknown> | null;
          if (!stopped) break;
          closed += 1;
          recordUnparked(opts.roleEvents, stopped, 'cms:parked-swap', logger);
        }
        if (closed === 0) {
          const same = await withDeadline(collection.findOne({ _id: doc._id }, { projection: { _id: 1 }, ...OP }), deadlineMs, 'parkedAccounts.findOne');
          if (same) return exists();
        }
      } catch (stopError) {
        logger.warn(`[${input.clientId}] Parked swap episode: superseding the older episode failed: ${describe(stopError)}`, meta);
        return 'failed';
      }
    }
  }
  logger.warn(`[${input.clientId}] Parked swap episode not opened: another open episode holds the mobile (other app or a race)`, meta);
  return 'failed';
}
