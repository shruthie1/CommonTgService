export declare class WebshareStatusDto {
    configured: boolean;
    apiKeyValid: boolean;
    totalProxiesInWebshare: number;
    totalProxiesInDb: number;
    lastSyncAt?: string;
    lastSyncError?: string;
}
