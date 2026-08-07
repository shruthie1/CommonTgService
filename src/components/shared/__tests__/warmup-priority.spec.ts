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
        // Stale settling: made NO real progress (privacy never set) since enrolling 45d ago — even
        // though it was TOUCHED recently (organic ticks bump lastUpdateAttempt). Fair-aging now keys
        // on real progress, so it correctly reads as starved despite the recent touch.
        const staleSettling = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(2), // touched recently by organic — must NOT reset aging
            },
            action(WarmupPhase.SETTLING, 'set_privacy'),
            now,
        );
        // Fresh maturing: made REAL progress recently (just did name/bio + username in the last 2d),
        // so it is genuinely not starved and keeps normal phase priority.
        const freshMaturing = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.MATURING,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(48),
                privacyUpdatedAt: daysAgo(40),
                twoFASetAt: daysAgo(38),
                otherAuthsRemovedAt: daysAgo(35),
                profilePicsDeletedAt: daysAgo(30),
                nameBioUpdatedAt: daysAgo(3),
                usernameUpdatedAt: hoursAgo(48),
            },
            action(WarmupPhase.MATURING, 'upload_photo'),
            now,
        );

        expect(staleSettling).toBeGreaterThan(freshMaturing);
    });

    it('keys aging on REAL progress, not touch: an organic tick does not reset the rescue clock', () => {
        // Same account, two views: one where its only recent event is an organic touch (progress
        // was 31d ago), one where it actually completed a step 2h ago. The organic-touched one MUST
        // still be rescued (aging survives organic); the real-progress one must NOT.
        const organicTouchedButStalled = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: hoursAgo(1),      // organic touched it 1h ago
                twoFASetAt: daysAgo(31),             // but last REAL progress was 31d ago
            },
            action(WarmupPhase.IDENTITY, 'update_name_bio'),
            now,
        );
        const actuallyProgressing = calculateWarmupPriority(
            {
                warmupPhase: WarmupPhase.IDENTITY,
                enrolledAt: daysAgo(45),
                lastUpdateAttempt: daysAgo(10),      // not touched in 10d...
                twoFASetAt: hoursAgo(2),             // ...but made REAL progress 2h ago
            },
            action(WarmupPhase.IDENTITY, 'update_name_bio'),
            now,
        );
        // The stalled-but-organically-touched account gets the rescue bonus; the recently-progressed
        // one does not — the opposite of what a lastUpdateAttempt-based clock would produce.
        expect(organicTouchedButStalled).toBeGreaterThan(actuallyProgressing);
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
