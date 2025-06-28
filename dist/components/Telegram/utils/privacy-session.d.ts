import { TelegramClient } from 'telegram';
export declare function set2fa(client: TelegramClient): Promise<void>;
export declare function updatePrivacyBatch(client: TelegramClient, settings: {
    phoneNumber?: 'everybody' | 'contacts' | 'nobody';
    lastSeen?: 'everybody' | 'contacts' | 'nobody';
    profilePhotos?: 'everybody' | 'contacts' | 'nobody';
    forwards?: 'everybody' | 'contacts' | 'nobody';
    calls?: 'everybody' | 'contacts' | 'nobody';
    groups?: 'everybody' | 'contacts' | 'nobody';
}): Promise<boolean>;
export declare function updatePrivacy(client: TelegramClient): Promise<void>;
export declare function getSessionInfo(client: TelegramClient): Promise<{
    sessions: Array<{
        hash: string;
        deviceModel: string;
        platform: string;
        systemVersion: string;
        appName: string;
        dateCreated: Date;
        dateActive: Date;
        ip: string;
        country: string;
        region: string;
    }>;
    webSessions: Array<{
        hash: string;
        domain: string;
        browser: string;
        platform: string;
        dateCreated: Date;
        dateActive: Date;
        ip: string;
        region: string;
    }>;
}>;
export declare function terminateSession(client: TelegramClient, options: {
    hash: string;
    type: 'app' | 'web';
    exceptCurrent?: boolean;
}): Promise<boolean>;
export declare function deleteProfilePhotos(client: TelegramClient): Promise<void>;
export declare function createNewSession(client: TelegramClient): Promise<string>;
export declare function waitForOtp(client: TelegramClient): Promise<string>;
export declare function updateProfile(client: TelegramClient, firstName?: string, about?: string): Promise<void>;
export declare function updateUsername(client: TelegramClient, baseUsername: string, sleep: (ms: number) => Promise<void>): Promise<string>;
