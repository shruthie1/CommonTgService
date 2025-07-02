import { Model } from 'mongoose';
import { PromoteClientDocument } from './schemas/promote-client.schema';
import { PromoteClientService } from './promote-client.service';
import { ClientService } from '../clients/client.service';
export interface MigrationStats {
    totalPromoteClients: number;
    unassignedPromoteClients: number;
    availableClients: number;
    assignedCount: number;
    skippedCount: number;
    errorCount: number;
    distributionBefore: Record<string, number>;
    distributionAfter: Record<string, number>;
}
export interface MigrationResult {
    success: boolean;
    message: string;
    stats: MigrationStats;
    executionTime: number;
}
export declare class PromoteClientMigrationService {
    private readonly promoteClientModel;
    private readonly promoteClientService;
    private readonly clientService;
    private readonly logger;
    constructor(promoteClientModel: Model<PromoteClientDocument>, promoteClientService: PromoteClientService, clientService: ClientService);
    executeRoundRobinMigration(dryRun?: boolean): Promise<MigrationResult>;
    getMigrationPreview(): Promise<{
        unassignedCount: number;
        availableClients: string[];
        projectedDistribution: Record<string, number>;
        currentDistribution: Record<string, number>;
        isBalanced: boolean;
    }>;
    getMigrationStatus(): Promise<{
        totalPromoteClients: number;
        assignedPromoteClients: number;
        unassignedPromoteClients: number;
        distributionPerClient: Record<string, number>;
        lastMigrationNeeded: boolean;
    }>;
    private gatherInitialStats;
    private getUnassignedPromoteClientsSorted;
    private getAvailableClients;
    private calculateRoundRobinAssignments;
    private logAssignmentPlan;
    private executeAssignments;
    private gatherFinalStats;
    private getCurrentDistribution;
}
