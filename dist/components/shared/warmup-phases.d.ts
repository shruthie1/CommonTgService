export declare const WarmupPhase: {
    readonly ENROLLED: "enrolled";
    readonly SETTLING: "settling";
    readonly IDENTITY: "identity";
    readonly GROWING: "growing";
    readonly MATURING: "maturing";
    readonly READY: "ready";
    readonly SESSION_ROTATED: "session_rotated";
};
export type WarmupPhaseType = typeof WarmupPhase[keyof typeof WarmupPhase];
export declare const WARMUP_PHASE_THRESHOLDS: {
    readonly settling: 1;
    readonly identity: 4;
    readonly growing: 8;
    readonly maturing: 18;
    readonly ready: 20;
};
export declare const MIN_DAYS_BETWEEN_IDENTITY_STEPS = 2;
export declare const MIN_CHANNELS_FOR_MATURING = 200;
export interface WarmupAction {
    phase: WarmupPhaseType;
    action: 'wait' | 'organic_only' | 'set_privacy' | 'set_2fa' | 'remove_other_auths' | 'delete_photos' | 'update_name_bio' | 'update_username' | 'join_channels' | 'upload_photo' | 'advance_to_ready' | 'rotate_session';
    organicIntensity: 'light' | 'medium' | 'full';
}
export declare function getWarmupPhaseAction(doc: {
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
}, now: number): WarmupAction;
export declare function isAccountReady(phase: string | undefined): boolean;
export declare function isAccountWarmingUp(phase: string | null | undefined): boolean;
