import { TelegramClient } from 'telegram';
interface ClientInfo {
    client: TelegramClient;
    mobile: string;
    sessionString: string;
    createdAt: Date;
    lastActivity: Date;
    isCreating: boolean;
    lockId?: string;
}
export declare class ClientRegistry {
    private static instance;
    private readonly clients;
    private readonly logger;
    private readonly locks;
    private readonly LOCK_TIMEOUT;
    private readonly LOCK_EXPIRY;
    private readonly CLIENT_TIMEOUT;
    private constructor();
    static getInstance(): ClientRegistry;
    acquireLock(mobile: string): Promise<string | null>;
    releaseLock(mobile: string, lockId: string): boolean;
    waitForLock(mobile: string): Promise<string | null>;
    hasClient(mobile: string): boolean;
    getClientInfo(mobile: string): ClientInfo | null;
    registerClient(mobile: string, client: TelegramClient, sessionString: string, lockId: string): Promise<boolean>;
    markClientCreating(mobile: string, lockId: string): boolean;
    updateActivity(mobile: string): void;
    removeClient(mobile: string, lockId?: string): Promise<boolean>;
    getActiveClientCount(): number;
    getActivemobiles(): string[];
    private cleanupInactiveClients;
    private cleanupExpiredLocks;
    forceCleanup(mobile: string): Promise<number>;
    getStats(): {
        activeClients: number;
        activeLocks: number;
        mobiles: string[];
    };
}
export {};
