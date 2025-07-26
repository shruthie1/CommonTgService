export declare function generateTGConfig(): {
    connectionRetries: number;
    requestRetries: number;
    retryDelay: number;
    timeout: number;
    autoReconnect: boolean;
    useWSS: boolean;
    maxConcurrentDownloads: number;
    downloadRetries: number;
    floodSleepThreshold: number;
    deviceModel: any;
    systemVersion: any;
    appVersion: any;
    useIPV6: boolean;
    testServers: boolean;
};
