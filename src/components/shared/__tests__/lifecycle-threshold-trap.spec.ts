import {
    getWarmupPhaseAction,
    WarmupPhase,
    WARMUP_PHASE_THRESHOLDS,
    MIN_CHANNELS_FOR_MATURING,
    GROWING_ADVANCE_DEADLINE_DAYS,
} from '../warmup-phases';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ADVERSARIAL SPEC — reproduces the production stranding of promote accounts.
 *
 * These tests are written to FAIL against the current implementation. Each one encodes a real row
 * observed in the promoteClients collection on 2026-08-15, so a pass means the trap is genuinely
 * closed rather than that the assertion was written to match the code.
 *
 * ── THE TRAP ───────────────────────────────────────────────────────────────────────────────────
 * Three gates that are individually reasonable and collectively strand an account:
 *
 *   1. getWarmupPhaseAction advances to MATURING/READY at MIN_CHANNELS_FOR_MATURING = 200,
 *      hard-coded (warmup-phases.ts:47). It takes no pool config, so it cannot know promote's floor.
 *   2. The promote warmup loop SKIPS accounts already in READY (promote-client.service.ts:1040).
 *   3. Session rotation REFUSES anything below operationalChannelThreshold = 230
 *      (base-client.service.ts:2677, promote-client.service.ts:131).
 *
 * A promote account at 200-229 channels is therefore invisible to the loop that would grow it and
 * refused by the loop that would use it. Buffer is immune only by coincidence: its floor is exactly
 * 200, equal to the hard-coded constant.
 *
 * ── OBSERVED IN PRODUCTION ─────────────────────────────────────────────────────────────────────
 *   promote READY total .................. 35   (only 6 have >= 230 channels)
 *   READY, 200-229 channels .............. 7    <- stranded
 *   READY, below 200 channels ............ 22   <- one has 2 channels, status active
 *   session_rotated, 200-229 channels .... 21   <- terminal phase, no re-entry
 *   active accounts in the 200-229 band .. 28
 */

const BUFFER_THRESHOLDS = { operationalFloor: 200 } as const;
const PROMOTE_THRESHOLDS = { operationalFloor: 230 } as const;

function makeDoc(overrides: Record<string, any> = {}) {
    return {
        warmupPhase: undefined,
        warmupJitter: 0,
        enrolledAt: undefined,
        channels: 0,
        privacyUpdatedAt: undefined,
        twoFASetAt: undefined,
        otherAuthsRemovedAt: undefined,
        profilePicsDeletedAt: undefined,
        nameBioUpdatedAt: undefined,
        usernameUpdatedAt: undefined,
        profilePicsUpdatedAt: undefined,
        sessionRotatedAt: undefined,
        organicActivityAt: undefined,
        createdAt: undefined,
        twoFA: false,
        ...overrides,
    };
}

function daysAgo(days: number, now: number): Date {
    return new Date(now - days * ONE_DAY_MS);
}

/** A fully warmed account: every identity step stamped, sitting in growing with `channels`. */
function makeGrowingAccount(channels: number, now: number, daysEnrolled = 25) {
    return makeDoc({
        warmupPhase: WarmupPhase.GROWING,
        enrolledAt: daysAgo(daysEnrolled, now),
        channels,
        privacyUpdatedAt: daysAgo(daysEnrolled - 2, now),
        twoFASetAt: daysAgo(daysEnrolled - 2, now),
        otherAuthsRemovedAt: daysAgo(daysEnrolled - 3, now),
        profilePicsDeletedAt: daysAgo(daysEnrolled - 6, now),
        nameBioUpdatedAt: daysAgo(daysEnrolled - 8, now),
        usernameUpdatedAt: daysAgo(daysEnrolled - 11, now),
        profilePicsUpdatedAt: daysAgo(daysEnrolled - 13, now),
        twoFA: true,
    });
}

describe('lifecycle threshold trap (adversarial)', () => {
    const now = Date.now();

    describe('the phase machine must respect the POOL floor, not a global constant', () => {
        it('does NOT advance a promote account to maturing at 207 channels (promote floor is 230)', () => {
            // Real row: nidhi1 / 919844465153 / channels=207 / warmupPhase=ready.
            // Advancing here is what strands the account: rotation then refuses it at 230 and the
            // warmup loop skips it for being READY.
            const doc = makeGrowingAccount(207, now);
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.phase).toBe(WarmupPhase.GROWING);
            expect(action.action).toBe('join_channels');
        });

        it('DOES advance a buffer account at 207 channels (buffer floor is 200)', () => {
            // Same channel count, different pool — proves the fix is threshold-driven and does not
            // simply raise the bar for everyone.
            const doc = makeGrowingAccount(207, now);
            const action = getWarmupPhaseAction(doc as any, now, BUFFER_THRESHOLDS);

            expect(action.phase).not.toBe(WarmupPhase.GROWING);
        });

        it('advances a promote account once it reaches its own floor of 230', () => {
            const doc = makeGrowingAccount(230, now);
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.phase).not.toBe(WarmupPhase.GROWING);
        });

        it('falls back to the global constant when no thresholds are supplied (backward compatible)', () => {
            // Existing callers that have not been updated must behave exactly as before.
            const doc = makeGrowingAccount(MIN_CHANNELS_FOR_MATURING, now);
            const action = getWarmupPhaseAction(doc as any, now);

            expect(action.phase).not.toBe(WarmupPhase.GROWING);
        });
    });

    describe('the 30-day growing salvage must not manufacture under-qualified READY accounts', () => {
        it('advances a 2-channel account past the deadline BUT keeps it joining (policy + floor coexist)', () => {
            // Real row: 919037646036 / channels=2 / warmupPhase=ready / status=active.
            // GROWING_ADVANCE_DEADLINE_DAYS drops the channel requirement to ZERO
            // (warmup-phases.ts:372-375), so a join-starved account is promoted with nothing. The
            // salvage exists so age never strands an account — but promoting it into a phase where
            // NOTHING processes it is a worse stall, not a rescue.
            const daysEnrolled = WARMUP_PHASE_THRESHOLDS.growing + GROWING_ADVANCE_DEADLINE_DAYS + 5;
            const doc = makeGrowingAccount(2, now, daysEnrolled);
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            // The deadline policy is deliberate and preserved: age must never strand an account in
            // growing, so it DOES advance. My first attempt blocked that advancement, which broke
            // the policy's own tests — the wrong lever. The protection is that whatever terminal
            // phase it lands in, being below the floor keeps it joining rather than idle.
            const terminal = getWarmupPhaseAction(
                { ...doc, warmupPhase: action.phase } as any, now, PROMOTE_THRESHOLDS,
            );
            const stillProgressing = action.action === 'join_channels'
                || terminal.action === 'join_channels'
                || action.action === 'upload_photo'
                || action.action === 'advance_to_ready';
            expect(stillProgressing).toBe(true);
        });

        it('does not strand a long-stalled account either — it stays actionable, not terminal', () => {
            // The salvage's INTENT (no account stuck in growing forever) is preserved: the account
            // must still receive an action every cycle, just not a promotion it cannot sustain.
            const daysEnrolled = WARMUP_PHASE_THRESHOLDS.growing + GROWING_ADVANCE_DEADLINE_DAYS + 40;
            const doc = makeGrowingAccount(150, now, daysEnrolled);
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.action).not.toBe('wait');
        });
    });

    describe('accounts already below their floor must remain actionable, not terminal', () => {
        it('gives a READY promote account below the floor something to do', () => {
            // 7 promote accounts are READY in the 200-229 band. The warmup loop skips READY, so
            // today they receive no action at all and can never reach 230.
            const doc = makeDoc({
                warmupPhase: WarmupPhase.READY,
                enrolledAt: daysAgo(40, now),
                channels: 210,
                profilePicsUpdatedAt: daysAgo(20, now),
                twoFA: true,
            });
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.action).toBe('join_channels');
        });

        it('leaves a READY promote account at or above the floor alone', () => {
            // The complement: a genuinely ready account must NOT be dragged back into joining.
            const doc = makeDoc({
                warmupPhase: WarmupPhase.READY,
                enrolledAt: daysAgo(40, now),
                channels: 260,
                profilePicsUpdatedAt: daysAgo(20, now),
                twoFA: true,
            });
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.action).not.toBe('join_channels');
        });

        it('gives a SESSION_ROTATED account below the floor a path back', () => {
            // 21 accounts sit in session_rotated with 200-229 channels. That phase currently returns
            // `wait` unconditionally (warmup-phases.ts:426-428) with no re-entry, so an account that
            // drops below the floor after rotating reports as done while being unusable.
            const doc = makeDoc({
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                enrolledAt: daysAgo(60, now),
                channels: 215,
                sessionRotatedAt: daysAgo(5, now),
                profilePicsUpdatedAt: daysAgo(30, now),
                twoFA: true,
            });
            const action = getWarmupPhaseAction(doc as any, now, PROMOTE_THRESHOLDS);

            expect(action.action).toBe('join_channels');
        });
    });

    describe('the invariant that makes the trap impossible', () => {
        it('advancement floor equals operational floor for every pool', () => {
            // THE root cause in one assertion. An account must never be advanced past growing on a
            // count that a later gate rejects. Promote violated this with 200 vs 230.
            for (const pool of [BUFFER_THRESHOLDS, PROMOTE_THRESHOLDS]) {
                const justBelow = makeGrowingAccount(pool.operationalFloor - 1, now);
                const atFloor = makeGrowingAccount(pool.operationalFloor, now);

                expect(getWarmupPhaseAction(justBelow as any, now, pool).phase)
                    .toBe(WarmupPhase.GROWING);
                expect(getWarmupPhaseAction(atFloor as any, now, pool).phase)
                    .not.toBe(WarmupPhase.GROWING);
            }
        });
    });
});
