#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteClientRoundRobinMigration = void 0;
const core_1 = require("@nestjs/core");
const app_module_1 = require("../app.module");
const promote_client_service_1 = require("../components/promote-clients/promote-client.service");
const client_service_1 = require("../components/clients/client.service");
const promote_client_schema_1 = require("../components/promote-clients/schemas/promote-client.schema");
const mongoose_1 = require("@nestjs/mongoose");
const common_1 = require("@nestjs/common");
class PromoteClientRoundRobinMigration {
    constructor(promoteClientService, clientService, promoteClientModel) {
        this.promoteClientService = promoteClientService;
        this.clientService = clientService;
        this.promoteClientModel = promoteClientModel;
        this.logger = new common_1.Logger(PromoteClientRoundRobinMigration.name);
        this.stats = {
            totalPromoteClients: 0,
            unassignedPromoteClients: 0,
            availableClients: 0,
            assignedCount: 0,
            skippedCount: 0,
            errorCount: 0,
            distributionBefore: {},
            distributionAfter: {}
        };
    }
    async executeMigration(dryRun = false) {
        this.logger.log('🚀 Starting PromoteClient Round-Robin Migration');
        this.logger.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);
        try {
            await this.gatherInitialStats();
            const unassignedPromoteClients = await this.getUnassignedPromoteClientsSorted();
            if (unassignedPromoteClients.length === 0) {
                this.logger.log('✅ No unassigned promote clients found. Migration not needed.');
                return this.stats;
            }
            const availableClients = await this.getAvailableClients();
            if (availableClients.length === 0) {
                this.logger.error('❌ No available clients found. Cannot proceed with migration.');
                throw new Error('No available clients for assignment');
            }
            const assignments = this.calculateRoundRobinAssignments(unassignedPromoteClients, availableClients);
            this.displayAssignmentPlan(assignments, availableClients);
            if (!dryRun) {
                await this.executeAssignments(assignments);
                await this.gatherFinalStats();
                this.displayMigrationSummary();
            }
            else {
                this.logger.log('🔍 DRY RUN: No changes were made to the database');
                this.displayDryRunSummary(assignments, availableClients);
            }
            return this.stats;
        }
        catch (error) {
            this.logger.error('💥 Migration failed:', error.message);
            throw error;
        }
    }
    async gatherInitialStats() {
        this.logger.log('📊 Gathering initial statistics...');
        this.stats.totalPromoteClients = await this.promoteClientModel.countDocuments();
        this.stats.unassignedPromoteClients = await this.promoteClientModel.countDocuments({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        });
        const clients = await this.clientService.findAll();
        this.stats.availableClients = clients.length;
        this.stats.distributionBefore = await this.getCurrentDistribution();
        this.logger.log(`📈 Initial Stats:`);
        this.logger.log(`   Total PromoteClients: ${this.stats.totalPromoteClients}`);
        this.logger.log(`   Unassigned PromoteClients: ${this.stats.unassignedPromoteClients}`);
        this.logger.log(`   Available Clients: ${this.stats.availableClients}`);
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
    displayAssignmentPlan(assignments, availableClients) {
        this.logger.log('📋 Assignment Plan:');
        const assignmentsByClient = availableClients.reduce((acc, clientId) => {
            acc[clientId] = assignments.filter(a => a.clientId === clientId);
            return acc;
        }, {});
        for (const clientId of availableClients) {
            const clientAssignments = assignmentsByClient[clientId];
            const totalChannels = clientAssignments.reduce((sum, a) => sum + a.channels, 0);
            this.logger.log(`   ${clientId}: ${clientAssignments.length} promote clients, ${totalChannels} total channels`);
            const preview = clientAssignments.slice(0, 3).map(a => `${a.mobile}(${a.channels}ch)`).join(', ');
            if (clientAssignments.length > 3) {
                this.logger.log(`      Preview: ${preview}... +${clientAssignments.length - 3} more`);
            }
            else if (clientAssignments.length > 0) {
                this.logger.log(`      All: ${preview}`);
            }
        }
        const countsPerClient = availableClients.map(clientId => assignmentsByClient[clientId].length);
        const minCount = Math.min(...countsPerClient);
        const maxCount = Math.max(...countsPerClient);
        const isBalanced = (maxCount - minCount) <= 1;
        this.logger.log(`⚖️  Distribution balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);
    }
    async executeAssignments(assignments) {
        this.logger.log('💾 Executing assignments...');
        const batchSize = 10;
        for (let i = 0; i < assignments.length; i += batchSize) {
            const batch = assignments.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(assignments.length / batchSize);
            this.logger.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} assignments)...`);
            await Promise.allSettled(batch.map(async (assignment) => {
                try {
                    await this.promoteClientModel.findOneAndUpdate({ mobile: assignment.mobile }, {
                        $set: {
                            clientId: assignment.clientId,
                            status: 'active',
                            message: `Assigned to ${assignment.clientId} via round-robin migration`
                        }
                    }, { new: true }).exec();
                    this.stats.assignedCount++;
                    this.logger.debug(`✅ Assigned ${assignment.mobile} → ${assignment.clientId}`);
                }
                catch (error) {
                    this.stats.errorCount++;
                    this.logger.error(`❌ Failed to assign ${assignment.mobile}: ${error.message}`);
                }
            }));
            if (i + batchSize < assignments.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        this.logger.log(`✅ Assignment execution completed: ${this.stats.assignedCount} assigned, ${this.stats.errorCount} errors`);
    }
    async gatherFinalStats() {
        this.logger.log('📊 Gathering final statistics...');
        this.stats.distributionAfter = await this.getCurrentDistribution();
        const remainingUnassigned = await this.promoteClientModel.countDocuments({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        });
        this.logger.log(`📈 Remaining unassigned: ${remainingUnassigned}`);
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
    displayMigrationSummary() {
        this.logger.log('\n🎯 MIGRATION SUMMARY');
        this.logger.log('==================');
        this.logger.log(`📊 Total PromoteClients: ${this.stats.totalPromoteClients}`);
        this.logger.log(`✅ Successfully Assigned: ${this.stats.assignedCount}`);
        this.logger.log(`❌ Assignment Errors: ${this.stats.errorCount}`);
        this.logger.log(`⏭️  Skipped: ${this.stats.skippedCount}`);
        this.logger.log('\n📈 Distribution Comparison:');
        this.logger.log('Before → After');
        const allClientIds = new Set([
            ...Object.keys(this.stats.distributionBefore),
            ...Object.keys(this.stats.distributionAfter)
        ]);
        for (const clientId of allClientIds) {
            const before = this.stats.distributionBefore[clientId] || 0;
            const after = this.stats.distributionAfter[clientId] || 0;
            const change = after - before;
            const changeStr = change > 0 ? `+${change}` : change.toString();
            this.logger.log(`${clientId}: ${before} → ${after} (${changeStr})`);
        }
        this.logger.log('\n🎉 Migration completed successfully!');
    }
    displayDryRunSummary(assignments, availableClients) {
        this.logger.log('\n🔍 DRY RUN SUMMARY');
        this.logger.log('=================');
        this.logger.log(`📊 Would assign ${assignments.length} promote clients`);
        const futureDistribution = { ...this.stats.distributionBefore };
        for (const assignment of assignments) {
            futureDistribution[assignment.clientId] = (futureDistribution[assignment.clientId] || 0) + 1;
        }
        this.logger.log('\n📈 Projected Distribution:');
        for (const clientId of availableClients) {
            const current = this.stats.distributionBefore[clientId] || 0;
            const projected = futureDistribution[clientId] || 0;
            const change = projected - current;
            this.logger.log(`${clientId}: ${current} → ${projected} (+${change})`);
        }
        this.logger.log('\n💡 To execute this migration, run with --live flag');
    }
}
exports.PromoteClientRoundRobinMigration = PromoteClientRoundRobinMigration;
async function runMigration() {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--live');
    if (dryRun) {
        console.log('🔍 Running in DRY RUN mode. Use --live flag to execute actual migration.');
    }
    let app;
    try {
        app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['log', 'error', 'warn', 'debug']
        });
        const promoteClientService = app.get(promote_client_service_1.PromoteClientService);
        const clientService = app.get(client_service_1.ClientService);
        const promoteClientModel = app.get((0, mongoose_1.getModelToken)(promote_client_schema_1.PromoteClient.name));
        const migration = new PromoteClientRoundRobinMigration(promoteClientService, clientService, promoteClientModel);
        const stats = await migration.executeMigration(dryRun);
        const hasErrors = stats.errorCount > 0;
        process.exit(hasErrors ? 1 : 0);
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
    finally {
        if (app) {
            await app.close();
        }
    }
}
if (require.main === module) {
    runMigration();
}
//# sourceMappingURL=migrate-promote-clients-round-robin.js.map