export interface TGPlatformConfig {
    apiId: number;
    apiHash: string;
    langPack: string;
    devices: {
        deviceModel: string;
        systemVersion: string;
    }[];
    appVersions: string[];
}
export declare function stableHash(str: string): number;
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
