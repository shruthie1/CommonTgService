import {
    calculateWarmupPriority,
    WarmupPhase,
    type WarmupAction,
} from '../warmup-phases';

describe('calculateWarmupPriority', () => {
    const now = new Date('2026-08-03T00:00:00.000Z').getTime();
    const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);
    const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

    const action = (phase: WarmupAction['phase'], name: WarmupAction['action']): WarmupAction => ({
        phase,
        action: name,
        organicIntensity: 'light',
    });

    it('rescues a stale early-stage mutation above a recently touched maturing mutation', () => {
        const staleSettling = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: daysAgo(31),
            },
            action(WarmupPhase.SETTLING, 'set_privacy'),
            now,
        );
        const freshMaturing = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(48),
            },
            action(WarmupPhase.MATURING, 'upload_photo'),
            now,
        );

        expect(staleSettling).toBeGreaterThan(freshMaturing);
    });

    it('preserves phase priority for recently touched accounts', () => {
        const freshSettling = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(48),
            },
            action(WarmupPhase.SETTLING, 'set_privacy'),
            now,
        );
        const freshMaturing = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(48),
            },
            action(WarmupPhase.MATURING, 'upload_photo'),
            now,
        );

        expect(freshMaturing).toBeGreaterThan(freshSettling);
    });

    it('uses enrolled age for never-attempted accounts instead of treating every null attempt as ancient', () => {
        const newNeverAttempted = calculateWarmupPriority(
            { warmupPhase: WarmupPhase.SETTLING, enrolledAt: hoursAgo(12), lastUpdateAttempt: null },
            action(WarmupPhase.SETTLING, 'set_privacy'),
            now,
        );
        const oldNeverAttempted = calculateWarmupPriority(
            { warmupPhase: WarmupPhase.SETTLING, enrolledAt: daysAgo(45), lastUpdateAttempt: null },
            action(WarmupPhase.SETTLING, 'set_privacy'),
            now,
        );

        expect(oldNeverAttempted).toBeGreaterThan(newNeverAttempted);
        expect(newNeverAttempted).toBeLessThan(6000);
    });

    it('does not apply the large rescue bonus to non-progress organic-only work', () => {
        const staleOrganicOnly = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.GROWING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: daysAgo(31),
            },
            action(WarmupPhase.GROWING, 'organic_only'),
            now,
        );
        const freshMaturing = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(48),
            },
            action(WarmupPhase.MATURING, 'upload_photo'),
            now,
        );

        expect(freshMaturing).toBeGreaterThan(staleOrganicOnly);
    });
});
