#!/usr/bin/env node
import { PromoteClientService } from '../components/promote-clients/promote-client.service';
import { ClientService } from '../components/clients/client.service';
import { Model } from 'mongoose';
import { PromoteClientDocument } from '../components/promote-clients/schemas/promote-client.schema';
interface MigrationStats {
    totalPromoteClients: number;
    unassignedPromoteClients: number;
    availableClients: number;
    assignedCount: number;
    skippedCount: number;
    errorCount: number;
    distributionBefore: Record<string, number>;
    distributionAfter: Record<string, number>;
}
declare class PromoteClientRoundRobinMigration {
    private readonly promoteClientService;
    private readonly clientService;
    private readonly promoteClientModel;
    private readonly logger;
    private stats;
    constructor(promoteClientService: PromoteClientService, clientService: ClientService, promoteClientModel: Model<PromoteClientDocument>);
    executeMigration(dryRun?: boolean): Promise<MigrationStats>;
    private gatherInitialStats;
    private getUnassignedPromoteClientsSorted;
    private getAvailableClients;
    private calculateRoundRobinAssignments;
    private displayAssignmentPlan;
    private executeAssignments;
    private gatherFinalStats;
    private getCurrentDistribution;
    private displayMigrationSummary;
    private displayDryRunSummary;
}
export { PromoteClientRoundRobinMigration, MigrationStats };
