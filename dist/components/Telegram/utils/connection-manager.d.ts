/// <reference types="node" />
import TelegramManager from '../TelegramManager';
export declare class ConnectionManager {
    private static instance;
    private clientRateLimiter;
    private operationRateLimiter;
    private activeConnections;
    private constructor();
    static getInstance(): ConnectionManager;
    acquireConnection(mobile: string, client: TelegramManager): Promise<void>;
    releaseConnection(mobile: string): Promise<void>;
    cleanupInactiveConnections(maxIdleTime?: number): Promise<void>;
    executeWithRateLimit<T>(mobile: string, operation: () => Promise<T>): Promise<T>;
    updateLastUsed(mobile: string): void;
    getActiveConnectionCount(): number;
    startCleanupInterval(interval?: number): NodeJS.Timer;
}
