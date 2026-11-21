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
 * Days IN the growing phase after which an account still below its pool's channel floor is reported
 * as stuck (`warmup-health kind=stuck reason=below_floor_past_deadline`). Owner 2026-11-21: growing
 * never advances below the pool floor (buffer 200 / promote 230). Before, past this deadline the
 * target dropped to 0 and the account advanced to maturing/ready with any count, but every consumer
 * (promote selection >= 230, buffer swap >= 200) refused it, so it was unusable supply that looked
 * finished. Now it stays in growing, keeps join priority, and the stuck line makes it visible.
 * Age still never retires an account; only permanent Telegram failures do.
 */
export const GROWING_ADVANCE_DEADLINE_DAYS = 30; // days IN growing past which a below-floor account is logged as stuck

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
    | 'remove_external_login_sessions'  // organic + revoke other sessions (AFTER 2FA is set)
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
    remove_external_login_sessions: 2000,
    set_2fa: 1000,
    update_username: 1500,
    update_name_bio: 1000,
    upload_photo: 1000,
    rotate_session: 2000,
};

const WARMUP_FAIR_AGING_ACTIONS: ReadonlySet<WarmupAction['action']> = new Set([
    'set_privacy',
    'set_2fa',
    'remove_external_login_sessions',
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
    // Real-progress timestamps: fair-aging measures time since the account last made ACTUAL
    // warmup progress (a completed step), NOT time since it was last touched. lastUpdateAttempt is
    // bumped by organic-only ticks too, which would reset the starvation clock on a day-gated
    // account and permanently hide it behind fresher accounts — the exact "68-day still-settling"
    // symptom. Keying on these step stamps lets a genuinely-stalled account accumulate its rescue
    // bonus regardless of organic activity. (lastUpdateAttempt still drives COOLDOWN, unchanged.)
    privacyUpdatedAt?: Date | string | null;
    twoFASetAt?: Date | string | null;
    otherAuthsRemovedAt?: Date | string | null;
    profilePicsDeletedAt?: Date | string | null;
    nameBioUpdatedAt?: Date | string | null;
    usernameUpdatedAt?: Date | string | null;
    profilePicsUpdatedAt?: Date | string | null;
    sessionRotatedAt?: Date | string | null;
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

    // Fair-aging clock = time since last REAL progress (a completed warmup step), not time since
    // last touch. Using the max of the step stamps means an account waiting out an inter-step
    // day-gate — or being deferred by the sensitive cap — keeps aging, while organic-only ticks
    // (which bump lastUpdateAttempt) no longer reset it. Falls back to enrol/ created for accounts
    // that have not completed a step yet (so brand-new enrolled accounts still age from enrollment).
    const lastProgress = Math.max(
        ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt),
        ClientHelperUtils.getTimestamp(doc.twoFASetAt),
        ClientHelperUtils.getTimestamp(doc.otherAuthsRemovedAt),
        ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt),
        ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt),
        ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt),
        ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt),
        ClientHelperUtils.getTimestamp(doc.sessionRotatedAt),
    );
    const lastTouch = lastProgress > 0
        ? lastProgress
        : (ClientHelperUtils.getTimestamp(doc.enrolledAt) || ClientHelperUtils.getTimestamp(doc.createdAt));
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
/**
 * Per-pool channel thresholds.
 *
 * THE INVARIANT: the count that lets an account LEAVE growing must equal the count a later gate
 * requires to USE it. Promote violated this (advanced at a hard-coded 200, but rotation and
 * selection demand 230), which stranded accounts in the 200-229 band: invisible to the warmup loop
 * because they were READY, and refused by rotation because they were under the floor.
 */
export interface WarmupChannelThresholds {
    /** The pool's operational floor — see BaseClientConfig.operationalChannelThreshold. */
    readonly operationalFloor: number;
}

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
    now: number,
    /**
     * Pool thresholds. Optional so existing callers keep the previous behaviour exactly; when
     * omitted the global MIN_CHANNELS_FOR_MATURING is used, which is correct for buffer (floor 200)
     * and was the only option before this parameter existed.
     */
    thresholds?: WarmupChannelThresholds,
): WarmupAction {
    const jitter = doc.warmupJitter || 0;
    const operationalFloor = thresholds?.operationalFloor ?? MIN_CHANNELS_FOR_MATURING;
    const channelsNow = doc.channels || 0;
    /** Below the pool's own floor this account is NOT usable supply, whatever phase it is in. */
    const belowOperationalFloor = channelsNow < operationalFloor;
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

    // Phase: SETTLING (sub-steps: set_privacy → set_2fa → remove_external_login_sessions)
    // Order matters: privacy first (lightweight), then 2FA (secures account),
    // then removeExternalLoginSessions (revokes user's sessions — safe because 2FA is already set)
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

        // Sub-step 3: Remove external login sessions (requires 2FA done 2+ days ago)
        if (!authsRemoved) {
            if (daysSince(doc.twoFASetAt) >= MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: WarmupPhase.SETTLING, action: 'remove_external_login_sessions', organicIntensity: 'medium' };
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
            return { phase, action: 'remove_external_login_sessions', organicIntensity: 'medium' };
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
        // Growing leaves only at the POOL's floor (owner 2026-11-21). No halving, no deadline drop:
        // an account that advanced below the floor was refused by every consumer anyway. A slow
        // account stays here, keeps join priority, and is logged as stuck past
        // GROWING_ADVANCE_DEADLINE_DAYS (see getGrowingDaysInPhase).
        const effectiveChannelTarget = operationalFloor;
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
        // RE-ENTRY: a READY account below its pool's floor is not usable supply — rotation and
        // selection both refuse it — and the warmup loop skips READY accounts, so nothing would
        // ever grow it back. Keep it joining instead of leaving it terminal-but-unusable.
        if (belowOperationalFloor) {
            return { phase: WarmupPhase.READY, action: 'join_channels', organicIntensity: 'light' };
        }
        const sessionRotated = ClientHelperUtils.getTimestamp(doc.sessionRotatedAt) > 0;
        if (!sessionRotated) {
            return { phase: WarmupPhase.READY, action: 'rotate_session', organicIntensity: 'light' };
        }
        return { phase: WarmupPhase.SESSION_ROTATED, action: 'wait', organicIntensity: 'light' };
    }

    // Phase: SESSION_ROTATED — fully operational
    if (phase === WarmupPhase.SESSION_ROTATED) {
        // Same re-entry rule: an account that drops below the floor after rotating (channels left
        // or purged) reports as done while being unusable. 21 promote accounts sit in exactly this
        // state. Give it a path back rather than an unconditional `wait`.
        if (belowOperationalFloor) {
            return { phase: WarmupPhase.SESSION_ROTATED, action: 'join_channels', organicIntensity: 'light' };
        }
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

/**
 * Actions that do a real warmup mutation and consume a slot of the per-run mutation cap.
 * organic_only / wait / join_channels / advance_to_ready do not (join_channels is delegated to the
 * join queue; advance_to_ready is a DB-only write).
 */
export const WARMUP_SLOT_ACTIONS: ReadonlySet<WarmupAction['action']> = new Set<WarmupAction['action']>([
    'set_privacy',
    'set_2fa',
    'remove_external_login_sessions',
    'delete_photos',
    'update_name_bio',
    'update_username',
    'upload_photo',
    'rotate_session',
]);

export function isWarmupSlotAction(action: WarmupAction['action'] | undefined): boolean {
    return !!action && WARMUP_SLOT_ACTIONS.has(action);
}

/**
 * When a slot action became due (ms), mirroring the gates in getWarmupPhaseAction. Used to order the
 * run longest-waiting first and to report a due step not done for >48 h as stuck. null when unknown
 * or not a slot action.
 */
export function getWarmupActionDueAt(
    doc: {
        warmupJitter?: number;
        enrolledAt?: Date | string | null;
        createdAt?: Date | string | null;
        privacyUpdatedAt?: Date | string | null;
        twoFASetAt?: Date | string | null;
        otherAuthsRemovedAt?: Date | string | null;
        profilePicsDeletedAt?: Date | string | null;
        nameBioUpdatedAt?: Date | string | null;
        usernameUpdatedAt?: Date | string | null;
    },
    action: WarmupAction['action'],
): number | null {
    const ts = (v: Date | string | null | undefined) => ClientHelperUtils.getTimestamp(v as Date);
    const jitter = doc.warmupJitter || 0;
    const enrolled = ts(doc.enrolledAt) || ts(doc.createdAt);
    const after = (base: number, days: number) => (base > 0 ? base + days * ONE_DAY_MS : 0);
    let due = 0;
    switch (action) {
        case 'set_privacy': due = after(enrolled, WARMUP_PHASE_THRESHOLDS.settling + jitter); break;
        case 'set_2fa': due = after(ts(doc.privacyUpdatedAt), MIN_DAYS_BETWEEN_IDENTITY_STEPS); break;
        case 'remove_external_login_sessions': due = after(ts(doc.twoFASetAt), MIN_DAYS_BETWEEN_IDENTITY_STEPS); break;
        case 'delete_photos': due = Math.max(
            after(ts(doc.otherAuthsRemovedAt), MIN_DAYS_AFTER_AUTH_CLEANUP_BEFORE_IDENTITY),
            after(enrolled, WARMUP_PHASE_THRESHOLDS.identity + jitter),
        ); break;
        case 'update_name_bio': due = after(ts(doc.profilePicsDeletedAt), MIN_DAYS_BETWEEN_IDENTITY_STEPS); break;
        case 'update_username': due = after(ts(doc.nameBioUpdatedAt), MIN_DAYS_AFTER_NAME_BIO_BEFORE_USERNAME); break;
        case 'upload_photo': due = Math.max(
            after(enrolled, WARMUP_PHASE_THRESHOLDS.maturing + jitter),
            after(ts(doc.usernameUpdatedAt), MIN_DAYS_AFTER_USERNAME_BEFORE_GROWING),
        ); break;
        default: return null;
    }
    return due > 0 ? due : null;
}

/** Days an account has spent in growing (from its growing threshold); 0 before it. */
export function getGrowingDaysInPhase(
    doc: { warmupJitter?: number; enrolledAt?: Date | string | null; createdAt?: Date | string | null },
    now: number,
): number {
    const enrolled = ClientHelperUtils.getTimestamp(doc.enrolledAt as Date) || ClientHelperUtils.getTimestamp(doc.createdAt as Date);
    if (enrolled <= 0) return 0;
    const start = enrolled + (WARMUP_PHASE_THRESHOLDS.growing + (doc.warmupJitter || 0)) * ONE_DAY_MS;
    return Math.max(0, (now - start) / ONE_DAY_MS);
}
