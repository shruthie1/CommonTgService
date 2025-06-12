import TelegramManager from '../TelegramManager';
import { UsersService } from '../../../components/users/users.service';
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
    lastError?: Error;
    state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
    retryConfig: RetryConfig;
    nextRetryAt?: number;
    consecutiveFailures: number;
    lastSuccessfulConnection?: number;
}
interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
    forceReconnect?: boolean;
}
declare class ConnectionManager {
    private static instance;
    private clients;
    private readonly logger;
    private cleanupInterval;
    private usersService;
    private boundShutdownHandler;
    private readonly DEFAULT_RETRY_CONFIG;
    private readonly CONNECTION_TIMEOUT;
    private readonly MAX_CONCURRENT_CONNECTIONS;
    private readonly COOLDOWN_PERIOD;
    private readonly VALIDATION_TIMEOUT;
    private constructor();
    setUsersService(usersService: UsersService): void;
    static getInstance(): ConnectionManager;
    dispose(): void;
    private handleShutdown;
    private createTimeoutPromise;
    private calculateRetryDelay;
    private shouldRetry;
    private waitForRetry;
    private validateConnection;
    private attemptConnection;
    getClient(mobile: string, options?: GetClientOptions): Promise<TelegramManager>;
    private retryConnection;
    private handleConnectionError;
    private createNewClient;
    private cleanupInactiveConnections;
    private updateLastUsed;
    hasClient(number: string): boolean;
    disconnectAll(): Promise<void>;
    unregisterClient(mobile: string): Promise<void>;
    getActiveConnectionCount(): number;
    startCleanupInterval(intervalMs?: number): NodeJS.Timeout;
    stopCleanupInterval(): void;
    getClientState(mobile: string): string | undefined;
    getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnecting: number;
        error: number;
        retrying: number;
    };
    getClientInfo(mobile: string): ClientInfo | undefined;
    forceReconnect(mobile: string): Promise<TelegramManager>;
    setRetryConfig(mobile: string, config: Partial<RetryConfig>): boolean;
}
export declare const connectionManager: ConnectionManager;
export {};
