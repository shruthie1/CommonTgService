import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import { ActivationRequestDto, BulkEnrollPromoteClientsRequestDto, DeactivationRequestDto, MarkUsedRequestDto, StatusUpdateRequestDto } from '../shared/dto/client-swagger.dto';
import { ClientStatusType } from '../shared/base-client.service';
export declare class PromoteClientController {
    private readonly clientService;
    constructor(clientService: PromoteClientService);
    private sanitizeQuery;
    create(createClientDto: CreatePromoteClientDto): Promise<PromoteClient>;
    search(query: SearchPromoteClientDto): Promise<PromoteClient[]>;
    joinChannelsforPromoteClients(): Promise<string>;
    updateInfo(): Promise<string>;
    checkpromoteClients(): Promise<string>;
    addNewUserstoPromoteClients(body: BulkEnrollPromoteClientsRequestDto): Promise<string>;
    findAll(status?: ClientStatusType): Promise<PromoteClient[]>;
    setAsPromoteClient(mobile: string, clientId?: string): Promise<string>;
    findOne(mobile: string): Promise<PromoteClient>;
    update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    createOrUpdate(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    healDeadSessions(): Promise<string>;
    remove(mobile: string): Promise<void>;
    executeQuery(query: object): Promise<any>;
    refreshProfilePics(mobile: string): Promise<{
        refreshed: boolean;
        uploadedCount: number;
    }>;
    getPromoteClientDistribution(): Promise<any>;
    getPromoteClientsByStatus(status: ClientStatusType): Promise<PromoteClient[]>;
    getPromoteClientsWithMessages(): Promise<Array<{
        mobile: string;
        status: string;
        message: string;
        clientId?: string;
    }>>;
    updateStatus(mobile: string, body: StatusUpdateRequestDto): Promise<PromoteClient>;
    markAsActive(mobile: string, body?: ActivationRequestDto): Promise<PromoteClient>;
    markAsInactive(mobile: string, body: DeactivationRequestDto): Promise<PromoteClient>;
    markAsUsed(mobile: string, body?: MarkUsedRequestDto): Promise<PromoteClient>;
    resetFailedAttempts(mobile: string): Promise<{
        message: string;
    }>;
    updateLastUsed(mobile: string): Promise<PromoteClient>;
    getLeastRecentlyUsed(clientId: string, limit?: number): Promise<PromoteClient[]>;
    getNextAvailable(clientId: string): Promise<PromoteClient | null>;
    getUnusedPromoteClients(hoursAgo?: number, clientId?: string): Promise<PromoteClient[]>;
    getUsageStatistics(clientId?: string): Promise<{
        totalClients: number;
        neverUsed: number;
        usedInLast24Hours: number;
        usedInLastWeek: number;
        averageUsageGap: number;
    }>;
}
