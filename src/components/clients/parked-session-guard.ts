/**
 * Parked-session guard (tg-platform docs/design/2026-11-05-parked-account-responder.md, "P4 review fixes" item 1).
 *
 * tg-platform's parked responder connects a rotated-out / swapped-out account with its POOL session
 * (`bufferClients.session` / `promoteClients.session`). A few CMS paths connect that SAME key (or an audit copy of
 * it), not `users.session`: healDeadSessions, rotateSession, and the SessionService old-session / audit-session
 * strategies. Two concurrent connections on one auth key is the session-loss risk the parked lease exists for.
 *
 * Every such path asks this guard first and SKIPS the mobile when:
 *   - `parkedAccounts` has an OPEN, UNEXPIRED episode for it (`open: true`, `expiresAt` > server `$$NOW`;
 *     final review M1: an episode nobody closed stops blocking at its expiry) of an app/client that `parkedControl`
 *     ENABLES (review M8: kill switch off or a client dropped from the canary list = nobody runs the episode, so it
 *     must not block heal/rotate/session until expiry; global AND app AND clientIds, missing doc = disabled, the
 *     same rule as tg-platform ParkedControlRepository.readState / tgAutParkedEnabled), or
 *   - `accountLeases` has an unexpired `parked` holder for it (server clock, `$$NOW`), whatever parkedControl says.
 * A read error (parkedControl included), a timeout or a missing DB handle also skips (fail closed): the caller
 * retries on its next run.
 *
 * Bounded: each read has maxTimeMS AND a client-side deadline (a stalled socket cannot hold the caller).
 *
 * MIRROR: tg-platform packages/tg-db/src/collections/parked-accounts.repository.ts (`open: true` partial index on
 * `mobile`, canonical mobile without '+') and account-leases.repository.ts (`_id` = mobile, `holder.kind` 'parked',
 * `until` vs $$NOW, mobileLookupForms: canonical and '+canonical'). Change both together.
 */
export const PARKED_GUARD_OP_MAX_TIME_MS = 3_000;
export const PARKED_GUARD_DEADLINE_MS = 4_000;
/** Refusal code of a guarded SessionService flow (createSession / getOldestSessionOrCreate results). */
export const PARKED_SESSION_BUSY = 'PARKED_SESSION_BUSY';

export interface ParkedGuardCollection {
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

/** The parked apps parkedControl has a doc for (tg-platform ParkedControlRepository: `global`, `promote`, `tg-aut`). */
export const PARKED_CONTROL_APPS = ['tg-aut', 'promote'] as const;

/**
 * Review M8: episode-filter clauses for the app/client pairs parkedControl ENABLES. [] = none enabled (no episode
 * counts). Enabled = `global.enabled === true` AND the app doc's `enabled === true` AND (no `clientIds` array OR it
 * includes the episode's clientId). A missing doc = disabled. MIRROR: tg-platform parked-control.repository.ts
 * `readState` and parked-swap-episode.ts `tgAutParkedEnabled`. Change all together.
 */
export function parkedEnabledEpisodeClauses(docs: Record<string, unknown>): Record<string, unknown>[] {
  const doc = (id: string) => {
    const d = docs[id];
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null;
  };
  if (doc('global')?.enabled !== true) return [];
  const clauses: Record<string, unknown>[] = [];
  for (const app of PARKED_CONTROL_APPS) {
    const d = doc(app);
    if (d?.enabled !== true) continue;
    if (Array.isArray(d.clientIds)) {
      clauses.push({ app, clientId: { $in: d.clientIds.filter((c): c is string => typeof c === 'string') } });
    } else {
      clauses.push({ app });
    }
  }
  return clauses;
}

/** Reads the parkedControl docs (by _id, maxTimeMS each) and returns the enabled clauses. THROWS on a read error. */
async function readEnabledEpisodeClauses(control: ParkedGuardCollection): Promise<Record<string, unknown>[]> {
  if (!control || typeof control.findOne !== 'function') throw new Error('no parkedControl handle');
  const ids = ['global', ...PARKED_CONTROL_APPS];
  const rows = await Promise.all(ids.map((id) => control.findOne(
    { _id: id },
    { projection: { enabled: 1, clientIds: 1 }, maxTimeMS: PARKED_GUARD_OP_MAX_TIME_MS },
  )));
  const docs: Record<string, unknown> = {};
  ids.forEach((id, i) => { docs[id] = rows[i]; });
  return parkedEnabledEpisodeClauses(docs);
}

/** mongoose Connection / native Db: anything with collection(name). */
export interface ParkedGuardDb {
  collection(name: string): ParkedGuardCollection;
}

export type ParkedSessionVerdict =
  | { busy: false }
  | { busy: true; reason: 'open_episode' | 'parked_lease' | 'guard_unavailable' | 'read_error'; detail?: string };

/** tg-platform mobileLookupForms: canonical (no '+') and '+canonical'; [] for a non-phone. */
export function parkedMobileForms(mobile: string): string[] {
  const trimmed = typeof mobile === 'string' ? mobile.trim() : '';
  const canonical = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  if (!/^[1-9]\d{6,14}$/.test(canonical)) return [];
  return [canonical, `+${canonical}`];
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function checkParkedSession(
  db: ParkedGuardDb | null | undefined,
  mobile: string,
  opts: { deadlineMs?: number } = {},
): Promise<ParkedSessionVerdict> {
  if (!db || typeof db.collection !== 'function') return { busy: true, reason: 'guard_unavailable' };
  const forms = parkedMobileForms(mobile);
  if (forms.length === 0) return { busy: true, reason: 'read_error', detail: `not a mobile: ${JSON.stringify(mobile)}` };
  const deadline = opts.deadlineMs ?? PARKED_GUARD_DEADLINE_MS;
  const OP = { maxTimeMS: PARKED_GUARD_OP_MAX_TIME_MS };
  try {
    const [episode, lease] = await withDeadline((async () => {
      const [enabled, leaseDoc] = await Promise.all([
        // Review M8: a parkedControl read error rejects here = busy read_error (fail closed).
        readEnabledEpisodeClauses(db.collection('parkedControl')),
        db.collection('accountLeases').findOne(
          { _id: { $in: forms }, 'holder.kind': 'parked', $expr: { $gt: ['$until', '$$NOW'] } },
          { projection: { _id: 1 }, ...OP },
        ),
      ]);
      // Review M8: only episodes of an enabled app/client count; none enabled = no episode read at all.
      const episodeDoc = enabled.length === 0 ? null : await db.collection('parkedAccounts').findOne(
        // Final review M1(b): an open episode past expiresAt (never closed: kill switch off, app stopped) is not busy.
        { mobile: { $in: forms }, open: true, $expr: { $gt: ['$expiresAt', '$$NOW'] }, $or: enabled },
        { projection: { _id: 1 }, ...OP },
      );
      return [episodeDoc, leaseDoc] as const;
    })(), deadline, 'parked session guard');
    if (episode) return { busy: true, reason: 'open_episode' };
    if (lease) return { busy: true, reason: 'parked_lease' };
    return { busy: false };
  } catch (error) {
    return { busy: true, reason: 'read_error', detail: error instanceof Error ? error.message : String(error) };
  }
}

export function describeParkedVerdict(v: ParkedSessionVerdict): string {
  return v.busy ? `parked responder guard: ${v.reason}${v.detail ? ` (${v.detail})` : ''}` : 'free';
}

/** The `parkedAccounts` collection as the replacement-candidate filter reads it (native / mongoose collection). */
export interface ParkedEpisodeFindCollection {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): { toArray(): Promise<unknown[]> };
}

export interface OpenParkedMobiles {
  /** Canonical mobiles (no '+') with an OPEN parked episode (any app). */
  open: Set<string>;
  /** Set when the read failed or timed out: `open` is then empty (exclude nothing). */
  error?: string;
  /**
   * Review M8: set when parkedControl could not be read (or no handle was given): `open` then holds EVERY open
   * unexpired episode, whatever app/client (fail closed, as the guard).
   */
  controlError?: string;
}

/** Cap on one open-episode scan (the partial unique index allows one open episode per mobile). */
export const PARKED_OPEN_SCAN_LIMIT = 5_000;

/** Canonical (no '+') form of a pool mobile, or null for a non-phone value. Never throws. */
export function parkedCanonicalMobile(mobile: unknown): string | null {
  return typeof mobile === 'string' ? (parkedMobileForms(mobile)[0] ?? null) : null;
}

/**
 * P4 re-review L1 / P4 verification fix 2: every mobile with an OPEN `parkedAccounts` episode (any app), read ONCE
 * per swap (the caller caches the result for all tiers; unexpired only, final review M1), so a swap's preferred tier does not pick a buffer a parked
 * pass is still answering on. Uses the `mobile_open_unique` partial index (`open: true`, mobile a string).
 * BEST-EFFORT (unlike checkParkedSession): a read error or the deadline returns an empty set with `error` (the caller
 * logs and excludes nothing); the cutover hook (parked-cutover.ts) and the parked lease still protect the session.
 * Review M8: only episodes of an app/client parkedControl enables count (same rule as checkParkedSession). An
 * unreadable parkedControl, or no `control` handle, counts every open episode (fail closed) and sets `controlError`.
 * MIRROR: tg-platform parked-accounts.repository.ts (`open: true`, canonical mobile).
 */
export async function openParkedEpisodeMobiles(
  episodes: ParkedEpisodeFindCollection | null | undefined,
  opts: { deadlineMs?: number; control?: ParkedGuardCollection | null } = {},
): Promise<OpenParkedMobiles> {
  const open = new Set<string>();
  if (!episodes || typeof episodes.find !== 'function') return { open, error: 'no parkedAccounts handle' };
  try {
    const out: OpenParkedMobiles = { open };
    const docs = await withDeadline((async () => {
      let enabled: Record<string, unknown>[] | null = null;
      try {
        enabled = await readEnabledEpisodeClauses(opts.control as ParkedGuardCollection);
      } catch (controlError) {
        out.controlError = controlError instanceof Error ? controlError.message : String(controlError);
      }
      if (enabled && enabled.length === 0) return [];
      return episodes.find(
        { open: true, mobile: { $type: 'string' }, $expr: { $gt: ['$expiresAt', '$$NOW'] }, ...(enabled ? { $or: enabled } : {}) },
        { projection: { _id: 0, mobile: 1 }, limit: PARKED_OPEN_SCAN_LIMIT, maxTimeMS: PARKED_GUARD_OP_MAX_TIME_MS },
      ).toArray();
    })(), opts.deadlineMs ?? PARKED_GUARD_DEADLINE_MS, 'parked episode read');
    for (const d of docs) {
      const m = (d as { mobile?: unknown } | null)?.mobile;
      const canonical = parkedCanonicalMobile(m);
      if (canonical) open.add(canonical);
    }
    return out;
  } catch (error) {
    return { open: new Set<string>(), error: error instanceof Error ? error.message : String(error) };
  }
}
