import { PromoteClientService } from './promote-client.service';
import { PromoteClientMigrationService, MigrationResult } from './migration.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
export declare class PromoteClientController {
    private readonly clientService;
    private readonly migrationService;
    constructor(clientService: PromoteClientService, migrationService: PromoteClientMigrationService);
    create(createClientDto: CreatePromoteClientDto): Promise<PromoteClient>;
    search(query: SearchPromoteClientDto): Promise<PromoteClient[]>;
    joinChannelsforPromoteClients(): Promise<string>;
    checkpromoteClients(): Promise<string>;
    addNewUserstoPromoteClients(body: {
        goodIds: string[];
        badIds: string[];
        clientsNeedingPromoteClients?: string[];
    }): Promise<string>;
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
    updateStatus(mobile: string, body: {
        status: string;
        message?: string;
    }): Promise<PromoteClient>;
    markAsActive(mobile: string, body?: {
        message?: string;
    }): Promise<PromoteClient>;
    markAsInactive(mobile: string, body: {
        reason: string;
    }): Promise<PromoteClient>;
    markAsUsed(mobile: string, body?: {
        message?: string;
    }): Promise<PromoteClient>;
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
    getMigrationStatus(): Promise<{
        totalPromoteClients: number;
        assignedPromoteClients: number;
        unassignedPromoteClients: number;
        distributionPerClient: Record<string, number>;
        lastMigrationNeeded: boolean;
    }>;
    getMigrationPreview(): Promise<{
        unassignedCount: number;
        availableClients: string[];
        projectedDistribution: Record<string, number>;
        currentDistribution: Record<string, number>;
        isBalanced: boolean;
    }>;
    executeRoundRobinMigration(body?: {
        dryRun?: boolean;
    }): Promise<MigrationResult>;
    executeRoundRobinMigrationLive(): Promise<MigrationResult>;
}
