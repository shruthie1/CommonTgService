import { Model } from 'mongoose';
import { CreateArchivedClientDto } from './dto/create-archived-client.dto';
import { ArchivedClient, ArchivedClientDocument } from './schemas/archived-client.schema';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { TelegramService } from '../Telegram/Telegram.service';
import { ClientService } from '../clients/client.service';
export declare class ArchivedClientService {
    private archivedclientModel;
    private telegramService;
    private clientService;
    private readonly logger;
    private readonly MAX_OLD_SESSIONS;
    private readonly SESSION_GENERATION_TIMEOUT;
    private readonly MAX_RETRY_ATTEMPTS;
    private readonly SESSION_VALIDATION_CACHE;
    private readonly CACHE_EXPIRY;
    constructor(archivedclientModel: Model<ArchivedClientDocument>, telegramService: TelegramService, clientService: ClientService);
    create(createArchivedClientDto: CreateArchivedClientDto): Promise<ArchivedClient>;
    findAll(): Promise<ArchivedClient[]>;
    findOne(mobile: string): Promise<ArchivedClient>;
    fetchOne(mobile: string): Promise<ArchivedClient>;
    update(mobile: string, updateClientDto: UpdateClientDto): Promise<ArchivedClient>;
    remove(mobile: string): Promise<ArchivedClient>;
    search(filter: any): Promise<ArchivedClient[]>;
    checkArchivedClients(): Promise<string>;
    private checkAndUpdateMainSession;
    executeQuery(query: any): Promise<any>;
    private backupCurrentSession;
    private isSessionActive;
    private cleanupValidationCache;
    updateSession(mobile: string, newSession: string): Promise<ArchivedClient>;
    private clearCacheForMobile;
    getOldSessions(mobile: string): Promise<string[]>;
    cleanupOldSessions(mobile: string, maxSessions?: number): Promise<ArchivedClient>;
    getSessionStatus(mobile: string): Promise<{
        mobile: string;
        isMainSessionActive: boolean;
        totalOldSessions: number;
        lastChecked: string;
        healthMetrics: {
            activeOldSessions: number;
            lastUpdated: string;
            sessionAge: string;
            reliability: 'high' | 'medium' | 'low';
        };
    }>;
    private calculateSessionAge;
    batchFetchSessions(mobiles: string[]): Promise<{
        mobile: string;
        client: ArchivedClient | null;
        error?: string;
    }[]>;
    private createNewClientWithSession;
    private generateAndUpdateSession;
    private findActiveSessionFromHistory;
    private promoteActiveSession;
    private generateNewSession;
    private auditSessionAccess;
    private backupSessionToHistory;
    private safeCleanupConnection;
    getCacheStatistics(): {
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
        cacheHitRate: string;
        lastCleanup: string;
    };
}
