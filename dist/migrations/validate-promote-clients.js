#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationValidator = void 0;
const core_1 = require("@nestjs/core");
const app_module_1 = require("../app.module");
const promote_client_service_1 = require("../components/promote-clients/promote-client.service");
const client_service_1 = require("../components/clients/client.service");
const promote_client_schema_1 = require("../components/promote-clients/schemas/promote-client.schema");
const mongoose_1 = require("@nestjs/mongoose");
const common_1 = require("@nestjs/common");
class MigrationValidator {
    constructor(promoteClientService, clientService, promoteClientModel) {
        this.promoteClientService = promoteClientService;
        this.clientService = clientService;
        this.promoteClientModel = promoteClientModel;
        this.logger = new common_1.Logger(MigrationValidator.name);
    }
    async validateCurrentState() {
        this.logger.log('🔍 Validating current PromoteClient assignment state...');
        try {
            const stats = await this.getBasicStats();
            this.displayStats(stats);
            const unassigned = await this.getUnassignedClients();
            this.displayUnassignedClients(unassigned);
            const distribution = await this.getCurrentDistribution();
            this.displayCurrentDistribution(distribution);
            if (unassigned.length > 0) {
                await this.showMigrationPreview(unassigned);
            }
            else {
                this.logger.log('✅ All PromoteClients are already assigned. No migration needed.');
            }
        }
        catch (error) {
            this.logger.error('❌ Validation failed:', error.message);
            throw error;
        }
    }
    async getBasicStats() {
        const total = await this.promoteClientModel.countDocuments();
        const unassigned = await this.promoteClientModel.countDocuments({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        });
        const assigned = total - unassigned;
        const active = await this.promoteClientModel.countDocuments({ status: 'active' });
        const inactive = await this.promoteClientModel.countDocuments({ status: 'inactive' });
        return { total, assigned, unassigned, active, inactive };
    }
    displayStats(stats) {
        this.logger.log('\n📊 CURRENT STATE SUMMARY');
        this.logger.log('========================');
        this.logger.log(`📱 Total PromoteClients: ${stats.total}`);
        this.logger.log(`✅ Assigned: ${stats.assigned}`);
        this.logger.log(`❓ Unassigned: ${stats.unassigned}`);
        this.logger.log(`🟢 Active: ${stats.active}`);
        this.logger.log(`🔴 Inactive: ${stats.inactive}`);
    }
    async getUnassignedClients() {
        return this.promoteClientModel.find({
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        }).sort({ channels: 1 }).exec();
    }
    displayUnassignedClients(unassigned) {
        if (unassigned.length === 0) {
            this.logger.log('\n✅ No unassigned PromoteClients found');
            return;
        }
        this.logger.log(`\n❓ UNASSIGNED PROMOTECLIENTS (${unassigned.length})`);
        this.logger.log('================================');
        const sample = unassigned.slice(0, 10);
        for (const client of sample) {
            this.logger.log(`📱 ${client.mobile} - ${client.channels} channels - Status: ${client.status || 'unknown'}`);
        }
        if (unassigned.length > 10) {
            this.logger.log(`... and ${unassigned.length - 10} more`);
        }
        const channelStats = {
            min: Math.min(...unassigned.map(c => c.channels)),
            max: Math.max(...unassigned.map(c => c.channels)),
            avg: Math.round(unassigned.reduce((sum, c) => sum + c.channels, 0) / unassigned.length)
        };
        this.logger.log(`📊 Channel range: ${channelStats.min} - ${channelStats.max} (avg: ${channelStats.avg})`);
    }
    async getCurrentDistribution() {
        const clients = await this.clientService.findAll();
        const distribution = {};
        for (const client of clients) {
            const total = await this.promoteClientModel.countDocuments({ clientId: client.clientId });
            const active = await this.promoteClientModel.countDocuments({
                clientId: client.clientId,
                status: 'active'
            });
            const inactive = total - active;
            distribution[client.clientId] = { total, active, inactive };
        }
        return { clients: clients.map(c => c.clientId), distribution };
    }
    displayCurrentDistribution(data) {
        this.logger.log('\n📈 CURRENT DISTRIBUTION');
        this.logger.log('=======================');
        for (const clientId of data.clients) {
            const stats = data.distribution[clientId];
            this.logger.log(`${clientId}: ${stats.total} total (${stats.active} active, ${stats.inactive} inactive)`);
        }
        const totals = Object.values(data.distribution).map((s) => s.total);
        const minTotal = Math.min(...totals);
        const maxTotal = Math.max(...totals);
        const isBalanced = (maxTotal - minTotal) <= 1;
        this.logger.log(`⚖️  Current balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minTotal}, max: ${maxTotal})`);
    }
    async showMigrationPreview(unassigned) {
        this.logger.log('\n🔮 MIGRATION PREVIEW');
        this.logger.log('====================');
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(c => c.clientId);
        if (clientIds.length === 0) {
            this.logger.error('❌ No clients found for assignment');
            return;
        }
        const assignments = {};
        let clientIndex = 0;
        for (const promoteClient of unassigned) {
            const targetClient = clientIds[clientIndex];
            if (!assignments[targetClient]) {
                assignments[targetClient] = [];
            }
            assignments[targetClient].push(promoteClient);
            clientIndex = (clientIndex + 1) % clientIds.length;
        }
        this.logger.log(`📋 Would distribute ${unassigned.length} PromoteClients among ${clientIds.length} clients:`);
        for (const clientId of clientIds) {
            const assigned = assignments[clientId] || [];
            const totalChannels = assigned.reduce((sum, pc) => sum + pc.channels, 0);
            this.logger.log(`   ${clientId}: +${assigned.length} PromoteClients (+${totalChannels} channels)`);
        }
        const counts = clientIds.map(id => (assignments[id] || []).length);
        const minCount = Math.min(...counts);
        const maxCount = Math.max(...counts);
        const wouldBeBalanced = (maxCount - minCount) <= 1;
        this.logger.log(`⚖️  Post-migration balance: ${wouldBeBalanced ? '✅ WOULD BE BALANCED' : '⚠️  WOULD BE UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);
        this.logger.log('\n💡 To execute this migration:');
        this.logger.log('   npm run migration:promote-clients        (dry run)');
        this.logger.log('   npm run migration:promote-clients:live   (live migration)');
    }
}
exports.MigrationValidator = MigrationValidator;
async function runValidation() {
    let app;
    try {
        app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
            logger: ['log', 'error', 'warn']
        });
        const promoteClientService = app.get(promote_client_service_1.PromoteClientService);
        const clientService = app.get(client_service_1.ClientService);
        const promoteClientModel = app.get((0, mongoose_1.getModelToken)(promote_client_schema_1.PromoteClient.name));
        const validator = new MigrationValidator(promoteClientService, clientService, promoteClientModel);
        await validator.validateCurrentState();
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
    finally {
        if (app) {
            await app.close();
        }
    }
}
if (require.main === module) {
    runValidation();
}
//# sourceMappingURL=validate-promote-clients.js.map