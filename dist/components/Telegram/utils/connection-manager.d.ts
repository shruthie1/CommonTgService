import TelegramManager from '../TelegramManager';
import { UsersService } from '../../../components/users/users.service';
import { ConnectionStatusDto } from '../dto/connection-management.dto';
interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
}
interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    connectionAttempts: number;
    lastError?: string;
    state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
    retryConfig: RetryConfig;
    nextRetryAt?: number;
    consecutiveFailures: number;
    lastSuccessfulConnection?: number;
    cleanupAttempts?: number;
}
interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
    forceReconnect?: boolean;
}
interface ConnectionLeakReport {
    mapSize: number;
    activeConnections: string[];
    zombieConnections: string[];
    staleConnections: string[];
}
declare class ConnectionManager {
    private static instance;
    private clients;
    private readonly logger;
    private cleanupInterval;
    private usersService;
    private isShuttingDown;
    private readonly DEFAULT_RETRY_CONFIG;
    private readonly CONNECTION_TIMEOUT;
    private readonly MAX_CONCURRENT_CONNECTIONS;
    private readonly COOLDOWN_PERIOD;
    private readonly VALIDATION_TIMEOUT;
    private readonly CLEANUP_TIMEOUT;
    private readonly MAX_CLEANUP_ATTEMPTS;
    private constructor();
    setUsersService(usersService: UsersService): void;
    static getInstance(): ConnectionManager;
    handleShutdown(): Promise<void>;
    private createTimeoutPromise;
    private calculateRetryDelay;
    private shouldRetry;
    private waitForRetry;
    private validateConnection;
    getClient(mobile: string, options?: GetClientOptions): Promise<TelegramManager>;
    private retryConnection;
    private handleConnectionError;
    private createNewClient;
    private cleanupInactiveConnections;
    private updateLastUsed;
    hasClient(number: string): boolean;
    disconnectAll(): Promise<void>;
    unregisterClient(mobile: string, timeoutMs?: number): Promise<void>;
    private forceCleanupClient;
    getActiveConnectionCount(): number;
    getConnectionLeakReport(): ConnectionLeakReport;
    private performHealthCheck;
    startCleanupInterval(intervalMs?: number): NodeJS.Timeout;
    stopCleanupInterval(): void;
    getClientState(mobile: string): ConnectionStatusDto | undefined;
    getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnecting: number;
        disconnected: number;
        error: number;
        retrying: number;
    };
    getClientInfo(mobile: string): ClientInfo | undefined;
    forceReconnect(mobile: string): Promise<TelegramManager>;
    setRetryConfig(mobile: string, config: Partial<RetryConfig>): boolean;
}
export declare const connectionManager: ConnectionManager;
export {};
