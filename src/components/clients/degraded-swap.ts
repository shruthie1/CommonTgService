/**
 * Degraded swap fallback (owner, 2026-10-24). When a client's live account is DEAD and no normally
 * eligible buffer exists, setupClient may swap onto the least-bad buffer instead of leaving the
 * client on a dead account. Design: docs/design/2026-10-24-degraded-swap-fallback.md.
 *
 * Tiers (tier 1 = the normal eligibility rules, unchanged and not built here):
 *   2 = a same-persona sibling's eligible buffer (same dbcoll, other clientId), only while the
 *       sibling keeps >= SIBLING_MIN_SPARES_AFTER eligible spares; clientId is reassigned at cutover.
 *   3 = own pool, temporarily SpamBot-limited (dated limit still in the future).
 *   4 = own pool, harsh (indefinite) SpamBot limit: inbound-only, louder alert.
 * Never: inactive/expired/frozen, warming (not session_rotated), promote pool, another persona,
 * a mobile with an in-flight setup, or another client's current main.
 */
import { WarmupPhase, MIN_CHANNELS_FOR_MATURING } from '../shared/warmup-phases';

export type DegradedTier = 2 | 3 | 4;
export const ALL_DEGRADED_TIERS: readonly DegradedTier[] = [2, 3, 4];

/** A sibling lends a buffer only if it still has at least this many eligible spares afterwards. */
export const SIBLING_MIN_SPARES_AFTER = 2;

/** Upgrade-job reason passed through setupClient; never a dead reason. */
export const DEGRADED_UPGRADE_REASON = 'DEGRADED_UPGRADE';

/**
 * Reasons that mean the live account is DEAD (owner list, 2026-10-24). A SpamBot-limited main is
 * NOT dead: it still answers inbound DMs, so it is kept and the client waits for a real buffer.
 */
export const DEAD_SWAP_REASON_CODES: readonly string[] = [
  'FROZEN_METHOD_INVALID',
  'FROZEN_PARTICIPANT_MISSING',
  'USER_DEACTIVATED',
  'USER_DEACTIVATED_BAN',
  'SESSION_REVOKED',
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_DUPLICATED',
  'PHONE_NUMBER_BANNED',
  // Internal: the CMS rescue pass found the client's current main already retired (users.expired or
  // a [DEAD]/permanent-reason inactive pool record). Never produced by tg-aut.
  'DEAD_MAIN_RESCUE',
];

/** Internal rescue-pass reason prefix (see DEAD_SWAP_REASON_CODES). */
export const DEAD_MAIN_RESCUE_REASON = 'DEAD_MAIN_RESCUE';

/** Pool-refill pass reason: a SpamBot-limited (alive) main is moved once a tier-1 buffer exists. Not dead. */
export const POOL_REFILL_REASON = 'POOL_REFILL';

/** Recoverable errors that contain a dead token (same override as isPermanentError). */
const DEAD_REASON_OVERRIDES: readonly string[] = ['INPUT_USER_DEACTIVATED'];

/** Rescue / pool-refill passes: at most this many swap attempts per pass per run. */
export const RESCUE_MAX_PER_RUN = 3;
export const UPGRADE_MAX_PER_RUN = 3;
export const POOL_REFILL_MAX_PER_RUN = 3;
/**
 * Rescue acts only on live-session evidence: clients.deadMain, written when tg-aut (the only
 * process on the live session) calls /setupClient with a dead reason. tg-aut's own handoff ladder
 * (1+2+4+8+16 min) runs after each report, so rescue waits this long after the LAST report.
 */
export const DEAD_MAIN_HANDOFF_WAIT_MS = 35 * 60 * 1000;
/** clients.swapLease / bufferClients.probeLease time-to-live (a crashed holder frees itself). */
export const SWAP_LEASE_TTL_MS = 10 * 60 * 1000;
/**
 * A running setup renews its swapLease and probe leases this often (each renewal = now + TTL), so a
 * long HTTP run (backup-session creation, slow connects) never outlives its lease. A crashed holder
 * stops renewing and frees itself within SWAP_LEASE_TTL_MS.
 */
export const SWAP_LEASE_RENEW_MS = 2 * 60 * 1000;
/**
 * After a cutover (clients.swappedAt), a /setupClient report WITHOUT reportedMobile (an old tg-aut
 * bundle) is ignored this long: it may come from the replaced process, still running on the old mobile
 * until its restart. 15 min: CMS restarts tg-aut right after the commit (seconds) and tg-aut itself
 * suppresses requests 5 min after a swap; an old bundle whose NEW main really is dead still gets
 * through: its handoff gate (`>= now - 60 s * 2^failedHandoffs`) tries at t0 + 0, 2, 6, 14 and 30 min,
 * and only the 30-min attempt is sure to land after the window (the 14-min one may, if t0 was late).
 */
export const SWAP_REPORT_GRACE_MS = 15 * 60 * 1000;
/** Refill trusts the main's stored SpamBot verdict only when it is at most this old. */
export const MAIN_SPAM_STATUS_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** clients.deadMain: the live main was reported dead by tg-aut (its live session). */
export interface ClientDeadMainState {
  mobile: string;
  reason: string;
  /** Time of the latest dead report for this mobile. */
  at: Date;
}

/** clients.swapLease / bufferClients.probeLease: cross-process exclusivity (owner host:pid:uuid). */
export interface SwapLease {
  owner: string;
  until: Date;
}

/** Mongo filter: no lease, or an expired one. */
export function leaseFreeFilter(field: string, now: Date): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }, { [`${field}.until`]: { $lte: now } }] };
}

/** True when deadMain is usable rescue evidence for this client's current main. */
export function isDeadMainEvidence(deadMain: ClientDeadMainState | null | undefined, currentMobile: string): boolean {
  return !!deadMain && deadMain.mobile === currentMobile && isDeadSwapReason(deadMain.reason)
    && !String(deadMain.reason).startsWith(DEAD_MAIN_RESCUE_REASON);
}
/**
 * Owner retry rule for the rescue / upgrade / refill passes: per client episode, 30 min doubling per miss
 * (30, 60, 120, 240, 480 min) and a HARD STOP after PASS_MAX_ATTEMPTS attempts. A stopped episode
 * re-arms only when the client's candidate pool fingerprint changes or clients.mobile changes.
 */
export const PASS_RETRY_BASE_MS = 30 * 60 * 1000;
export const PASS_MAX_ATTEMPTS = 6;

export function passRetryDelayMs(misses: number): number {
  if (misses <= 0) return 0;
  return PASS_RETRY_BASE_MS * 2 ** (misses - 1);
}

export type SwapRetryPass = 'rescue' | 'upgrade' | 'refill';

/** clients.swapRetry: the persisted rescue / upgrade / refill episode (survives a CMS restart). */
export interface ClientSwapRetryState {
  pass: SwapRetryPass;
  /** The main this episode is about; a different clients.mobile starts a new episode. */
  mobile: string;
  attempts: number;
  nextAt: Date;
  /** swapPoolFingerprint of the candidate pool after the last attempt. */
  poolFingerprint: string;
  since: Date;
  /** Set when the hard stop was reached (the one stop notice was sent then). */
  stoppedAt?: Date | null;
}

export type SwapRetryDecision =
  | { kind: 'due'; attempts: number; rearmed: boolean }
  | { kind: 'cooldown'; attempts: number }
  | { kind: 'stopped'; attempts: number };

/**
 * What the pass may do for this client now. `attempts` is the count already used in the episode
 * (0 for a new or re-armed one).
 */
export function swapRetryDecision(
  state: ClientSwapRetryState | null | undefined,
  pass: SwapRetryPass,
  mobile: string,
  fingerprint: string,
  nowMs: number,
): SwapRetryDecision {
  if (!state || state.pass !== pass || state.mobile !== mobile) return { kind: 'due', attempts: 0, rearmed: false };
  if (state.poolFingerprint !== fingerprint) return { kind: 'due', attempts: 0, rearmed: true };
  if (state.attempts >= PASS_MAX_ATTEMPTS) return { kind: 'stopped', attempts: state.attempts };
  if (nowMs < new Date(state.nextAt).getTime()) return { kind: 'cooldown', attempts: state.attempts };
  return { kind: 'due', attempts: state.attempts, rearmed: false };
}

/** The pool fields the fingerprint reads (bufferClients rows of the client and its same-persona siblings). */
export interface PoolFingerprintRow {
  mobile: string;
  clientId?: string;
  status?: string;
  inUse?: boolean;
  warmupPhase?: string | null;
  channels?: number;
  availableDate?: string;
  spamStatus?: string | null;
  limitedUntil?: Date | string | null;
}

/**
 * A cheap fingerprint of what could make a swap succeed: for every active, not-in-use row, whether it
 * is session_rotated, has >= 200 channels, is due (availableDate <= today), its SpamBot status and
 * whether its limit has passed. Time passing (availableDate / limitedUntil) changes it with no doc
 * write; noise (channel count 250 -> 260, updatedAt) does not.
 */
export function swapPoolFingerprint(rows: PoolFingerprintRow[], nowMs: number, today: string): string {
  const parts = rows
    .filter((r) => r.status === 'active' && r.inUse !== true)
    .map((r) => {
      const until = r.limitedUntil ? new Date(r.limitedUntil).getTime() : 0;
      return [
        r.clientId ?? '',
        r.mobile,
        r.warmupPhase === WarmupPhase.SESSION_ROTATED ? 'R' : '-',
        (r.channels ?? 0) >= MIN_CHANNELS_FOR_MATURING ? 'C' : '-',
        r.availableDate && r.availableDate <= today ? 'D' : '-',
        r.spamStatus || '',
        until > nowMs ? 'L' : '-',
      ].join(':');
    })
    .sort();
  let hash = 0x811c9dc5; // FNV-1a, 32 bit: equality only, not security
  const text = parts.join('|');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${parts.length}:${hash.toString(16).padStart(8, '0')}`;
}

function containsToken(text: string, token: string): boolean {
  const haystack = text.toUpperCase();
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(token, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : haystack[idx - 1];
    const after = haystack[idx + token.length] ?? '';
    const isWordChar = (c: string) => c !== '' && /[A-Z0-9_]/.test(c);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = idx + 1;
  }
}

/**
 * True when the swap reason names a dead-account error (token match). Like isPermanentError, an
 * INPUT_USER_DEACTIVATED anywhere in the text wins: that error is recoverable, never dead.
 */
export function isDeadSwapReason(reason?: string | null): boolean {
  if (typeof reason !== 'string' || !reason.trim()) return false;
  if (DEAD_REASON_OVERRIDES.some((code) => containsToken(reason, code))) return false;
  return DEAD_SWAP_REASON_CODES.some((code) => containsToken(reason, code));
}

/**
 * Tier to stamp on clients.degraded for a degraded-tier pick, from what the SpamBot probe actually
 * said (not from the tier the candidate was found in). 1 = the account meets tier-1 rules: no marker.
 *   - tier 2 (sibling spare): picked by tier-1 rules and accepted only on a tier-1 verdict -> 1.
 *   - probe free -> 1; probe limited -> 3; probe harsh -> 4.
 *   - inconclusive ('unknown') -> the tier it was found in (its stored limit is all we know).
 */
export function markerTierFromVerdict(pickTier: DegradedTier, verdict?: string | null): 1 | DegradedTier {
  if (pickTier === 2) return 1;
  if (verdict === 'free') return 1;
  if (verdict === 'limited') return 3;
  if (verdict === 'harsh') return 4;
  return pickTier;
}

/**
 * DEGRADED_SWAP_TIERS from the remote configuration (copied into process.env), read at call time.
 * Unset/blank => all tiers "2,3,4". "none" / "off" / "0" => disabled. Unknown tokens are ignored;
 * a value with no valid tier disables the fallback (fail closed on a typo).
 */
export function parseDegradedSwapTiers(raw: string | undefined = process.env.DEGRADED_SWAP_TIERS): DegradedTier[] {
  if (raw === undefined || raw.trim() === '') return [...ALL_DEGRADED_TIERS];
  const value = raw.trim().toLowerCase();
  if (value === 'none' || value === 'off' || value === '0' || value === 'false') return [];
  const tiers = new Set<DegradedTier>();
  for (const token of value.split(',')) {
    const n = Number(token.trim());
    if (n === 2 || n === 3 || n === 4) tiers.add(n);
  }
  return [...tiers].sort((a, b) => a - b);
}

export interface ClientDegradedState {
  since: Date;
  tier: DegradedTier;
  /** The setup reason that caused the degraded swap (dead-account code). */
  reason: string;
  /** Mobile the client was moved off. */
  fromMobile: string;
  /** Known SpamBot limit end of the degraded account (null for harsh/unknown). */
  limitedUntil: Date | null;
  /** Tier 2 only: the sibling clientId the account was borrowed from. */
  fromClientId?: string;
}

/** Fields shared by tiers 3 and 4: a finished, serving-ready account of this client's own pool. */
function ownPoolBase(clientId: string, excludeMobiles: string[]): Record<string, unknown> {
  return {
    clientId,
    mobile: { $nin: excludeMobiles },
    status: 'active',
    inUse: { $ne: true },
    warmupPhase: WarmupPhase.SESSION_ROTATED,
    channels: { $gte: MIN_CHANNELS_FOR_MATURING },
  };
}

/** Tier 3: own pool, SpamBot limit with a future end date. Earliest release first. */
export function buildTier3Query(clientId: string, excludeMobiles: string[], now: Date = new Date()) {
  return {
    query: { ...ownPoolBase(clientId, excludeMobiles), spamStatus: 'limited', limitedUntil: { $gt: now } },
    sort: { limitedUntil: 1, channels: -1, createdAt: 1 } as Record<string, 1 | -1>,
  };
}

/** Tier 4: own pool, harsh (indefinite) SpamBot limit. */
export function buildTier4Query(clientId: string, excludeMobiles: string[]) {
  return {
    query: { ...ownPoolBase(clientId, excludeMobiles), spamStatus: 'harsh' },
    sort: { channels: -1, createdAt: 1 } as Record<string, 1 | -1>,
  };
}

/** Which SpamBot probe verdicts a tier may swap in. Connect/send failures and frozen replies are always rejected. */
export interface SwapProbeAcceptance {
  limited?: boolean;
  harsh?: boolean;
  /** Reject an unrecognised SpamBot reply that mentions a frozen account. */
  rejectFrozenReply?: boolean;
}

export function probeAcceptanceForTier(tier: DegradedTier): SwapProbeAcceptance {
  if (tier === 2) return { rejectFrozenReply: true };
  if (tier === 3) return { limited: true, rejectFrozenReply: true };
  return { limited: true, harsh: true, rejectFrozenReply: true };
}

export function last4(mobile?: string | null): string {
  const m = String(mobile ?? '');
  return m.length > 4 ? `****${m.slice(-4)}` : m;
}
