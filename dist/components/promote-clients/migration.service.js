"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PromoteClientMigrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteClientMigrationService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const promote_client_schema_1 = require("./schemas/promote-client.schema");
const promote_client_service_1 = require("./promote-client.service");
const client_service_1 = require("../clients/client.service");
let PromoteClientMigrationService = PromoteClientMigrationService_1 = class PromoteClientMigrationService {
    constructor(promoteClientModel, promoteClientService, clientService) {
        this.promoteClientModel = promoteClientModel;
        this.promoteClientService = promoteClientService;
        this.clientService = clientService;
        this.logger = new common_1.Logger(PromoteClientMigrationService_1.name);
    }
    async executeRoundRobinMigration(dryRun = false) {
        const startTime = Date.now();
        this.logger.log('🚀 Starting PromoteClient Round-Robin Migration');
        this.logger.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);
        const stats = {
            totalPromoteClients: 0,
            unassignedPromoteClients: 0,
            availableClients: 0,
            assignedCount: 0,
            skippedCount: 0,
            errorCount: 0,
            distributionBefore: {},
            distributionAfter: {}
        };
        try {
            await this.gatherInitialStats(stats);
            const unassignedPromoteClients = await this.getUnassignedPromoteClientsSorted();
            if (unassignedPromoteClients.length === 0) {
                const executionTime = Date.now() - startTime;
                this.logger.log('✅ No unassigned promote clients found. Migration not needed.');
                return {
                    success: true,
                    message: 'No unassigned promote clients found. Migration not needed.',
                    stats,
                    executionTime
                };
            }
            const availableClients = await this.getAvailableClients();
            if (availableClients.length === 0) {
                const executionTime = Date.now() - startTime;
                this.logger.error('❌ No available clients found. Cannot proceed with migration.');
                return {
                    success: false,
                    message: 'No available clients found. Cannot proceed with migration.',
                    stats,
                    executionTime
                };
            }
            const assignments = this.calculateRoundRobinAssignments(unassignedPromoteClients, availableClients);
            this.logAssignmentPlan(assignments, availableClients);
            if (!dryRun) {
                await this.executeAssignments(assignments, stats);
                await this.gatherFinalStats(stats);
            }
            const executionTime = Date.now() - startTime;
            const message = dryRun
                ? `DRY RUN: Would assign ${assignments.length} promote clients across ${availableClients.length} clients`
                : `Successfully assigned ${stats.assignedCount} promote clients with ${stats.errorCount} errors`;
            return {
                success: true,
                message,
                stats,
                executionTime
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            this.logger.error('💥 Migration failed:', error.message);
            return {
                success: false,
                message: `Migration failed: ${error.message}`,
                stats,
                executionTime
            };
        }
    }
    async getMigrationPreview() {
        const unassignedPromoteClients = await this.getUnassignedPromoteClientsSorted();
        const availableClients = await this.getAvailableClients();
        const currentDistribution = await this.getCurrentDistribution();
        if (unassignedPromoteClients.length === 0 || availableClients.length === 0) {
            return {
                unassignedCount: unassignedPromoteClients.length,
                availableClients,
                projectedDistribution: currentDistribution,
                currentDistribution,
                isBalanced: true
            };
        }
        const assignments = this.calculateRoundRobinAssignments(unassignedPromoteClients, availableClients);
        const projectedDistribution = { ...currentDistribution };
        for (const assignment of assignments) {
            projectedDistribution[assignment.clientId] = (projectedDistribution[assignment.clientId] || 0) + 1;
        }
        const counts = Object.values(projectedDistribution);
        const minCount = Math.min(...counts);
        const maxCount = Math.max(...counts);
        const isBalanced = (maxCount - minCount) <= 1;
        return {
            unassignedCount: unassignedPromoteClients.length,
            availableClients,
            projectedDistribution,
            currentDistribution,
            isBalanced
        };
    }
    async getMigrationStatus() {
        const totalPromoteClients = await this.promoteClientModel.countDocuments();
        const unassignedPromoteClients = await this.promoteClientModel.countDocuments({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        });
        const assignedPromoteClients = totalPromoteClients - unassignedPromoteClients;
        const distributionPerClient = await this.getCurrentDistribution();
        return {
            totalPromoteClients,
            assignedPromoteClients,
            unassignedPromoteClients,
            distributionPerClient,
            lastMigrationNeeded: unassignedPromoteClients > 0
        };
    }
    async gatherInitialStats(stats) {
        this.logger.log('📊 Gathering initial statistics...');
        stats.totalPromoteClients = await this.promoteClientModel.countDocuments();
        stats.unassignedPromoteClients = await this.promoteClientModel.countDocuments({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        });
        const clients = await this.clientService.findAll();
        stats.availableClients = clients.length;
        stats.distributionBefore = await this.getCurrentDistribution();
        this.logger.log(`📈 Initial Stats:`);
        this.logger.log(`   Total PromoteClients: ${stats.totalPromoteClients}`);
        this.logger.log(`   Unassigned PromoteClients: ${stats.unassignedPromoteClients}`);
        this.logger.log(`   Available Clients: ${stats.availableClients}`);
    }
    async getUnassignedPromoteClientsSorted() {
        this.logger.log('🔍 Finding unassigned promote clients...');
        const unassigned = await this.promoteClientModel.find({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        }).sort({ channels: 1 }).exec();
        this.logger.log(`📱 Found ${unassigned.length} unassigned promote clients`);
        if (unassigned.length > 0) {
            const channelRange = {
                min: Math.min(...unassigned.map(pc => pc.channels)),
                max: Math.max(...unassigned.map(pc => pc.channels)),
                avg: Math.round(unassigned.reduce((sum, pc) => sum + pc.channels, 0) / unassigned.length)
            };
            this.logger.log(`📊 Channel count range: ${channelRange.min} - ${channelRange.max} (avg: ${channelRange.avg})`);
        }
        return unassigned;
    }
    async getAvailableClients() {
        this.logger.log('👥 Getting available clients...');
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.clientId).filter(Boolean);
        this.logger.log(`👤 Found ${clientIds.length} available clients: ${clientIds.join(', ')}`);
        return clientIds;
    }
    calculateRoundRobinAssignments(promoteClients, availableClients) {
        this.logger.log('🔄 Calculating round-robin assignments...');
        const assignments = [];
        let clientIndex = 0;
        for (const promoteClient of promoteClients) {
            const assignedClientId = availableClients[clientIndex];
            assignments.push({
                mobile: promoteClient.mobile,
                clientId: assignedClientId,
                channels: promoteClient.channels
            });
            clientIndex = (clientIndex + 1) % availableClients.length;
        }
        return assignments;
    }
    logAssignmentPlan(assignments, availableClients) {
        this.logger.log('📋 Assignment Plan:');
        const assignmentsByClient = availableClients.reduce((acc, clientId) => {
            acc[clientId] = assignments.filter(a => a.clientId === clientId);
            return acc;
        }, {});
        for (const clientId of availableClients) {
            const clientAssignments = assignmentsByClient[clientId];
            const totalChannels = clientAssignments.reduce((sum, a) => sum + a.channels, 0);
            this.logger.log(`   ${clientId}: ${clientAssignments.length} promote clients, ${totalChannels} total channels`);
        }
        const countsPerClient = availableClients.map(clientId => assignmentsByClient[clientId].length);
        const minCount = Math.min(...countsPerClient);
        const maxCount = Math.max(...countsPerClient);
        const isBalanced = (maxCount - minCount) <= 1;
        this.logger.log(`⚖️  Distribution balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);
    }
    async executeAssignments(assignments, stats) {
        this.logger.log('💾 Executing assignments...');
        const batchSize = 10;
        for (let i = 0; i < assignments.length; i += batchSize) {
            const batch = assignments.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(assignments.length / batchSize);
            this.logger.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} assignments)...`);
            const results = await Promise.allSettled(batch.map(async (assignment) => {
                try {
                    await this.promoteClientModel.findOneAndUpdate({ mobile: assignment.mobile }, {
                        $set: {
                            clientId: assignment.clientId,
                            status: 'active',
                            message: `Assigned to ${assignment.clientId} via round-robin migration`
                        }
                    }, { new: true }).exec();
                    stats.assignedCount++;
                    this.logger.debug(`✅ Assigned ${assignment.mobile} → ${assignment.clientId}`);
                }
                catch (error) {
                    stats.errorCount++;
                    this.logger.error(`❌ Failed to assign ${assignment.mobile}: ${error.message}`);
                    throw error;
                }
            }));
            const failedCount = results.filter(result => result.status === 'rejected').length;
            if (failedCount > 0) {
                this.logger.warn(`⚠️  Batch ${batchNumber}: ${failedCount} failed assignments`);
            }
            if (i + batchSize < assignments.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        this.logger.log(`✅ Assignment execution completed: ${stats.assignedCount} assigned, ${stats.errorCount} errors`);
    }
    async gatherFinalStats(stats) {
        this.logger.log('📊 Gathering final statistics...');
        stats.distributionAfter = await this.getCurrentDistribution();
    }
    async getCurrentDistribution() {
        const distribution = {};
        const clients = await this.clientService.findAll();
        for (const client of clients) {
            const count = await this.promoteClientModel.countDocuments({ clientId: client.clientId });
            distribution[client.clientId] = count;
        }
        return distribution;
    }
};
exports.PromoteClientMigrationService = PromoteClientMigrationService;
exports.PromoteClientMigrationService = PromoteClientMigrationService = PromoteClientMigrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(promote_client_schema_1.PromoteClient.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        promote_client_service_1.PromoteClientService,
        client_service_1.ClientService])
], PromoteClientMigrationService);
//# sourceMappingURL=migration.service.js.map