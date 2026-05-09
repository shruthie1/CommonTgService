import { Api } from "telegram";
export interface ITelegramCredentials {
    apiId: number;
    apiHash: string;
}
export interface TGPlatformConfig {
    langPack: string;
    devices: {
        deviceModel: string;
        systemVersion: string;
    }[];
    appVersions: string[];
}
export declare function stableHash(str: string): number;
export declare function getTelegramCredentialsForMobile(mobile: string): ITelegramCredentials;
export declare function getTelegramCredentialPool(): readonly ITelegramCredentials[];
export interface TGProxyConfig {
    ip: string;
    port: number;
    socksType: 4 | 5;
    username?: string;
    password?: string;
    timeout?: number;
}
export interface TGClientConfig {
    apiId: number;
    apiHash: string;
    deviceModel: string;
    systemVersion: string;
    appVersion: string;
    langCode: string;
    systemLangCode: string;
    langPack: string;
    connectionRetries: number;
    requestRetries: number;
    retryDelay: number;
    timeout: number;
    autoReconnect: boolean;
    useWSS: boolean;
    useIPV6: boolean;
    testServers: boolean;
    proxy?: TGProxyConfig;
}
export interface TGAuthFingerprint {
    apiId: number;
    apiHash: string;
    platform: string;
    deviceModel: string;
    systemVersion: string;
    appVersion: string;
    langCode: string;
    systemLangCode: string;
    langPack: string;
}
export declare function generateTGConfig(mobile: string, proxy?: TGProxyConfig, options?: {
    platform?: string;
    apiId?: number;
    apiHash?: string;
    langCode?: string;
    systemLangCode?: string;
    connectionRetries?: number;
    requestRetries?: number;
    retryDelay?: number;
    timeout?: number;
}): TGClientConfig;
export declare function generateTGConfigWithProxy(mobile: string, proxyConfig: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    timeout?: number;
} | null, options?: Parameters<typeof generateTGConfig>[2]): TGClientConfig;
export declare function getAvailablePlatforms(): string[];
export declare function getPlatformConfig(platform: string): TGPlatformConfig | undefined;
export declare function getExpectedAuthFingerprint(mobile: string, options?: Parameters<typeof generateTGConfig>[2]): TGAuthFingerprint;
export declare function getAuthProtectionReason(auth: Api.Authorization): string | null;
export declare function isAuthAllowlisted(auth: Api.Authorization): boolean;
export declare function isAuthFingerprintMatch(mobile: string, auth: Api.Authorization): boolean;
