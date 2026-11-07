import * as os from 'os';
import { AccountRoleEventsCollection } from './account-role-events';
import { recordUnparked } from './parked-swap-episode';
import { parkedMobileForms } from './parked-session-guard';
import { maskMobile } from '../monitor/monitor-util';

/**
 * Parked-responder cutover hook (tg-platform docs/design/2026-11-05-parked-account-responder.md §7.3.1, P2).
 *
 * Before CMS restarts tg-aut onto a NEW main mobile (deployKey), that mobile must not be in use by a
 * tg-platform parked pass (a promote/tg-aut process answering DMs on it as a rotated-out account):
 *   1. stop its open parking episode (`parkedAccounts`, stopReason `became_main`, `open` unset);
 *   2. if `accountLeases` shows an unexpired `parked` holder, ask it to preempt and poll every 2 s until
 *      it is gone or expired, for at most PARKED_PREEMPT_WAIT_MS (20 s) of wall-clock time counted from the
 *      start of the hook (query time included); then continue REGARDLESS (logged `waited` / `timed_out`).
 *      20 s, not 60 s: tg-aut's own live acquire also asks a parked holder to yield and waits ≤ 60 s for it,
 *      so this is a head start, not the only guard. Every op carries maxTimeMS 5 s AND a client-side deadline
 *      (PARKED_CUTOVER_OP_DEADLINE_MS, as parked-session-guard.ts), so a stalled socket cannot hold the awaited hook.
 *   Review M1: every filter matches BOTH mobile forms (parkedMobileForms: canonical and '+canonical', `$in`, as the
 *   guard does): promote episodes and lease `_id`s keep the mobile as stored.
 *
 * CMS never holds a lease (review B1: connectionManager connects with users.session, a different key; the paths that
 * connect a POOL session ask parked-session-guard.ts first, P4 review item 1). This hook only
 * writes `preemptRequested` and the episode stop. It NEVER throws and never blocks the swap for longer
 * than the wait: a store error is logged and the cutover proceeds.
 *
 * Shapes and the stop pipeline mirror tg-platform @tg/db parked-accounts / account-leases repositories.
 * All lease times are the Mongo server's ($$NOW), never this VM's clock.
 *
 * accountRoleEvents (split doc §4.2): each episode the stop really closed appends `unparked` (stopReason
 * became_main, opId = episode _id), fire-and-forget, only when `roleEvents` is given. The stop is a findOneAndUpdate
 * loop (not updateMany) so the closed episode is known; the partial unique {mobile} index on open episodes allows
 * one per mobile, so it is one write plus one empty probe.
 */
export const PARKED_PREEMPT_WAIT_MS = 20_000;
export const PARKED_PREEMPT_POLL_MS = 2_000;
/** Server-side cap per Mongo op, so one slow op cannot stretch the swap. */
export const PARKED_CUTOVER_OP_MAX_TIME_MS = 5_000;
/** Client-side cap per Mongo op (maxTimeMS does not cover a stalled socket); mirrors parked-session-guard.ts. */
export const PARKED_CUTOVER_OP_DEADLINE_MS = 6_000;
const OP = { maxTimeMS: PARKED_CUTOVER_OP_MAX_TIME_MS };
const PARKED_EPISODE_GC_MS = 30 * 24 * 60 * 60 * 1000;
const STOP_LOOP_MAX = 10;

/** The raw-collection surface the hook needs (mongoose Connection#collection or the native driver). */
export interface ParkedCutoverCollection {
  /** Driver >= 6 shape: the document (or null), not a ModifyResult. */
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown>;
  /** Round 3 (M1): the preempt marks every parked lease of the mobile (both stored forms). */
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>[], options?: Record<string, unknown>): Promise<{ matchedCount?: number }>;
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface ParkedCutoverLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
}

export interface ParkedCutoverOptions {
  logger: ParkedCutoverLogger;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
  pollMs?: number;
  /** Identifies CMS in `preemptRequested.by` (not a lease holder). */
  requester?: string;
  /** Wall clock for the wait deadline (tests inject one). */
  now?: () => number;
  /** `accountRoleEvents`; null/undefined = no unparked events. */
  roleEvents?: AccountRoleEventsCollection | null;
  /** Client-side deadline per Mongo op (default PARKED_CUTOVER_OP_DEADLINE_MS; tests inject a short one). */
  opDeadlineMs?: number;
}

export type ParkedLeaseOutcome = 'free' | 'waited' | 'timed_out' | 'error';

export interface ParkedCutoverResult {
  episodesStopped: number;
  lease: ParkedLeaseOutcome;
  waitedMs: number;
  errors: string[];
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

/** Review M1: both stored forms of the mobile (canonical, '+canonical'); the value as given for a non-phone. */
function mobileForms(mobile: string): string[] {
  const forms = parkedMobileForms(mobile);
  return forms.length ? forms : [mobile];
}

/**
 * The same stop as tg-platform ParkedAccountsRepository.stopOpenForMobile (state machine §4.2).
 * MIRROR: this pipeline must stay IDENTICAL to `stopPipeline(reason)` in tg-platform
 * packages/tg-db/src/collections/parked-accounts.repository.ts (function `stopPipeline`, used by `stopOpenForMobile`).
 * Change both together (field names, GC window, version bump, `open` unset).
 */
export function becameMainStopPipeline(): Record<string, unknown>[] {
  return [
    {
      $set: {
        state: 'stopped',
        stopReason: { $literal: 'became_main' },
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

/** An unexpired parked holder, judged on the server clock. */
function parkedHolderFilter(forms: string[]): Record<string, unknown> {
  return { _id: { $in: forms }, 'holder.kind': 'parked', $expr: { $gt: ['$until', '$$NOW'] } };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function prepareParkedCutover(
  collections: { episodes: ParkedCutoverCollection; leases: ParkedCutoverCollection },
  input: { mobile: string; clientId: string },
  opts: ParkedCutoverOptions,
): Promise<ParkedCutoverResult> {
  const { mobile, clientId } = input;
  const sleep = opts.sleep ?? defaultSleep;
  const waitMs = opts.waitMs ?? PARKED_PREEMPT_WAIT_MS;
  const pollMs = Math.max(1, opts.pollMs ?? PARKED_PREEMPT_POLL_MS);
  const now = opts.now ?? Date.now;
  const opDeadlineMs = opts.opDeadlineMs ?? PARKED_CUTOVER_OP_DEADLINE_MS;
  const forms = mobileForms(mobile);
  const startedAt = now();
  const deadline = startedAt + waitMs;
  const result: ParkedCutoverResult = { episodesStopped: 0, lease: 'free', waitedMs: 0, errors: [] };

  try {
    while (result.episodesStopped < STOP_LOOP_MAX) {
      const stopped = await withDeadline(collections.episodes.findOneAndUpdate({ mobile: { $in: forms }, open: true }, becameMainStopPipeline(), {
        ...OP, returnDocument: 'after', projection: { _id: 1, app: 1, mobile: 1, clientId: 1, stopReason: 1 },
      }), opDeadlineMs, 'parkedAccounts.findOneAndUpdate') as Record<string, unknown> | null;
      if (!stopped) break;
      result.episodesStopped += 1;
      recordUnparked(opts.roleEvents, stopped, 'cms:parked-cutover', opts.logger);
    }
  } catch (error) {
    result.errors.push(`episode stop: ${describe(error)}`);
  }

  try {
    const by = {
      kind: 'live',
      owner: opts.requester ?? `cms:${os.hostname()}:${process.pid}`,
      app: 'tg-aut',
      clientId,
    };
    const asked = await withDeadline(collections.leases.updateMany(parkedHolderFilter(forms), [
      { $set: { preemptRequested: { by: { $literal: by }, at: '$$NOW' } } },
    ], OP), opDeadlineMs, 'accountLeases.updateMany');
    if ((asked?.matchedCount ?? 0) > 0) {
      result.lease = 'timed_out';
      // Real deadline: sleeps AND query time count, so slow reads cannot stretch the swap past waitMs.
      while (now() < deadline) {
        await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
        const still = await withDeadline(
          collections.leases.findOne(parkedHolderFilter(forms), { projection: { _id: 1 }, ...OP }),
          opDeadlineMs,
          'accountLeases.findOne',
        );
        if (!still) {
          result.lease = 'waited';
          break;
        }
      }
      result.waitedMs = Math.max(0, now() - startedAt);
    }
  } catch (error) {
    result.lease = 'error';
    result.errors.push(`lease: ${describe(error)}`);
  }

  const summary = { mobile: maskMobile(mobile), clientId, episodesStopped: result.episodesStopped, lease: result.lease, waitedMs: result.waitedMs };
  if (result.errors.length > 0 || result.lease === 'timed_out') {
    opts.logger.warn(`[${clientId}] Parked cutover hook: ${result.lease}${result.errors.length ? ` (${result.errors.join('; ')})` : ''}; continuing the cutover`, summary);
  } else if (result.episodesStopped > 0 || result.lease === 'waited') {
    opts.logger.info(`[${clientId}] Parked cutover hook: stopped ${result.episodesStopped} episode(s), lease ${result.lease}`, summary);
  }
  return result;
}
