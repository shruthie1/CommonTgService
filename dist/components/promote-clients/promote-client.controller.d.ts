import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import { ActivationRequestDto, BulkEnrollPromoteClientsRequestDto, DeactivationRequestDto, MarkUsedRequestDto, StatusUpdateRequestDto } from '../shared/dto/client-swagger.dto';
export declare class PromoteClientController {
    private readonly clientService;
    constructor(clientService: PromoteClientService);
    create(createClientDto: CreatePromoteClientDto): Promise<PromoteClient>;
    search(query: SearchPromoteClientDto): Promise<PromoteClient[]>;
    joinChannelsforPromoteClients(): Promise<string>;
    updateInfo(): Promise<string>;
    checkpromoteClients(): Promise<string>;
    addNewUserstoPromoteClients(body: BulkEnrollPromoteClientsRequestDto): Promise<string>;
    findAll(status?: string): Promise<PromoteClient[]>;
    setAsPromoteClient(mobile: string): Promise<string>;
    findOne(mobile: string): Promise<PromoteClient>;
    update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    createdOrupdate(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    remove(mobile: string): Promise<void>;
    executeQuery(query: object): Promise<any>;
    getPromoteClientDistribution(): Promise<any>;
    getPromoteClientsByStatus(status: string): Promise<PromoteClient[]>;
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
