/**
 * Per-pool onboarding profile (docs/design/2026-10-27-pool-onboarding-unification.md).
 *
 * Holds ONLY the intentional differences between the buffer and promote pools, as data, so the
 * shared onboarding code reads one object instead of two pasted copies. Values are today's exact
 * values; pacing values are owner-gated (tracker Q3) and must not be changed here casually.
 */
import { WarmupPhase, type WarmupPhaseType } from '../warmup-phases';

export type PoolKind = 'buffer' | 'promote';

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
