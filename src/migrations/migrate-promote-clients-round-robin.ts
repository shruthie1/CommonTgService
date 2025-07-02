#!/usr/bin/env node

/**
 * Migration Script: Assign ClientIds to PromoteClients using Round-Robin Method
 * 
 * This script:
 * 1. Finds all PromoteClients without clientId assignment
 * 2. Sorts them by channel count (ascending - clients with fewer channels get assigned first)
 * 3. Gets all available client clientIds
 * 4. Assigns clientIds using round-robin method to ensure even distribution
 * 5. Updates the database with the new assignments
 * 
 * Usage:
 * - Development: npm run migration:promote-clients
 * - Direct execution: ts-node src/migrations/migrate-promote-clients-round-robin.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PromoteClientService } from '../components/promote-clients/promote-client.service';
import { ClientService } from '../components/clients/client.service';
import { Model } from 'mongoose';
import { PromoteClient, PromoteClientDocument } from '../components/promote-clients/schemas/promote-client.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';

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

class PromoteClientRoundRobinMigration {
  private readonly logger = new Logger(PromoteClientRoundRobinMigration.name);
  private stats: MigrationStats = {
    totalPromoteClients: 0,
    unassignedPromoteClients: 0,
    availableClients: 0,
    assignedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    distributionBefore: {},
    distributionAfter: {}
  };

  constructor(
    private readonly promoteClientService: PromoteClientService,
    private readonly clientService: ClientService,
    private readonly promoteClientModel: Model<PromoteClientDocument>
  ) {}

  /**
   * Main migration execution method
   */
  async executeMigration(dryRun: boolean = false): Promise<MigrationStats> {
    this.logger.log('🚀 Starting PromoteClient Round-Robin Migration');
    this.logger.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);

    try {
      // Step 1: Gather initial statistics
      await this.gatherInitialStats();

      // Step 2: Get unassigned promote clients sorted by channel count
      const unassignedPromoteClients = await this.getUnassignedPromoteClientsSorted();
      
      if (unassignedPromoteClients.length === 0) {
        this.logger.log('✅ No unassigned promote clients found. Migration not needed.');
        return this.stats;
      }

      // Step 3: Get available clients
      const availableClients = await this.getAvailableClients();
      
      if (availableClients.length === 0) {
        this.logger.error('❌ No available clients found. Cannot proceed with migration.');
        throw new Error('No available clients for assignment');
      }

      // Step 4: Calculate round-robin assignments
      const assignments = this.calculateRoundRobinAssignments(unassignedPromoteClients, availableClients);

      // Step 5: Display assignment plan
      this.displayAssignmentPlan(assignments, availableClients);

      // Step 6: Execute assignments (if not dry run)
      if (!dryRun) {
        await this.executeAssignments(assignments);
        await this.gatherFinalStats();
        this.displayMigrationSummary();
      } else {
        this.logger.log('🔍 DRY RUN: No changes were made to the database');
        this.displayDryRunSummary(assignments, availableClients);
      }

      return this.stats;

    } catch (error) {
      this.logger.error('💥 Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Gather initial statistics about the current state
   */
  private async gatherInitialStats(): Promise<void> {
    this.logger.log('📊 Gathering initial statistics...');
    
    // Total promote clients
    this.stats.totalPromoteClients = await this.promoteClientModel.countDocuments();
    
    // Unassigned promote clients
    this.stats.unassignedPromoteClients = await this.promoteClientModel.countDocuments({
      $or: [
        { clientId: { $exists: false } },
        { clientId: null },
        { clientId: '' }
      ]
    });

    // Available clients
    const clients = await this.clientService.findAll();
    this.stats.availableClients = clients.length;

    // Current distribution
    this.stats.distributionBefore = await this.getCurrentDistribution();

    this.logger.log(`📈 Initial Stats:`);
    this.logger.log(`   Total PromoteClients: ${this.stats.totalPromoteClients}`);
    this.logger.log(`   Unassigned PromoteClients: ${this.stats.unassignedPromoteClients}`);
    this.logger.log(`   Available Clients: ${this.stats.availableClients}`);
  }

  /**
   * Get unassigned promote clients sorted by channel count (ascending)
   */
  private async getUnassignedPromoteClientsSorted(): Promise<PromoteClient[]> {
    this.logger.log('🔍 Finding unassigned promote clients...');
    
    const unassigned = await this.promoteClientModel.find({
      $or: [
        { clientId: { $exists: false } },
        { clientId: null },
        { clientId: '' }
      ]
    }).sort({ channels: 1 }).exec(); // Sort by channel count ascending

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

  /**
   * Get all available clients
   */
  private async getAvailableClients(): Promise<string[]> {
    this.logger.log('👥 Getting available clients...');
    
    const clients = await this.clientService.findAll();
    const clientIds = clients.map(client => client.clientId).filter(Boolean);
    
    this.logger.log(`👤 Found ${clientIds.length} available clients: ${clientIds.join(', ')}`);
    
    return clientIds;
  }

  /**
   * Calculate round-robin assignments
   */
  private calculateRoundRobinAssignments(
    promoteClients: PromoteClient[],
    availableClients: string[]
  ): Array<{ mobile: string; clientId: string; channels: number }> {
    this.logger.log('🔄 Calculating round-robin assignments...');
    
    const assignments: Array<{ mobile: string; clientId: string; channels: number }> = [];
    let clientIndex = 0;

    for (const promoteClient of promoteClients) {
      const assignedClientId = availableClients[clientIndex];
      
      assignments.push({
        mobile: promoteClient.mobile,
        clientId: assignedClientId,
        channels: promoteClient.channels
      });

      // Move to next client in round-robin fashion
      clientIndex = (clientIndex + 1) % availableClients.length;
    }

    return assignments;
  }

  /**
   * Display the assignment plan
   */
  private displayAssignmentPlan(
    assignments: Array<{ mobile: string; clientId: string; channels: number }>,
    availableClients: string[]
  ): void {
    this.logger.log('📋 Assignment Plan:');
    
    // Group assignments by clientId
    const assignmentsByClient = availableClients.reduce((acc, clientId) => {
      acc[clientId] = assignments.filter(a => a.clientId === clientId);
      return acc;
    }, {} as Record<string, Array<{ mobile: string; clientId: string; channels: number }>>);

    // Display distribution
    for (const clientId of availableClients) {
      const clientAssignments = assignmentsByClient[clientId];
      const totalChannels = clientAssignments.reduce((sum, a) => sum + a.channels, 0);
      
      this.logger.log(`   ${clientId}: ${clientAssignments.length} promote clients, ${totalChannels} total channels`);
      
      // Show first few assignments for verification
      const preview = clientAssignments.slice(0, 3).map(a => `${a.mobile}(${a.channels}ch)`).join(', ');
      if (clientAssignments.length > 3) {
        this.logger.log(`      Preview: ${preview}... +${clientAssignments.length - 3} more`);
      } else if (clientAssignments.length > 0) {
        this.logger.log(`      All: ${preview}`);
      }
    }

    // Display balance check
    const countsPerClient = availableClients.map(clientId => assignmentsByClient[clientId].length);
    const minCount = Math.min(...countsPerClient);
    const maxCount = Math.max(...countsPerClient);
    const isBalanced = (maxCount - minCount) <= 1;
    
    this.logger.log(`⚖️  Distribution balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);
  }

  /**
   * Execute the assignments
   */
  private async executeAssignments(
    assignments: Array<{ mobile: string; clientId: string; channels: number }>
  ): Promise<void> {
    this.logger.log('💾 Executing assignments...');
    
    const batchSize = 10; // Process in batches to avoid overwhelming the database
    
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(assignments.length / batchSize);
      
      this.logger.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} assignments)...`);
      
      await Promise.allSettled(
        batch.map(async (assignment) => {
          try {
            await this.promoteClientModel.findOneAndUpdate(
              { mobile: assignment.mobile },
              { 
                $set: { 
                  clientId: assignment.clientId,
                  status: 'active', // Ensure migrated clients are active
                  message: `Assigned to ${assignment.clientId} via round-robin migration`
                } 
              },
              { new: true }
            ).exec();
            
            this.stats.assignedCount++;
            this.logger.debug(`✅ Assigned ${assignment.mobile} → ${assignment.clientId}`);
            
          } catch (error) {
            this.stats.errorCount++;
            this.logger.error(`❌ Failed to assign ${assignment.mobile}: ${error.message}`);
          }
        })
      );
      
      // Small delay between batches
      if (i + batchSize < assignments.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.logger.log(`✅ Assignment execution completed: ${this.stats.assignedCount} assigned, ${this.stats.errorCount} errors`);
  }

  /**
   * Gather final statistics after migration
   */
  private async gatherFinalStats(): Promise<void> {
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

  /**
   * Get current distribution of promote clients per client
   */
  private async getCurrentDistribution(): Promise<Record<string, number>> {
    const distribution: Record<string, number> = {};
    
    const clients = await this.clientService.findAll();
    
    for (const client of clients) {
      const count = await this.promoteClientModel.countDocuments({ clientId: client.clientId });
      distribution[client.clientId] = count;
    }
    
    return distribution;
  }

  /**
   * Display migration summary
   */
  private displayMigrationSummary(): void {
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

  /**
   * Display dry run summary
   */
  private displayDryRunSummary(
    assignments: Array<{ mobile: string; clientId: string; channels: number }>,
    availableClients: string[]
  ): void {
    this.logger.log('\n🔍 DRY RUN SUMMARY');
    this.logger.log('=================');
    this.logger.log(`📊 Would assign ${assignments.length} promote clients`);
    
    // Calculate what the distribution would be
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

/**
 * Main execution function
 */
async function runMigration() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--live');
  
  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode. Use --live flag to execute actual migration.');
  }

  let app;
  
  try {
    // Bootstrap NestJS application
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn', 'debug']
    });

    // Get required services
    const promoteClientService = app.get(PromoteClientService);
    const clientService = app.get(ClientService);
    const promoteClientModel = app.get(getModelToken(PromoteClient.name));

    // Create and run migration
    const migration = new PromoteClientRoundRobinMigration(
      promoteClientService,
      clientService,
      promoteClientModel
    );

    const stats = await migration.executeMigration(dryRun);
    
    // Exit with appropriate code
    const hasErrors = stats.errorCount > 0;
    process.exit(hasErrors ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

export { PromoteClientRoundRobinMigration, MigrationStats };
