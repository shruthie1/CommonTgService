import { ArchivedClient } from './schemas/archived-client.schema';
import { ArchivedClientService } from './archived-client.service';
import { CreateArchivedClientDto } from './dto/create-archived-client.dto';
import { SearchClientDto } from '../clients/dto/search-client.dto';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { SessionUpdateDto } from './dto/session-update.dto';
import { CleanupSessionsDto } from './dto/cleanup-sessions.dto';
import { SessionStatusDto } from './dto/session-status.dto';
export declare class ArchivedClientController {
    private readonly archivedclientService;
    constructor(archivedclientService: ArchivedClientService);
    create(createArchivedClientDto: CreateArchivedClientDto): Promise<ArchivedClient>;
    search(query: SearchClientDto): Promise<ArchivedClient[]>;
    findAll(): Promise<ArchivedClient[]>;
    checkArchivedClients(): Promise<string>;
    findOne(mobile: string): Promise<ArchivedClient>;
    fetchOne(mobile: string): Promise<ArchivedClient>;
    update(mobile: string, updateClientDto: UpdateClientDto): Promise<ArchivedClient>;
    remove(mobile: string): Promise<ArchivedClient>;
    executeQuery(query: object): Promise<any>;
    updateSession(mobile: string, sessionUpdateDto: SessionUpdateDto): Promise<ArchivedClient>;
    getOldSessions(mobile: string): Promise<string[]>;
    cleanupOldSessions(mobile: string, cleanupDto?: CleanupSessionsDto): Promise<ArchivedClient>;
    checkSessionStatus(mobile: string): Promise<SessionStatusDto>;
    batchFetchSessions(mobiles: string[]): Promise<{
        mobile: string;
        client: ArchivedClient | null;
        error?: string;
    }[]>;
    getCacheStats(): Promise<{
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
        cacheHitRate: string;
        lastCleanup: string;
    }>;
}
