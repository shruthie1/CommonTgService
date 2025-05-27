import TelegramManager from '../TelegramManager';
import { UsersService } from '../../../components/users/users.service';
interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    connectionAttempts: number;
    isConnecting: boolean;
}
interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    maxRetries?: number;
}
interface ConnectionStats {
    activeConnections: number;
    totalConnections: number;
    failedConnections: number;
    cleanupCount: number;
}
declare class ConnectionManagerError extends Error {
    readonly mobile: string;
    readonly operation: string;
    readonly originalError?: Error;
    constructor(message: string, mobile: string, operation: string, originalError?: Error);
}
declare class ConnectionManager {
    private static instance;
    private clients;
    private readonly logger;
    private cleanupInterval;
    private usersService;
    private readonly maxRetries;
    private readonly connectionTimeout;
    private stats;
    private constructor();
    setUsersService(usersService: UsersService): void;
    static getInstance(): ConnectionManager;
    private cleanupInactiveConnections;
    private updateLastUsed;
    private validateMobile;
    private getUserByMobile;
    getClient(mobile: string, options?: GetClientOptions): Promise<TelegramManager>;
    private tryGetExistingClient;
    private waitForConnection;
    private createNewClientWithRetries;
    private createNewClient;
    private handleFinalError;
    private markUserAsExpired;
    hasClient(mobile: string): boolean;
    disconnectAll(): Promise<number>;
    private registerClient;
    unregisterClient(mobile: string): Promise<boolean>;
    getActiveConnectionCount(): number;
    getConnectionStats(): ConnectionStats;
    getClientInfo(mobile: string): Omit<ClientInfo, 'client'> | null;
    startCleanupInterval(intervalMs?: number): NodeJS.Timeout;
    stopCleanupInterval(): void;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        activeConnections: number;
        stats: ConnectionStats;
        issues: string[];
    }>;
}
export declare const connectionManager: ConnectionManager;
export { ConnectionManager, ConnectionManagerError };
