/// <reference types="node" />
import TelegramManager from '../TelegramManager';
import { UsersService } from 'src/components/users/users.service';
declare class ConnectionManager {
    private static instance;
    private clients;
    private readonly logger;
    private cleanupInterval;
    private usersService;
    private constructor();
    setUsersService(usersService: UsersService): void;
    static getInstance(): ConnectionManager;
    private cleanupInactiveConnections;
    private updateLastUsed;
    getClient(mobile: string, options?: {
        autoDisconnect?: boolean;
        handler?: boolean;
        excludeFromCleanup?: boolean;
    }): Promise<TelegramManager | undefined>;
    hasClient(number: string): boolean;
    disconnectAll(): Promise<void>;
    registerClient(mobile: string, telegramManager: TelegramManager, options?: {
        autoDisconnect: boolean;
    }): Promise<void>;
    unregisterClient(mobile: string): Promise<void>;
    getActiveConnectionCount(): number;
    startCleanupInterval(intervalMs?: number): NodeJS.Timeout;
    stopCleanupInterval(): void;
}
declare const connectionManager: ConnectionManager;
export default connectionManager;
