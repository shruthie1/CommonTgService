#!/usr/bin/env node

/**
 * Quick Migration Validator Script
 * 
 * This script provides a quick way to validate the current state of PromoteClient assignments
 * and test the migration logic without running the full migration.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PromoteClientService } from '../components/promote-clients/promote-client.service';
import { ClientService } from '../components/clients/client.service';
import { Model } from 'mongoose';
import { PromoteClient, PromoteClientDocument } from '../components/promote-clients/schemas/promote-client.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';

class MigrationValidator {
  private readonly logger = new Logger(MigrationValidator.name);

  constructor(
    private readonly promoteClientService: PromoteClientService,
    private readonly clientService: ClientService,
    private readonly promoteClientModel: Model<PromoteClientDocument>
  ) {}

  /**
   * Validate current state and show what migration would do
   */
  async validateCurrentState(): Promise<void> {
    this.logger.log('🔍 Validating current PromoteClient assignment state...');

    try {
      // Get basic statistics
      const stats = await this.getBasicStats();
      this.displayStats(stats);

      // Get unassigned clients
      const unassigned = await this.getUnassignedClients();
      this.displayUnassignedClients(unassigned);

      // Get current distribution
      const distribution = await this.getCurrentDistribution();
      this.displayCurrentDistribution(distribution);

      // Show what migration would do
      if (unassigned.length > 0) {
        await this.showMigrationPreview(unassigned);
      } else {
        this.logger.log('✅ All PromoteClients are already assigned. No migration needed.');
      }

    } catch (error) {
      this.logger.error('❌ Validation failed:', error.message);
      throw error;
    }
  }

  private async getBasicStats() {
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

  private displayStats(stats: any): void {
    this.logger.log('\n📊 CURRENT STATE SUMMARY');
    this.logger.log('========================');
    this.logger.log(`📱 Total PromoteClients: ${stats.total}`);
    this.logger.log(`✅ Assigned: ${stats.assigned}`);
    this.logger.log(`❓ Unassigned: ${stats.unassigned}`);
    this.logger.log(`🟢 Active: ${stats.active}`);
    this.logger.log(`🔴 Inactive: ${stats.inactive}`);
  }

  private async getUnassignedClients() {
    return this.promoteClientModel.find({
      $or: [
        { clientId: { $exists: false } },
        { clientId: null },
        { clientId: '' }
      ]
    }).sort({ channels: 1 }).exec();
  }

  private displayUnassignedClients(unassigned: PromoteClient[]): void {
    if (unassigned.length === 0) {
      this.logger.log('\n✅ No unassigned PromoteClients found');
      return;
    }

    this.logger.log(`\n❓ UNASSIGNED PROMOTECLIENTS (${unassigned.length})`);
    this.logger.log('================================');
    
    const sample = unassigned.slice(0, 10); // Show first 10
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

  private async getCurrentDistribution() {
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

  private displayCurrentDistribution(data: any): void {
    this.logger.log('\n📈 CURRENT DISTRIBUTION');
    this.logger.log('=======================');
    
    for (const clientId of data.clients) {
      const stats = data.distribution[clientId];
      this.logger.log(`${clientId}: ${stats.total} total (${stats.active} active, ${stats.inactive} inactive)`);
    }

    const totals = Object.values(data.distribution).map((s: any) => s.total);
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const isBalanced = (maxTotal - minTotal) <= 1;
    
    this.logger.log(`⚖️  Current balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minTotal}, max: ${maxTotal})`);
  }

  private async showMigrationPreview(unassigned: PromoteClient[]): Promise<void> {
    this.logger.log('\n🔮 MIGRATION PREVIEW');
    this.logger.log('====================');
    
    const clients = await this.clientService.findAll();
    const clientIds = clients.map(c => c.clientId);
    
    if (clientIds.length === 0) {
      this.logger.error('❌ No clients found for assignment');
      return;
    }

    // Simulate round-robin assignment
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

    // Calculate balance
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

/**
 * Main execution function
 */
async function runValidation() {
  let app;
  
  try {
    // Bootstrap NestJS application
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn']
    });

    // Get required services
    const promoteClientService = app.get(PromoteClientService);
    const clientService = app.get(ClientService);
    const promoteClientModel = app.get(getModelToken(PromoteClient.name));

    // Create and run validator
    const validator = new MigrationValidator(
      promoteClientService,
      clientService,
      promoteClientModel
    );

    await validator.validateCurrentState();
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  runValidation();
}

export { MigrationValidator };
