import { ClientHelperUtils } from './client-helper.utils';

/**
 * Warmup phases for buffer and promote clients.
 * Each phase has a PURPOSE visible to Telegram — mimicking how a real user
 * gradually customizes their account over weeks, not minutes.
 */
export const WarmupPhase = {
    ENROLLED: 'enrolled',
    SETTLING: 'settling',
    IDENTITY: 'identity',
    GROWING: 'growing',
    MATURING: 'maturing',
    READY: 'ready',
    SESSION_ROTATED: 'session_rotated',
} as const;

export type WarmupPhaseType = typeof WarmupPhase[keyof typeof WarmupPhase];

/**
 * Base day thresholds for phase transitions.
 * Actual threshold = baseDays + account's warmupJitter (0-3 random days).
 */
export const WARMUP_PHASE_THRESHOLDS = {
    settling: 1,      // Day 1+: first "app open", set privacy
    identity: 4,      // Day 4+: profile cleanup (one change per cycle)
    growing: 14,      // Day 14+: start joining channels after identity cooldown
    maturing: 20,     // Day 20+: final touches after capped channel growth
    ready: 24,        // Day 24+: fully warmed, eligible for use
} as const;

/**
 * Minimum days between identity sub-steps (delete photos, name/bio, username).
 */
export const MIN_DAYS_BETWEEN_IDENTITY_STEPS = 2;

/**
 * Extra safety gaps to avoid clustering security, identity, and growth actions.
 */
export const MIN_DAYS_AFTER_AUTH_CLEANUP_BEFORE_IDENTITY = 3;
export const MIN_DAYS_AFTER_NAME_BIO_BEFORE_USERNAME = 3;
export const MIN_DAYS_AFTER_USERNAME_BEFORE_GROWING = 2;

/**
 * Minimum channels required before maturing phase.
 */
export const MIN_CHANNELS_FOR_MATURING = 200;

/**
 * Hard deadline (in days spent in the GROWING phase, past its normal threshold) after which an
 * account advances to maturing with WHATEVER channels it has — the channel target stops being a
 * gate entirely. Guarantees no account is ever stranded in growing by a channel-supply problem
 * (spam-limit / join-starvation). Policy: elapsed time never stalls or retires an account; only
 * permanent Telegram failures inactivate. (Real prod finding 2026-08-02: ~18 promote accounts had
 * been stuck sub-target in growing for 44-60 days.)
 */
export const GROWING_ADVANCE_DEADLINE_DAYS = 30; // days IN growing past which channel target no longer gates

/**
 * Action returned by getWarmupPhaseAction — tells the caller what to do this cycle.
 */
export interface WarmupAction {
    phase: WarmupPhaseType;
    action:
    | 'wait'                // nothing to do — too early or on cooldown
    | 'organic_only'        // just perform organic activity, no admin changes
    | 'set_privacy'         // organic + privacy update
    | 'set_2fa'             // organic + set 2FA (early — secure the account)
    | 'remove_other_auths'  // organic + revoke other sessions (AFTER 2FA is set)
    | 'delete_photos'       // organic + delete profile photos
    | 'update_name_bio'     // organic + update name/bio
    | 'update_username'     // organic + set/clear username
    | 'join_channels'       // growing phase — channel joining
    | 'upload_photo'        // organic + upload profile photo
    | 'advance_to_ready'    // all steps done, mark as ready
    | 'rotate_session';     // create backup session
    organicIntensity: 'light' | 'medium' | 'full';
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const WARMUP_PHASE_PRIORITY: Record<WarmupPhaseType, number> = {
    [WarmupPhase.READY]: 25000,
    [WarmupPhase.MATURING]: 15000,
    [WarmupPhase.GROWING]: 10000,
    [WarmupPhase.IDENTITY]: 7000,
    [WarmupPhase.SETTLING]: 5000,
    [WarmupPhase.ENROLLED]: 3000,
    [WarmupPhase.SESSION_ROTATED]: 0,
};

const WARMUP_ACTION_PRIORITY: Partial<Record<WarmupAction['action'], number>> = {
    remove_other_auths: 2000,
    set_2fa: 1000,
    update_username: 1500,
    update_name_bio: 1000,
    upload_photo: 1000,
    rotate_session: 2000,
};

const WARMUP_FAIR_AGING_ACTIONS: ReadonlySet<WarmupAction['action']> = new Set([
    'set_privacy',
    'set_2fa',
    'remove_other_auths',
    'delete_photos',
    'update_name_bio',
    'update_username',
    'upload_photo',
    'advance_to_ready',
    'rotate_session',
]);

const WARMUP_FAILURE_PENALTY_CAP = 20;
const WARMUP_FAILURE_PENALTY_POINTS = 100;
const FAIR_AGING_GRACE_HOURS = 3 * 24;
const FAIR_AGING_FULL_RESCUE_HOURS = 30 * 24;
const FAIR_AGING_MAX_BONUS = 20000;

export interface WarmupPriorityInput {
    warmupPhase?: WarmupPhaseType;
    lastUpdateAttempt?: Date | string | null;
    enrolledAt?: Date | string | null;
    createdAt?: Date | string | null;
    failedUpdateAttempts?: number | null;
}

/**
 * Scores a warmup account for bounded fair scheduling.
 *
 * Freshly touched accounts keep the normal phase/sub-step priority, so near-finished accounts still
 * drain first in ordinary operation. Once an account has not been touched for several days, the
 * age bonus grows until it can dominate phase gaps; this prevents old early-stage accounts from
 * being permanently hidden behind recently-touched growing/maturing accounts.
 */
export function calculateWarmupPriority(
    doc: WarmupPriorityInput,
    warmupAction: WarmupAction,
    now: number,
): number {
    const phaseBoost = WARMUP_PHASE_PRIORITY[warmupAction.phase] ?? 5000;
    const actionBonus = WARMUP_ACTION_PRIORITY[warmupAction.action] || 0;
    const failedAttempts = Math.max(0, doc.failedUpdateAttempts || 0);
    const failurePenalty = Math.min(failedAttempts, WARMUP_FAILURE_PENALTY_CAP) * WARMUP_FAILURE_PENALTY_POINTS;

    const lastTouch =
        ClientHelperUtils.getTimestamp(doc.lastUpdateAttempt) ||
        ClientHelperUtils.getTimestamp(doc.enrolledAt) ||
        ClientHelperUtils.getTimestamp(doc.createdAt);
    const lastTouchAgeHours = lastTouch > 0 ? Math.max(0, (now - lastTouch) / ONE_HOUR_MS) : 0;
    const agingWindowHours = FAIR_AGING_FULL_RESCUE_HOURS - FAIR_AGING_GRACE_HOURS;
    const starvationHours = Math.max(0, lastTouchAgeHours - FAIR_AGING_GRACE_HOURS);
    const ageRatio = Math.min(1, starvationHours / agingWindowHours);
    const fairAgeBonus = WARMUP_FAIR_AGING_ACTIONS.has(warmupAction.action)
        ? Math.round(ageRatio * FAIR_AGING_MAX_BONUS)
        : 0;

    return phaseBoost + actionBonus + fairAgeBonus - failurePenalty;
}

/**
 * Determine what warmup action to perform for a client document.
 * Replaces the old getPendingUpdates() — strict sequential gating, no bypasses.
 *
 * @param doc - Buffer or promote client document
 * @param now - Current time in ms
 * @returns WarmupAction describing what to do
 */
export function getWarmupPhaseAction(
    doc: {
        warmupPhase?: WarmupPhaseType;
        warmupJitter?: number;
        enrolledAt?: Date;
        channels?: number;
        privacyUpdatedAt?: Date;
        twoFASetAt?: Date;
        otherAuthsRemovedAt?: Date;
        profilePicsDeletedAt?: Date;
        nameBioUpdatedAt?: Date;
        usernameUpdatedAt?: Date;
        profilePicsUpdatedAt?: Date;
        sessionRotatedAt?: Date;
        organicActivityAt?: Date;
        createdAt?: Date;
        twoFA?: boolean;
    },
    now: number
): WarmupAction {
    const jitter = doc.warmupJitter || 0;
    const enrolledAt = ClientHelperUtils.getTimestamp(doc.enrolledAt) || ClientHelperUtils.getTimestamp(doc.createdAt);
    const daysSinceEnrolled = enrolledAt > 0 ? (now - enrolledAt) / ONE_DAY_MS : 0;

    const phase = doc.warmupPhase || WarmupPhase.ENROLLED;

    // Helper: time since a timestamp in days
    const daysSince = (date: Date | null | undefined): number => {
        const ts = ClientHelperUtils.getTimestamp(date);
        return ts > 0 ? (now - ts) / ONE_DAY_MS : Infinity;
    };

    // Phase: ENROLLED → SETTLING
    if (phase === WarmupPhase.ENROLLED) {
        if (daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.settling + jitter) {
            return { phase: WarmupPhase.SETTLING, action: 'set_privacy', organicIntensity: 'full' };
        }
        return { phase: WarmupPhase.ENROLLED, action: 'wait', organicIntensity: 'light' };
    }

    // Phase: SETTLING (sub-steps: set_privacy → set_2fa → remove_other_auths)
    // Order matters: privacy first (lightweight), then 2FA (secures account),
    // then removeOtherAuths (revokes user's sessions — safe because 2FA is already set)
    if (phase === WarmupPhase.SETTLING) {
        const privacyDone = ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt) > 0;
        const twoFADone = ClientHelperUtils.getTimestamp(doc.twoFASetAt) > 0;
        const authsRemoved = ClientHelperUtils.getTimestamp(doc.otherAuthsRemovedAt) > 0;

        // Sub-step 1: Set privacy
        if (!privacyDone) {
            return { phase: WarmupPhase.SETTLING, action: 'set_privacy', organicIntensity: 'full' };
        }

        // Sub-step 2: Set 2FA (requires privacy done 2+ days ago)
        if (!twoFADone) {
            if (daysSince(doc.privacyUpdatedAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: WarmupPhase.SETTLING, action: 'set_2fa', organicIntensity: 'full' };
            }
            return { phase: WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'medium' };
        }

        // Sub-step 3: Remove other auths (requires 2FA done 2+ days ago)
        if (!authsRemoved) {
            if (daysSince(doc.twoFASetAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: WarmupPhase.SETTLING, action: 'remove_other_auths', organicIntensity: 'medium' };
            }
            return { phase: WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'light' };
        }

        // All settling steps done — let security cleanup cool down before profile edits.
        if (
            daysSince(doc.otherAuthsRemovedAt) >= MIN_DAYS_AFTER_AUTH_CLEANUP_BEFORE_IDENTITY &&
            daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.identity + jitter
        ) {
            return { phase: WarmupPhase.IDENTITY, action: 'delete_photos', organicIntensity: 'medium' };
        }
        return { phase: WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'medium' };
    }

    // Phase: IDENTITY (sub-steps: delete photos → name/bio → username)
    if (phase === WarmupPhase.IDENTITY) {
        const photosDeleted = ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt) > 0;
        const nameBioDone = ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt) > 0;
        const usernameDone = ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt) > 0;

        // Sub-step 1: Delete photos
        if (!photosDeleted) {
            return { phase: WarmupPhase.IDENTITY, action: 'delete_photos', organicIntensity: 'medium' };
        }

        // Sub-step 2: Name/Bio (requires photos deleted 2+ days ago)
        if (!nameBioDone) {
            if (daysSince(doc.profilePicsDeletedAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: WarmupPhase.IDENTITY, action: 'update_name_bio', organicIntensity: 'medium' };
            }
            return { phase: WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
        }

        // Sub-step 3: Username (requires name/bio done 2+ days ago)
        if (!usernameDone) {
            if (daysSince(doc.nameBioUpdatedAt) >= MIN_DAYS_AFTER_NAME_BIO_BEFORE_USERNAME) {
                return { phase: WarmupPhase.IDENTITY, action: 'update_username', organicIntensity: 'medium' };
            }
            return { phase: WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
        }

        // All identity steps complete — check if ready for growing
        if (
            daysSince(doc.usernameUpdatedAt) >= MIN_DAYS_AFTER_USERNAME_BEFORE_GROWING &&
            daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.growing + jitter
        ) {
            return { phase: WarmupPhase.GROWING, action: 'join_channels', organicIntensity: 'light' };
        }
        return { phase: WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
    }

    // ── Catch-up helper: legacy accounts may have been placed in growing/maturing
    // by phase inference (based on channel count) but never completed settling or
    // identity steps.  Redirect to the earliest missing step so the pipeline
    // finishes everything before advancing.
    const missedSettlingAction = (): WarmupAction | null => {
        const privacyDone = ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt) > 0;
        const twoFADone = ClientHelperUtils.getTimestamp(doc.twoFASetAt) > 0;
        const authsRemoved = ClientHelperUtils.getTimestamp(doc.otherAuthsRemovedAt) > 0;
        if (!privacyDone) return { phase, action: 'set_privacy', organicIntensity: 'full' };
        if (!twoFADone && daysSince(doc.privacyUpdatedAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
            return { phase, action: 'set_2fa', organicIntensity: 'full' };
        }
        if (!twoFADone) return { phase, action: 'organic_only', organicIntensity: 'medium' };
        if (!authsRemoved && daysSince(doc.twoFASetAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
            return { phase, action: 'remove_other_auths', organicIntensity: 'medium' };
        }
        if (!authsRemoved) return { phase, action: 'organic_only', organicIntensity: 'light' };
        return null;
    };

    const missedIdentityAction = (): WarmupAction | null => {
        const photosDeleted = ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt) > 0;
        const nameBioDone = ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt) > 0;
        const usernameDone = ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt) > 0;
        if (daysSince(doc.otherAuthsRemovedAt) < MIN_DAYS_AFTER_AUTH_CLEANUP_BEFORE_IDENTITY) {
            return { phase, action: 'organic_only', organicIntensity: 'light' };
        }
        if (!photosDeleted) return { phase, action: 'delete_photos', organicIntensity: 'medium' };
        if (!nameBioDone && daysSince(doc.profilePicsDeletedAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
            return { phase, action: 'update_name_bio', organicIntensity: 'medium' };
        }
        if (!nameBioDone) return { phase, action: 'organic_only', organicIntensity: 'light' };
        if (!usernameDone && daysSince(doc.nameBioUpdatedAt) >= MIN_DAYS_AFTER_NAME_BIO_BEFORE_USERNAME) {
            return { phase, action: 'update_username', organicIntensity: 'medium' };
        }
        if (!usernameDone) return { phase, action: 'organic_only', organicIntensity: 'light' };
        if (daysSince(doc.usernameUpdatedAt) < MIN_DAYS_AFTER_USERNAME_BEFORE_GROWING) {
            return { phase, action: 'organic_only', organicIntensity: 'light' };
        }
        return null;
    };

    // Phase: GROWING (channel joining)
    if (phase === WarmupPhase.GROWING) {
        // Catch-up: complete any missed settling/identity steps first
        const settlingCatchup = missedSettlingAction();
        if (settlingCatchup) return settlingCatchup;
        const identityCatchup = missedIdentityAction();
        if (identityCatchup) return identityCatchup;

        const channels = doc.channels || 0;
        // Channel target is a GOAL, never a permanent gate. Keep joining channels until the account
        // reaches the target — but the requirement decays with time so a join-starved / spam-limited
        // account is NEVER stranded in growing (policy: age never stalls or retires an account, only
        // permanent Telegram failures do). Past GROWING_ADVANCE_DEADLINE_DAYS the account advances
        // with whatever channels it has.
        const growingDuration = daysSinceEnrolled - (WARMUP_PHASE_THRESHOLDS.growing + jitter);
        const stalledLong = growingDuration > (WARMUP_PHASE_THRESHOLDS.maturing - WARMUP_PHASE_THRESHOLDS.growing) * 2;
        const pastAdvanceDeadline = growingDuration > GROWING_ADVANCE_DEADLINE_DAYS;
        // Full target normally; halved once stalled; no requirement at all past the deadline.
        const effectiveChannelTarget = pastAdvanceDeadline
            ? 0
            : (stalledLong ? Math.floor(MIN_CHANNELS_FOR_MATURING / 2) : MIN_CHANNELS_FOR_MATURING);
        if (channels < effectiveChannelTarget) {
            return { phase: WarmupPhase.GROWING, action: 'join_channels', organicIntensity: 'light' };
        }
        // Channels target met — check if ready for maturing
        if (daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.maturing + jitter) {
            const hasPhoto = ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt) > 0;
            if (!hasPhoto) {
                return { phase: WarmupPhase.MATURING, action: 'upload_photo', organicIntensity: 'full' };
            }
            // Photo done — enforce day-20 floor before advancing to ready
            if (daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.ready + jitter) {
                return { phase: WarmupPhase.MATURING, action: 'advance_to_ready', organicIntensity: 'light' };
            }
            return { phase: WarmupPhase.MATURING, action: 'organic_only', organicIntensity: 'light' };
        }
        // Channels done but too early for maturing — keep doing organic
        return { phase: WarmupPhase.GROWING, action: 'organic_only', organicIntensity: 'light' };
    }

    // Phase: MATURING (profile photo + catch-up for missed steps)
    if (phase === WarmupPhase.MATURING) {
        // Catch-up: complete any missed settling/identity steps first
        const settlingCatchup = missedSettlingAction();
        if (settlingCatchup) return settlingCatchup;
        const identityCatchup = missedIdentityAction();
        if (identityCatchup) return identityCatchup;

        const hasPhoto = ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt) > 0;

        if (!hasPhoto) {
            return { phase: WarmupPhase.MATURING, action: 'upload_photo', organicIntensity: 'full' };
        }

        // Photo done — enforce day-20 floor before advancing to ready
        if (daysSinceEnrolled >= WARMUP_PHASE_THRESHOLDS.ready + jitter) {
            return { phase: WarmupPhase.MATURING, action: 'advance_to_ready', organicIntensity: 'light' };
        }
        return { phase: WarmupPhase.MATURING, action: 'organic_only', organicIntensity: 'light' };
    }

    // Phase: READY — all done, eligible for use
    if (phase === WarmupPhase.READY) {
        const sessionRotated = ClientHelperUtils.getTimestamp(doc.sessionRotatedAt) > 0;
        if (!sessionRotated) {
            return { phase: WarmupPhase.READY, action: 'rotate_session', organicIntensity: 'light' };
        }
        return { phase: WarmupPhase.SESSION_ROTATED, action: 'wait', organicIntensity: 'light' };
    }

    // Phase: SESSION_ROTATED — fully operational
    if (phase === WarmupPhase.SESSION_ROTATED) {
        return { phase: WarmupPhase.SESSION_ROTATED, action: 'wait', organicIntensity: 'light' };
    }

    // Unknown phase — treat as enrolled
    return { phase: WarmupPhase.ENROLLED, action: 'wait', organicIntensity: 'light' };
}

/**
 * Check if a warmup phase indicates the account is ready for active use.
 */
export function isAccountReady(phase: string | undefined): boolean {
    return phase === WarmupPhase.SESSION_ROTATED;
}

/**
 * Check if a warmup phase indicates the account is still warming up.
 */
export function isAccountWarmingUp(phase: string | null | undefined): boolean {
    // null/undefined = no warmupPhase set = treated as enrolled by state machine = warming up
    if (!phase) return true;
    return [
        WarmupPhase.ENROLLED as string,
        WarmupPhase.SETTLING as string,
        WarmupPhase.IDENTITY as string,
        WarmupPhase.GROWING as string,
        WarmupPhase.MATURING as string,
    ].includes(phase as string);
}
