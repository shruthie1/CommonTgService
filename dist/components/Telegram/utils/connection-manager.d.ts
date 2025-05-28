import TelegramManager from '../TelegramManager';
import { UsersService } from '../../../components/users/users.service';
interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
}
declare class ConnectionManager {
    private static instance;
    private clients;
    private readonly logger;
    private cleanupInterval;
    private usersService;
    private readonly MAX_RETRY_ATTEMPTS;
    private readonly CONNECTION_TIMEOUT;
    private readonly MAX_CONCURRENT_CONNECTIONS;
    private readonly COOLDOWN_PERIOD;
    private constructor();
    private handleShutdown;
    setUsersService(usersService: UsersService): void;
    static getInstance(): ConnectionManager;
    private cleanupInactiveConnections;
    private updateLastUsed;
    private validateConnection;
    getClient(mobile: string, options?: GetClientOptions): Promise<TelegramManager>;
    hasClient(number: string): boolean;
    disconnectAll(): Promise<void>;
    private registerClient;
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
    };
}
export declare const connectionManager: ConnectionManager;
export {};
