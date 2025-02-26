type PrivacyLevel = 'everybody' | 'contacts' | 'nobody';
export declare class UpdateProfileDto {
    firstName: string;
    lastName?: string;
    about?: string;
}
export declare class PrivacySettingsDto {
    phoneNumber?: PrivacyLevel;
    lastSeen?: PrivacyLevel;
    profilePhotos?: PrivacyLevel;
    forwards?: PrivacyLevel;
    calls?: PrivacyLevel;
    groups?: PrivacyLevel;
}
export declare class SecuritySettingsDto {
    twoFactorAuth: boolean;
    activeSessionsLimit?: number;
}
export declare class ProfilePhotoDto {
    name: string;
}
export {};
