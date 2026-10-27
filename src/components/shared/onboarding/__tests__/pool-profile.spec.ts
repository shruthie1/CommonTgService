import { BUFFER_PROFILE, ONBOARDING_PACING, PROMOTE_PROFILE, isHealthyForLegacyCap } from '../pool-profile';
import { WarmupPhase } from '../../warmup-phases';

describe('pool profiles (M4)', () => {
    test('hold today\'s exact per-pool values', () => {
        expect(BUFFER_PROFILE).toEqual({
            kind: 'buffer', collection: 'bufferClients', label: 'Buffer', operationalFloor: 200, legacyHealthyCap: 20,
            minTotalClients: 10, maxNewClientsPerTrigger: 10, channelTarget: 350,
            excludePrimaryMobiles: true, setAsRequiresClientId: true, terminalPhasesInWarmupRun: [WarmupPhase.SESSION_ROTATED],
            setAs: {
                entityName: 'BufferClient', userNotFoundMessage: 'user not found', alreadyExistsMessage: 'BufferClient already exist',
                successMessage: 'Client enrolled as buffer successfully',
                stampLastActive: false, errorContext: 'Failed to set as Buffer Client', permanentErrorReason: 'Permanent error during buffer enrollment',
            },
            joinSweep: {
                activeSetupMessage: 'Active client setup exists, skipping', startLog: 'Starting join channel process for buffer clients',
                scopesByClientId: true, logPreparedSweep: true, errorContext: 'JoinChannelErr',
                resultTemplate: 'Buffer Join queued for: {join}, Leave queued for: {leave}', wrapError: null,
            },
            warmupRun: { logGoodIdsCount: true, healthCheckShare: 20, capCountsSessionRotated: true }, // P1-1: as before the unification
            consumerMinAgeDays: 15,
        });
        expect(PROMOTE_PROFILE).toEqual({
            kind: 'promote', collection: 'promoteClients', label: 'Promote', operationalFloor: 230, legacyHealthyCap: 30,
            minTotalClients: 12, maxNewClientsPerTrigger: 10, channelTarget: 350,
            excludePrimaryMobiles: false, setAsRequiresClientId: false, terminalPhasesInWarmupRun: [WarmupPhase.SESSION_ROTATED], // Q2 2026-10-27
            setAs: {
                entityName: 'PromoteClient', userNotFoundMessage: 'User not found', alreadyExistsMessage: 'PromoteClient already exists',
                successMessage: 'Client enrolled as promote successfully',
                stampLastActive: true, errorContext: null, permanentErrorReason: 'Permanent error during promote enrollment',
            },
            joinSweep: {
                activeSetupMessage: 'Active client setup exists, skipping promotion', startLog: 'Starting join channel process',
                scopesByClientId: false, logPreparedSweep: false, errorContext: null,
                resultTemplate: 'Initiated Joining channels for {join} | Queued for leave: {leave}',
                wrapError: { log: 'Unexpected error during joinchannelForPromoteClients:', message: 'Failed to initiate channel joining process' },
            },
            warmupRun: { logGoodIdsCount: false, healthCheckShare: 4, capCountsSessionRotated: false }, // Q2: a few per run; P1-1: rotated not in the cap backlog
            consumerMinAgeDays: 15, // Q8 2026-10-27 (tg-platform fef4006)
        });
        expect(Object.isFrozen(BUFFER_PROFILE)).toBe(true);
        expect(Object.isFrozen(PROMOTE_PROFILE.joinSweep)).toBe(true);
    });

    test('Q3 (owner 2026-10-27): one pacing set for both pools, the slower of each former pair', () => {
        expect(ONBOARDING_PACING).toEqual({
            clientProcessingDelayMs: 10000,   // buffer 10 s; promote was 8 s
            leaveChannelIntervalMs: 120000,   // buffer 120 s; promote was 60 s
            setAsPostChannelInfoSleep: { mean: 7500, sd: 1250, min: 5000, max: 10000 }, // buffer; promote had none
            joinSweep: {
                afterConnect: { kind: 'uniform', base: 5000, spread: 3000 },          // promote; buffer had none
                afterChannelInfo: { kind: 'uniform', base: 5000, spread: 3000 },      // promote; buffer had none
                beforeFetchCandidates: { kind: 'uniform', base: 5000, spread: 3000 }, // promote; buffer had none
                beforePermanentHandling: { kind: 'fixed', ms: 1000 },                  // promote; buffer had none
                betweenAccounts: { kind: 'gaussian', mean: 2500, sd: 1500, min: 0, max: 5000, addProcessingDelay: true },
                settle: { kind: 'gaussian', mean: 7500, sd: 750, min: 6000, max: 9000 },
                joinQueueStart: { kind: 'uniform', base: 4000, spread: 2000 },        // buffer (promote fixed 2 s)
                leaveQueueStart: { kind: 'gaussian', mean: 12500, sd: 1250, min: 10000, max: 15000 }, // buffer (promote fixed 5 s)
                refillLeaveQueueStart: { kind: 'gaussian', mean: 6500, sd: 1000, min: 5000, max: 8000 },
            },
        });
        expect(Object.isFrozen(ONBOARDING_PACING.joinSweep)).toBe(true);
        expect('pacing' in BUFFER_PROFILE || 'pacing' in PROMOTE_PROFILE).toBe(false);
    });

    test.each([
        [{ warmupPhase: undefined }, 200, false],
        [{ warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 200 }, 200, true],
        [{ warmupPhase: WarmupPhase.READY, channels: 229 }, 230, false],
        [{ warmupPhase: WarmupPhase.READY, channels: 230 }, 230, true],
        [{ warmupPhase: WarmupPhase.SESSION_ROTATED }, 200, false],
        [{ warmupPhase: WarmupPhase.SETTLING, failedUpdateAttempts: 2 }, 200, true],
        [{ warmupPhase: WarmupPhase.SETTLING, failedUpdateAttempts: 3 }, 200, false],
        [{ warmupPhase: WarmupPhase.ENROLLED }, 230, true],
    ])('isHealthyForLegacyCap(%o, floor %d) = %s', (doc, floor, expected) => {
        expect(isHealthyForLegacyCap(doc as any, floor, 3)).toBe(expected);
    });
});
