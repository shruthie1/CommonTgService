import TelegramManager from '../TelegramManager';
import { UsersService } from '../../../components/users/users.service';
import { ConnectionStatusDto } from '../dto/connection-management.dto';
interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    forceReconnect?: boolean;
}
declare class ConnectionManager {
    private static instance;
    private clients;
    private logger;
    private cleanupTimer;
    private usersService;
    private isShuttingDown;
    private readonly MAX_CONNECTIONS;
    private readonly IDLE_TIMEOUT;
    private readonly CLEANUP_INTERVAL;
    private readonly MAX_RETRY_ATTEMPTS;
    private constructor();
    static getInstance(): ConnectionManager;
    setUsersService(usersService: UsersService): void;
    getClient(mobile: string, options?: GetClientOptions): Promise<TelegramManager>;
    private createNewClient;
    private validateConnection;
    private isClientHealthy;
    private handleConnectionError;
    unregisterClient(mobile: string): Promise<void>;
    private updateLastUsed;
    hasClient(mobile: string): boolean;
    getClientState(mobile: string): ConnectionStatusDto | undefined;
    getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnected: number;
        error: number;
    };
    private cleanup;
    private forceCleanup;
    forceReconnect(mobile: string): Promise<TelegramManager>;
    private startCleanup;
    private stopCleanup;
    shutdown(): Promise<void>;
    disconnectAll(): Promise<void>;
    getActiveConnectionCount(): number;
    getClientList(): string[];
    getHealthReport(): {
        totalClients: number;
        healthyClients: number;
        unhealthyClients: string[];
        memoryUsage: number;
    };
}
export declare const connectionManager: ConnectionManager;
export declare function unregisterClient(mobile: string): Promise<void>;
export {};
