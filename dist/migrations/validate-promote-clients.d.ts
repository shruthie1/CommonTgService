#!/usr/bin/env node
import { PromoteClientService } from '../components/promote-clients/promote-client.service';
import { ClientService } from '../components/clients/client.service';
import { Model } from 'mongoose';
import { PromoteClientDocument } from '../components/promote-clients/schemas/promote-client.schema';
declare class MigrationValidator {
    private readonly promoteClientService;
    private readonly clientService;
    private readonly promoteClientModel;
    private readonly logger;
    constructor(promoteClientService: PromoteClientService, clientService: ClientService, promoteClientModel: Model<PromoteClientDocument>);
    validateCurrentState(): Promise<void>;
    private getBasicStats;
    private displayStats;
    private getUnassignedClients;
    private displayUnassignedClients;
    private getCurrentDistribution;
    private displayCurrentDistribution;
    private showMigrationPreview;
}
export { MigrationValidator };
