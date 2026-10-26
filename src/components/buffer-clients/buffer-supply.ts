/**
 * Dynamic buffer-pool supply (docs/design/2026-10-24-dynamic-buffer-supply.md).
 *
 * Pure functions only (no I/O) so every rule is unit-testable:
 *   - classifyBufferForCap: does an account count toward the per-client cap / supply?
 *   - readBufferSupplyConfig: config keys from process.env (the Mongo `configuration` doc), code
 *     defaults, and fail-closed to the legacy behaviour on any garbage value.
 *   - computeClientSupplyTarget: target / cap / need for one client from its own consumption.
 *   - computeFleetEnrollmentBudget + allocateByNeed: never enrol more than the warmup engine can warm,
 *     and share a constrained budget by need.
 */

export type BufferSupplyMode = 'dynamic' | 'legacy';

export type CapCountedKind = 'usable' | 'limited_soon' | 'pipeline';
export type CapExclusionReason =
    | 'no_phase'
    | 'in_use'
    | 'below_channel_floor'
    | 'failed_attempts'
    | 'harsh'
    | 'never_checked'
    | 'stale_free'
    | 'limited_outside_window'
    | 'limited_no_date'
    | 'unknown_spam_status';

export type CapClassification =
    | { counted: true; kind: CapCountedKind }
    | { counted: false; reason: CapExclusionReason };

/** Spam/warmup fields the classifier reads. Kept structural so lean docs and documents both fit. */
export interface CapClassifiableDoc {
    warmupPhase?: string | null;
    channels?: number | null;
    failedUpdateAttempts?: number | null;
    inUse?: boolean | null;
    spamStatus?: string | null;
    limitedUntil?: Date | string | null;
    spamCheckedAt?: Date | string | null;
}

export interface CapClassifyOptions {
    /** Channels a graduated account needs before a swap can use it (buffer: 200). */
    operationalFloor: number;
    /** failedUpdateAttempts at or above this = stalled warmup, not pipeline. */
    maxFailedAttempts: number;
    /** A 'free' verdict older than this is no longer trusted for the cap. */
    freeFreshMs: number;
    /** A limited account counts only when its limit lifts within this horizon. */
    limitedWindowMs: number;
}

const TERMINAL_PHASES = new Set(['ready', 'session_rotated']);
const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: Date | string | null | undefined): number {
    if (value === null || value === undefined || value === '') return NaN;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Whether one active, assigned buffer account counts toward its client's cap and supply.
 *
 * Counted: warmup pipeline (non-terminal, not stalled); graduated + >= floor channels + not the live
 * main AND (SpamBot free with a fresh check, or limited with a lift date inside the window).
 * Never counted: harsh (whatever its age), never SpamBot-checked graduated accounts, stale free.
 */
export function classifyBufferForCap(doc: CapClassifiableDoc, now: number, opts: CapClassifyOptions): CapClassification {
    const phase = doc.warmupPhase;
    if (!phase) return { counted: false, reason: 'no_phase' };

    if (!TERMINAL_PHASES.has(phase)) {
        // Warmup pipeline: counted as today (failed-attempt stalls excluded), spam state not read —
        // warming accounts are not SpamBot-checked by anything until they graduate.
        if ((doc.failedUpdateAttempts || 0) >= opts.maxFailedAttempts) return { counted: false, reason: 'failed_attempts' };
        return { counted: true, kind: 'pipeline' };
    }

    if (doc.inUse === true) return { counted: false, reason: 'in_use' };
    if ((doc.channels || 0) < opts.operationalFloor) return { counted: false, reason: 'below_channel_floor' };

    const status = doc.spamStatus;
    if (status === 'harsh') return { counted: false, reason: 'harsh' };
    if (status === null || status === undefined || status === '') return { counted: false, reason: 'never_checked' };
    if (status === 'free') {
        const checkedAt = toMs(doc.spamCheckedAt);
        if (!Number.isFinite(checkedAt) || now - checkedAt > opts.freeFreshMs) return { counted: false, reason: 'stale_free' };
        return { counted: true, kind: 'usable' };
    }
    if (status === 'limited') {
        const until = toMs(doc.limitedUntil);
        if (!Number.isFinite(until)) return { counted: false, reason: 'limited_no_date' };
        if (until - now > opts.limitedWindowMs) return { counted: false, reason: 'limited_outside_window' };
        return { counted: true, kind: 'limited_soon' };
    }
    return { counted: false, reason: 'unknown_spam_status' };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Warmup engine ceiling (accounts that can START warmup per week without changing any warmup cap):
 * MAX_SENSITIVE_ACTIONS_PER_CYCLE (5) x WARMUP_RUNS_PER_DAY (4) x 7 days / sensitive actions per
 * account (set_2fa, remove_external_login_sessions, update_username = 3) = 46.67 -> 46. Config can only lower it.
 */
export const SENSITIVE_ACTIONS_PER_ACCOUNT = 3;
export function engineWeeklyCeiling(maxSensitivePerRun: number, runsPerDay: number): number {
    return Math.floor((maxSensitivePerRun * runsPerDay * 7) / SENSITIVE_ACTIONS_PER_ACCOUNT);
}

export const LEGACY_HEALTHY_CAP = 20;

export interface BufferSupplyConfig {
    mode: BufferSupplyMode;
    consumptionWindowDays: number;
    leadTimeDays: number;
    safetyMargin: number;
    minTarget: number;
    maxTarget: number;
    capHeadroom: number;
    hardCap: number;
    freeFreshDays: number;
    fleetWeeklyCeiling: number;
}

export interface BufferSupplyConfigResult {
    config: BufferSupplyConfig;
    /** Keys whose value was present but rejected (forces legacy mode). */
    invalid: string[];
}

export const BUFFER_SUPPLY_ENV = {
    mode: 'BUFFER_SUPPLY_MODE',
    consumptionWindowDays: 'BUFFER_SUPPLY_CONSUMPTION_WINDOW_DAYS',
    leadTimeDays: 'BUFFER_SUPPLY_LEAD_TIME_DAYS',
    safetyMargin: 'BUFFER_SUPPLY_SAFETY_MARGIN',
    minTarget: 'BUFFER_SUPPLY_MIN_TARGET',
    maxTarget: 'BUFFER_SUPPLY_MAX_TARGET',
    capHeadroom: 'BUFFER_SUPPLY_CAP_HEADROOM',
    hardCap: 'BUFFER_SUPPLY_HARD_CAP',
    freeFreshDays: 'BUFFER_SUPPLY_FREE_FRESH_DAYS',
    fleetWeeklyCeiling: 'BUFFER_SUPPLY_FLEET_WEEKLY_CEILING',
} as const;

/** Absolute upper bound on any client's cap, whatever the config says. */
export const BUFFER_SUPPLY_HARD_CAP_MAX = 60;

type NumericKey = Exclude<keyof BufferSupplyConfig, 'mode'>;

export function defaultBufferSupplyConfig(engineCeiling: number): BufferSupplyConfig {
    return {
        mode: 'dynamic',
        consumptionWindowDays: 14,
        leadTimeDays: 30,
        safetyMargin: 2,
        minTarget: 10,
        maxTarget: 40,
        capHeadroom: 5,
        hardCap: 50,
        freeFreshDays: 14,
        fleetWeeklyCeiling: engineCeiling,
    };
}

/**
 * Reads the BUFFER_SUPPLY_* keys. Unset/blank = code default. Any value that is not an integer in
 * its range (or an inconsistent pair, e.g. min > max) fails CLOSED: mode becomes 'legacy', which is
 * exactly the pre-2026-10-24 enrolment (old cap counting, cap 20, fixed 10-account stock).
 */
export function readBufferSupplyConfig(
    env: Record<string, string | undefined>,
    engineCeiling: number,
): BufferSupplyConfigResult {
    const config = defaultBufferSupplyConfig(engineCeiling);
    const invalid: string[] = [];
    const ranges: Record<NumericKey, [number, number]> = {
        consumptionWindowDays: [3, 60],
        leadTimeDays: [7, 90],
        safetyMargin: [0, 20],
        minTarget: [0, 40],
        maxTarget: [1, BUFFER_SUPPLY_HARD_CAP_MAX],
        capHeadroom: [0, 30],
        hardCap: [1, BUFFER_SUPPLY_HARD_CAP_MAX],
        freeFreshDays: [1, 60],
        fleetWeeklyCeiling: [0, Math.max(0, engineCeiling)],
    };

    const rawMode = (env[BUFFER_SUPPLY_ENV.mode] ?? '').trim().toLowerCase();
    if (rawMode === 'legacy') config.mode = 'legacy';
    else if (rawMode !== '' && rawMode !== 'dynamic') invalid.push(BUFFER_SUPPLY_ENV.mode);

    for (const key of Object.keys(ranges) as NumericKey[]) {
        const raw = (env[BUFFER_SUPPLY_ENV[key]] ?? '').trim();
        if (raw === '') continue;
        const [lo, hi] = ranges[key];
        const value = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isInteger(value) || value < lo || value > hi) {
            invalid.push(BUFFER_SUPPLY_ENV[key]);
            continue;
        }
        config[key] = value;
    }
    if (config.minTarget > config.maxTarget) invalid.push(`${BUFFER_SUPPLY_ENV.minTarget}>${BUFFER_SUPPLY_ENV.maxTarget}`);

    if (invalid.length) {
        return { config: { ...defaultBufferSupplyConfig(engineCeiling), mode: 'legacy' }, invalid };
    }
    return { config, invalid };
}

export function classifyOptionsFromConfig(config: BufferSupplyConfig, operationalFloor: number, maxFailedAttempts: number): CapClassifyOptions {
    return {
        operationalFloor,
        maxFailedAttempts,
        freeFreshMs: config.freeFreshDays * DAY_MS,
        limitedWindowMs: config.leadTimeDays * DAY_MS,
    };
}

// ---------------------------------------------------------------------------
// Per-client target
// ---------------------------------------------------------------------------

export interface ClientSupplyInput {
    /** Buffer accounts of this client swapped out (lastUsed) inside the consumption window. */
    consumed: number;
    /** Accounts counted by classifyBufferForCap. */
    counted: number;
}

export interface ClientSupplyTarget {
    ratePerDay: number;
    rawTarget: number;
    target: number;
    cap: number;
    need: number;
}

/**
 * target = ceil(swaps/day x lead time) + safety margin, clamped to [minTarget, maxTarget];
 * cap = min(hardCap, target + headroom); need = max(0, min(target, cap) - counted).
 */
export function computeClientSupplyTarget(input: ClientSupplyInput, config: BufferSupplyConfig): ClientSupplyTarget {
    const consumed = Math.max(0, Math.floor(input.consumed || 0));
    const counted = Math.max(0, Math.floor(input.counted || 0));
    const ratePerDay = consumed / config.consumptionWindowDays;
    const rawTarget = Math.ceil(ratePerDay * config.leadTimeDays) + config.safetyMargin;
    const target = Math.min(config.maxTarget, Math.max(config.minTarget, rawTarget));
    const cap = Math.min(config.hardCap, BUFFER_SUPPLY_HARD_CAP_MAX, target + config.capHeadroom);
    const need = Math.max(0, Math.min(target, cap) - counted);
    return { ratePerDay, rawTarget, target, cap, need };
}

// ---------------------------------------------------------------------------
// Fleet budget + distribution
// ---------------------------------------------------------------------------

export interface FleetBudgetInput {
    maxNewPerRun: number;
    weeklyCeiling: number;
    /** bufferClients enrolled (enrolledAt) in the trailing 7 days, any status. */
    enrolledLast7d: number;
    /** Active, assigned, non-terminal buffer accounts fleet-wide. */
    fleetWarming: number;
    leadTimeDays: number;
}

export interface FleetBudget {
    budget: number;
    weeklyRemaining: number;
    pipelineCapacity: number;
    pipelineRemaining: number;
}

/**
 * Enrolments allowed this run: the per-run maximum, the rolling-7-day engine ceiling, and the
 * pipeline the engine can carry (ceiling x lead weeks), whichever is smallest.
 */
export function computeFleetEnrollmentBudget(input: FleetBudgetInput): FleetBudget {
    const weeklyRemaining = Math.max(0, input.weeklyCeiling - Math.max(0, input.enrolledLast7d));
    const pipelineCapacity = Math.ceil((input.weeklyCeiling * input.leadTimeDays) / 7);
    const pipelineRemaining = Math.max(0, pipelineCapacity - Math.max(0, input.fleetWarming));
    const budget = Math.max(0, Math.min(input.maxNewPerRun, weeklyRemaining, pipelineRemaining));
    return { budget, weeklyRemaining, pipelineCapacity, pipelineRemaining };
}

export interface NeedEntry {
    clientId: string;
    need: number;
    target: number;
}

/**
 * Hands out `budget` slots one at a time to the client with the largest remaining deficit as a
 * share of its target (then the larger remaining need, then clientId), so a constrained budget is
 * spread by need instead of filling the first client in list order.
 */
export function allocateByNeed(entries: NeedEntry[], budget: number): Map<string, number> {
    const allocation = new Map<string, number>();
    const remaining = entries
        .filter((e) => e.need > 0)
        .map((e) => ({ clientId: e.clientId, left: e.need, target: Math.max(1, e.target) }));
    let slots = Math.max(0, Math.floor(budget));
    while (slots > 0) {
        let best: (typeof remaining)[number] | null = null;
        for (const entry of remaining) {
            if (entry.left <= 0) continue;
            if (!best) { best = entry; continue; }
            const a = entry.left / entry.target;
            const b = best.left / best.target;
            if (a > b || (a === b && (entry.left > best.left || (entry.left === best.left && entry.clientId < best.clientId)))) {
                best = entry;
            }
        }
        if (!best) break;
        best.left -= 1;
        allocation.set(best.clientId, (allocation.get(best.clientId) || 0) + 1);
        slots -= 1;
    }
    return allocation;
}
