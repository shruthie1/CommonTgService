"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CHANNELS_FOR_MATURING = exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS = exports.WARMUP_PHASE_THRESHOLDS = exports.WarmupPhase = void 0;
exports.getWarmupPhaseAction = getWarmupPhaseAction;
exports.isAccountReady = isAccountReady;
exports.isAccountWarmingUp = isAccountWarmingUp;
const client_helper_utils_1 = require("./client-helper.utils");
exports.WarmupPhase = {
    ENROLLED: 'enrolled',
    SETTLING: 'settling',
    IDENTITY: 'identity',
    GROWING: 'growing',
    MATURING: 'maturing',
    READY: 'ready',
    SESSION_ROTATED: 'session_rotated',
};
exports.WARMUP_PHASE_THRESHOLDS = {
    settling: 1,
    identity: 4,
    growing: 8,
    maturing: 18,
    ready: 20,
};
exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS = 2;
exports.MIN_CHANNELS_FOR_MATURING = 200;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function getWarmupPhaseAction(doc, now) {
    const jitter = doc.warmupJitter || 0;
    const enrolledAt = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.enrolledAt) || client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.createdAt);
    const daysSinceEnrolled = enrolledAt > 0 ? (now - enrolledAt) / ONE_DAY_MS : 0;
    const phase = doc.warmupPhase || exports.WarmupPhase.ENROLLED;
    const daysSince = (date) => {
        const ts = client_helper_utils_1.ClientHelperUtils.getTimestamp(date);
        return ts > 0 ? (now - ts) / ONE_DAY_MS : Infinity;
    };
    if (phase === exports.WarmupPhase.ENROLLED) {
        if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.settling + jitter) {
            return { phase: exports.WarmupPhase.SETTLING, action: 'set_privacy', organicIntensity: 'full' };
        }
        return { phase: exports.WarmupPhase.ENROLLED, action: 'wait', organicIntensity: 'light' };
    }
    if (phase === exports.WarmupPhase.SETTLING) {
        const privacyDone = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt) > 0;
        const twoFADone = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.twoFASetAt) > 0;
        const authsRemoved = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.otherAuthsRemovedAt) > 0;
        if (!privacyDone) {
            return { phase: exports.WarmupPhase.SETTLING, action: 'set_privacy', organicIntensity: 'full' };
        }
        if (!twoFADone) {
            if (daysSince(doc.privacyUpdatedAt) >= exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: exports.WarmupPhase.SETTLING, action: 'set_2fa', organicIntensity: 'full' };
            }
            return { phase: exports.WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'medium' };
        }
        if (!authsRemoved) {
            if (daysSince(doc.twoFASetAt) >= exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: exports.WarmupPhase.SETTLING, action: 'remove_other_auths', organicIntensity: 'medium' };
            }
            return { phase: exports.WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'light' };
        }
        if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.identity + jitter) {
            return { phase: exports.WarmupPhase.IDENTITY, action: 'delete_photos', organicIntensity: 'medium' };
        }
        return { phase: exports.WarmupPhase.SETTLING, action: 'organic_only', organicIntensity: 'medium' };
    }
    if (phase === exports.WarmupPhase.IDENTITY) {
        const photosDeleted = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt) > 0;
        const nameBioDone = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt) > 0;
        const usernameDone = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt) > 0;
        if (!photosDeleted) {
            return { phase: exports.WarmupPhase.IDENTITY, action: 'delete_photos', organicIntensity: 'medium' };
        }
        if (!nameBioDone) {
            if (daysSince(doc.profilePicsDeletedAt) >= exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: exports.WarmupPhase.IDENTITY, action: 'update_name_bio', organicIntensity: 'medium' };
            }
            return { phase: exports.WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
        }
        if (!usernameDone) {
            if (daysSince(doc.nameBioUpdatedAt) >= exports.MIN_DAYS_BETWEEN_IDENTITY_STEPS) {
                return { phase: exports.WarmupPhase.IDENTITY, action: 'update_username', organicIntensity: 'medium' };
            }
            return { phase: exports.WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
        }
        if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.growing + jitter) {
            return { phase: exports.WarmupPhase.GROWING, action: 'join_channels', organicIntensity: 'light' };
        }
        return { phase: exports.WarmupPhase.IDENTITY, action: 'organic_only', organicIntensity: 'light' };
    }
    if (phase === exports.WarmupPhase.GROWING) {
        const channels = doc.channels || 0;
        if (channels < exports.MIN_CHANNELS_FOR_MATURING) {
            return { phase: exports.WarmupPhase.GROWING, action: 'join_channels', organicIntensity: 'light' };
        }
        if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.maturing + jitter) {
            const hasPhoto = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt) > 0;
            if (!hasPhoto) {
                return { phase: exports.WarmupPhase.MATURING, action: 'upload_photo', organicIntensity: 'full' };
            }
            if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.ready + jitter) {
                return { phase: exports.WarmupPhase.MATURING, action: 'advance_to_ready', organicIntensity: 'light' };
            }
            return { phase: exports.WarmupPhase.MATURING, action: 'organic_only', organicIntensity: 'light' };
        }
        return { phase: exports.WarmupPhase.GROWING, action: 'organic_only', organicIntensity: 'light' };
    }
    if (phase === exports.WarmupPhase.MATURING) {
        const hasPhoto = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt) > 0;
        if (!hasPhoto) {
            return { phase: exports.WarmupPhase.MATURING, action: 'upload_photo', organicIntensity: 'full' };
        }
        if (daysSinceEnrolled >= exports.WARMUP_PHASE_THRESHOLDS.ready + jitter) {
            return { phase: exports.WarmupPhase.MATURING, action: 'advance_to_ready', organicIntensity: 'light' };
        }
        return { phase: exports.WarmupPhase.MATURING, action: 'organic_only', organicIntensity: 'light' };
    }
    if (phase === exports.WarmupPhase.READY) {
        const sessionRotated = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.sessionRotatedAt) > 0;
        if (!sessionRotated) {
            return { phase: exports.WarmupPhase.READY, action: 'rotate_session', organicIntensity: 'light' };
        }
        return { phase: exports.WarmupPhase.SESSION_ROTATED, action: 'wait', organicIntensity: 'light' };
    }
    if (phase === exports.WarmupPhase.SESSION_ROTATED) {
        return { phase: exports.WarmupPhase.SESSION_ROTATED, action: 'wait', organicIntensity: 'light' };
    }
    return { phase: exports.WarmupPhase.ENROLLED, action: 'wait', organicIntensity: 'light' };
}
function isAccountReady(phase) {
    return phase === exports.WarmupPhase.SESSION_ROTATED;
}
function isAccountWarmingUp(phase) {
    if (!phase)
        return true;
    return [
        exports.WarmupPhase.ENROLLED,
        exports.WarmupPhase.SETTLING,
        exports.WarmupPhase.IDENTITY,
        exports.WarmupPhase.GROWING,
        exports.WarmupPhase.MATURING,
    ].includes(phase);
}
//# sourceMappingURL=warmup-phases.js.map