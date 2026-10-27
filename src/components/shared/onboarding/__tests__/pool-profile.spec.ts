import { BUFFER_PROFILE, PROMOTE_PROFILE, isHealthyForLegacyCap } from '../pool-profile';
import { WarmupPhase } from '../../warmup-phases';

describe('pool profiles (M4)', () => {
    test('hold today\'s exact per-pool values', () => {
        expect(BUFFER_PROFILE).toEqual({
            kind: 'buffer', collection: 'bufferClients', label: 'Buffer', operationalFloor: 200, legacyHealthyCap: 20,
            minTotalClients: 10, maxNewClientsPerTrigger: 10, channelTarget: 350,
            pacing: { clientProcessingDelayMs: 10000, leaveChannelIntervalMs: 120000 },
            excludePrimaryMobiles: true, setAsRequiresClientId: true, terminalPhasesInWarmupRun: [WarmupPhase.SESSION_ROTATED],
        });
        expect(PROMOTE_PROFILE).toEqual({
            kind: 'promote', collection: 'promoteClients', label: 'Promote', operationalFloor: 230, legacyHealthyCap: 30,
            minTotalClients: 12, maxNewClientsPerTrigger: 10, channelTarget: 350,
            pacing: { clientProcessingDelayMs: 8000, leaveChannelIntervalMs: 60000 },
            excludePrimaryMobiles: false, setAsRequiresClientId: false, terminalPhasesInWarmupRun: [],
        });
        expect(Object.isFrozen(BUFFER_PROFILE)).toBe(true);
        expect(Object.isFrozen(PROMOTE_PROFILE.pacing)).toBe(true);
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
