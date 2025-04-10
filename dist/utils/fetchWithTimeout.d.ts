import { AxiosRequestConfig, AxiosResponse } from "axios";
interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    jitterFactor: number;
}
interface NotificationConfig {
    enabled: boolean;
    channelEnvVar: string;
    timeout: number;
}
interface FetchWithTimeoutOptions extends AxiosRequestConfig {
    bypassUrl?: string;
    retryConfig?: RetryConfig;
    notificationConfig?: NotificationConfig;
}
export declare function fetchWithTimeout(url: string, options?: FetchWithTimeoutOptions, maxRetries?: number): Promise<AxiosResponse | undefined>;
export {};
