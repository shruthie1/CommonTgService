/**
 * Per-pool onboarding profile (docs/design/2026-10-27-pool-onboarding-unification.md).
 *
 * Holds ONLY the intentional differences between the buffer and promote pools, as data, so the
 * shared onboarding code reads one object instead of two pasted copies. Values are today's exact
 * values; pacing values are owner-gated (tracker Q3) and must not be changed here casually.
 */
import { WarmupPhase, type WarmupPhaseType } from '../warmup-phases';

export type PoolKind = 'buffer' | 'promote';

/** A ClientHelperUtils.gaussianRandom(mean, sd, min, max) pacing draw, in ms. */
export interface GaussianPacing { mean: number; sd: number; min: number; max: number }

/**
 * One pacing draw (ms). `addProcessingDelay` adds config.clientProcessingDelay to mean/min/max
 * (gaussian) or to base (uniform). uniform = base + Math.random() * spread.
 */
export type PacingDraw =
    | { kind: 'gaussian'; mean: number; sd: number; min: number; max: number; addProcessingDelay?: boolean }
    | { kind: 'uniform'; base: number; spread: number; addProcessingDelay?: boolean }
    | { kind: 'fixed'; ms: number };

/** Join sweep + queue refill per-pool values (today's exact behaviour; pacing owner-gated Q3). */
export interface JoinSweepProfile {
    activeSetupMessage: string;
    startLog: string;
    /** The sweep takes a clientId and scopes refills to it (buffer). */
    scopesByClientId: boolean;
    /** Emit the 'Prepared buffer join-channel sweep' info log. */
    logPreparedSweep: boolean;
    afterConnect: PacingDraw | null;
    afterChannelInfo: PacingDraw | null;
    beforeFetchCandidates: PacingDraw | null;
    /** parseError context prefix (`${errorContext}: ${mobile}`); null = none. */
    errorContext: string | null;
    beforePermanentHandling: PacingDraw | null;
    betweenAccounts: PacingDraw;
    /** false = no gap after the last account (buffer). */
    gapAfterLastAccount: boolean;
    settle: PacingDraw;
    joinQueueStart: PacingDraw;
    leaveQueueStart: PacingDraw;
    /** `{join}` / `{leave}` are replaced with the queued counts. */
    resultTemplate: string;
    /** Unexpected errors after the refresh: null = propagate as-is; else log + throw this message. */
    wrapError: { log: string; message: string } | null;
    refillLeaveQueueStart: PacingDraw;
}

/** setAs* (operator enrolment) per-pool values. Messages are API responses: keep them exact. */
export interface SetAsProfile {
    entityName: 'BufferClient' | 'PromoteClient';
    userNotFoundMessage: string;
    alreadyExistsMessage: string;
    successMessage: string;
    /** Pacing draw after the channel-info read (buffer only today; owner-gated Q3). */
    postChannelInfoSleep: GaussianPacing | null;
    /** Pool-only fields on the stored doc (promote: lastActive 'default', Q10). */
    docExtras: Readonly<Record<string, unknown>>;
    /** parseError context; null = none. Shows in the HTTP message for errors without errorMessage. */
    errorContext: string | null;
    permanentErrorReason: string;
}

export interface PoolProfile {
    kind: PoolKind;
    /** Mongo collection name, used in cross-pool messages ("already enrolled in X"). */
    collection: 'bufferClients' | 'promoteClients';
    /** Capitalised label for logs and notices ("Buffer", "Promote"). */
    label: 'Buffer' | 'Promote';
    /** Channels a graduated account needs before its consumer can use it. */
    operationalFloor: number;
    /** Legacy per-client healthy cap. */
    legacyHealthyCap: number;
    minTotalClients: number;
    maxNewClientsPerTrigger: number;
    channelTarget: number;
    /** Pacing: owner-gated (Q3). */
    pacing: {
        clientProcessingDelayMs: number;
        leaveChannelIntervalMs: number;
    };
    /** Live main mobiles are kept out of joins/maintenance (a promote doc is never a main). */
    excludePrimaryMobiles: boolean;
    /** setAs* needs an explicit clientId (promote auto-assigns the client with the fewest). */
    setAsRequiresClientId: boolean;
    /** Terminal phases the warmup run still processes (owner-gated Q2). */
    terminalPhasesInWarmupRun: WarmupPhaseType[];
    setAs: Readonly<SetAsProfile>;
    joinSweep: Readonly<JoinSweepProfile>;
    warmupRun: Readonly<WarmupRunProfile>;
    /**
     * Minimum account age (days since createdAt) before the pool's consumer may use it (owner-gated
     * Q8). Buffer: CMS swap eligibility (client.service.ts). Promote: enforced by tg-platform's
     * promote selection, NOT by this repo; recorded here so both values sit side by side.
     */
    consumerMinAgeDays: number;
}

/** Warmup maintenance run per-pool values (the loop itself is shared: BaseClientService.runWarmupMaintenance). */
export interface WarmupRunProfile {
    /** Emit the 'Checking buffer clients, good IDs count' debug log. */
    logGoodIdsCount: boolean;
    /**
     * Enrolment planner that runs after warmup (owner-gated Q1): buffer = dynamic supply
     * (buffer-supply.ts), promote = legacy windows capped per client + engine budget (M12).
     */
    supplyPlanner: 'dynamic-supply' | 'legacy-windows-engine-budget';
}

export const BUFFER_PROFILE: Readonly<PoolProfile> = Object.freeze({
    kind: 'buffer',
    collection: 'bufferClients',
    label: 'Buffer',
    operationalFloor: 200,
    legacyHealthyCap: 20,
    minTotalClients: 10,
    maxNewClientsPerTrigger: 10,
    channelTarget: 350,
    pacing: Object.freeze({ clientProcessingDelayMs: 10000, leaveChannelIntervalMs: 120 * 1000 }),
    excludePrimaryMobiles: true,
    setAsRequiresClientId: true,
    terminalPhasesInWarmupRun: [WarmupPhase.SESSION_ROTATED],
    setAs: Object.freeze({
        entityName: 'BufferClient',
        userNotFoundMessage: 'user not found',
        alreadyExistsMessage: 'BufferClient already exist',
        successMessage: 'Client enrolled as buffer successfully',
        postChannelInfoSleep: Object.freeze({ mean: 7500, sd: 1250, min: 5000, max: 10000 }),
        docExtras: Object.freeze({}),
        errorContext: 'Failed to set as Buffer Client',
        permanentErrorReason: 'Permanent error during buffer enrollment',
    }),
    joinSweep: Object.freeze({
        activeSetupMessage: 'Active client setup exists, skipping',
        startLog: 'Starting join channel process for buffer clients',
        scopesByClientId: true,
        logPreparedSweep: true,
        afterConnect: null,
        afterChannelInfo: null,
        beforeFetchCandidates: null,
        errorContext: 'JoinChannelErr',
        beforePermanentHandling: null,
        betweenAccounts: Object.freeze({ kind: 'gaussian', mean: 2500, sd: 1500, min: 0, max: 5000, addProcessingDelay: true }),
        gapAfterLastAccount: false,
        settle: Object.freeze({ kind: 'gaussian', mean: 7500, sd: 750, min: 6000, max: 9000 }),
        joinQueueStart: Object.freeze({ kind: 'uniform', base: 4000, spread: 2000 }),
        leaveQueueStart: Object.freeze({ kind: 'gaussian', mean: 12500, sd: 1250, min: 10000, max: 15000 }),
        resultTemplate: 'Buffer Join queued for: {join}, Leave queued for: {leave}',
        wrapError: null,
        refillLeaveQueueStart: Object.freeze({ kind: 'gaussian', mean: 6500, sd: 1000, min: 5000, max: 8000 }),
    }),
    warmupRun: Object.freeze({ logGoodIdsCount: true, supplyPlanner: 'dynamic-supply' }),
    consumerMinAgeDays: 15,
}) as Readonly<PoolProfile>;

export const PROMOTE_PROFILE: Readonly<PoolProfile> = Object.freeze({
    kind: 'promote',
    collection: 'promoteClients',
    label: 'Promote',
    operationalFloor: 230,
    legacyHealthyCap: 30,
    minTotalClients: 12,
    maxNewClientsPerTrigger: 10,
    channelTarget: 350,
    pacing: Object.freeze({ clientProcessingDelayMs: 8000, leaveChannelIntervalMs: 60 * 1000 }),
    excludePrimaryMobiles: false,
    setAsRequiresClientId: false,
    terminalPhasesInWarmupRun: [],
    setAs: Object.freeze({
        entityName: 'PromoteClient',
        userNotFoundMessage: 'User not found',
        alreadyExistsMessage: 'PromoteClient already exists',
        successMessage: 'Client enrolled as promote successfully',
        postChannelInfoSleep: null,
        docExtras: Object.freeze({ lastActive: 'default' }),
        errorContext: null,
        permanentErrorReason: 'Permanent error during promote enrollment',
    }),
    joinSweep: Object.freeze({
        activeSetupMessage: 'Active client setup exists, skipping promotion',
        startLog: 'Starting join channel process',
        scopesByClientId: false,
        logPreparedSweep: false,
        afterConnect: Object.freeze({ kind: 'uniform', base: 5000, spread: 3000 }),
        afterChannelInfo: Object.freeze({ kind: 'uniform', base: 5000, spread: 3000 }),
        beforeFetchCandidates: Object.freeze({ kind: 'uniform', base: 5000, spread: 3000 }),
        errorContext: null,
        beforePermanentHandling: Object.freeze({ kind: 'fixed', ms: 1000 }),
        betweenAccounts: Object.freeze({ kind: 'uniform', base: 0, spread: 5000, addProcessingDelay: true }),
        gapAfterLastAccount: true,
        settle: Object.freeze({ kind: 'uniform', base: 6000, spread: 3000 }),
        joinQueueStart: Object.freeze({ kind: 'fixed', ms: 2000 }),
        leaveQueueStart: Object.freeze({ kind: 'fixed', ms: 5000 }),
        resultTemplate: 'Initiated Joining channels for {join} | Queued for leave: {leave}',
        wrapError: Object.freeze({ log: 'Unexpected error during joinchannelForPromoteClients:', message: 'Failed to initiate channel joining process' }),
        refillLeaveQueueStart: Object.freeze({ kind: 'uniform', base: 5000, spread: 3000 }),
    }),
    warmupRun: Object.freeze({ logGoodIdsCount: false, supplyPlanner: 'legacy-windows-engine-budget' }),
    consumerMinAgeDays: 7,
}) as Readonly<PoolProfile>;

/**
 * Whether one active, assigned account counts toward its client's legacy healthy cap.
 * Terminal: only at or above the pool's operational floor. Warming: unless warmup has stalled
 * (failed attempts at the limit). Age is never a health signal.
 */
export function isHealthyForLegacyCap(
    doc: { warmupPhase?: string | null; channels?: number | null; failedUpdateAttempts?: number | null },
    operationalFloor: number,
    maxFailedAttempts: number,
): boolean {
    const phase = doc.warmupPhase;
    if (!phase) return false;
    if (phase === WarmupPhase.READY || phase === WarmupPhase.SESSION_ROTATED) {
        return (doc.channels || 0) >= operationalFloor;
    }
    return (doc.failedUpdateAttempts || 0) < maxFailedAttempts;
}
