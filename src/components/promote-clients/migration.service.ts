import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PromoteClient, PromoteClientDocument } from './schemas/promote-client.schema';
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

@Injectable()
export class PromoteClientMigrationService {
  private readonly logger = new Logger(PromoteClientMigrationService.name);
  
  constructor(
    @InjectModel(PromoteClient.name) 
    private readonly promoteClientModel: Model<PromoteClientDocument>,
    private readonly promoteClientService: PromoteClientService,
    private readonly clientService: ClientService
  ) {}

  /**
   * Execute round-robin migration for unassigned promote clients
   */
  async executeRoundRobinMigration(dryRun: boolean = false): Promise<MigrationResult> {
    const startTime = Date.now();
    
    this.logger.log('🚀 Starting PromoteClient Round-Robin Migration');
    this.logger.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);

    const stats: MigrationStats = {
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
      // Step 1: Gather initial statistics
      await this.gatherInitialStats(stats);

      // Step 2: Get unassigned promote clients sorted by channel count
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

      // Step 3: Get available clients
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

      // Step 4: Calculate round-robin assignments
      const assignments = this.calculateRoundRobinAssignments(unassignedPromoteClients, availableClients);

      // Step 5: Log assignment plan
      this.logAssignmentPlan(assignments, availableClients);

      // Step 6: Execute assignments (if not dry run)
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

    } catch (error) {
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

  /**
   * Get migration preview without executing
   */
  async getMigrationPreview(): Promise<{
    unassignedCount: number;
    availableClients: string[];
    projectedDistribution: Record<string, number>;
    currentDistribution: Record<string, number>;
    isBalanced: boolean;
  }> {
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
    
    // Calculate projected distribution
    const projectedDistribution = { ...currentDistribution };
    for (const assignment of assignments) {
      projectedDistribution[assignment.clientId] = (projectedDistribution[assignment.clientId] || 0) + 1;
    }

    // Check if distribution is balanced
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

  /**
   * Get current migration status
   */
  async getMigrationStatus(): Promise<{
    totalPromoteClients: number;
    assignedPromoteClients: number;
    unassignedPromoteClients: number;
    distributionPerClient: Record<string, number>;
    lastMigrationNeeded: boolean;
  }> {
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

  // Private helper methods

  private async gatherInitialStats(stats: MigrationStats): Promise<void> {
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

  private async getAvailableClients(): Promise<string[]> {
    this.logger.log('👥 Getting available clients...');
    
    const clients = await this.clientService.findAll();
    const clientIds = clients.map(client => client.clientId).filter(Boolean);
    
    this.logger.log(`👤 Found ${clientIds.length} available clients: ${clientIds.join(', ')}`);
    
    return clientIds;
  }

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

  private logAssignmentPlan(
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
    }

    // Display balance check
    const countsPerClient = availableClients.map(clientId => assignmentsByClient[clientId].length);
    const minCount = Math.min(...countsPerClient);
    const maxCount = Math.max(...countsPerClient);
    const isBalanced = (maxCount - minCount) <= 1;
    
    this.logger.log(`⚖️  Distribution balance: ${isBalanced ? '✅ BALANCED' : '⚠️  UNBALANCED'} (min: ${minCount}, max: ${maxCount})`);
  }

  private async executeAssignments(
    assignments: Array<{ mobile: string; clientId: string; channels: number }>,
    stats: MigrationStats
  ): Promise<void> {
    this.logger.log('💾 Executing assignments...');
    
    const batchSize = 10; // Process in batches to avoid overwhelming the database
    
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(assignments.length / batchSize);
      
      this.logger.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} assignments)...`);
      
      const results = await Promise.allSettled(
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
            
            stats.assignedCount++;
            this.logger.debug(`✅ Assigned ${assignment.mobile} → ${assignment.clientId}`);
            
          } catch (error) {
            stats.errorCount++;
            this.logger.error(`❌ Failed to assign ${assignment.mobile}: ${error.message}`);
            throw error;
          }
        })
      );
      
      // Count failed assignments
      const failedCount = results.filter(result => result.status === 'rejected').length;
      if (failedCount > 0) {
        this.logger.warn(`⚠️  Batch ${batchNumber}: ${failedCount} failed assignments`);
      }
      
      // Small delay between batches
      if (i + batchSize < assignments.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.logger.log(`✅ Assignment execution completed: ${stats.assignedCount} assigned, ${stats.errorCount} errors`);
  }

  private async gatherFinalStats(stats: MigrationStats): Promise<void> {
    this.logger.log('📊 Gathering final statistics...');
    stats.distributionAfter = await this.getCurrentDistribution();
  }

  private async getCurrentDistribution(): Promise<Record<string, number>> {
    const distribution: Record<string, number> = {};
    
    const clients = await this.clientService.findAll();
    
    for (const client of clients) {
      const count = await this.promoteClientModel.countDocuments({ clientId: client.clientId });
      distribution[client.clientId] = count;
    }
    
    return distribution;
  }
}
