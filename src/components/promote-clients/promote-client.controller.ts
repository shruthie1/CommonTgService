import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PromoteClientService } from './promote-client.service';
import { PromoteClientMigrationService, MigrationResult } from './migration.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';

@ApiTags('Promote Clients')
@Controller('promoteclients')
export class PromoteClientController {
  constructor(
    private readonly clientService: PromoteClientService,
    private readonly migrationService: PromoteClientMigrationService
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  async create(@Body() createClientDto: CreatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name' })
  @ApiQuery({ name: 'lastName', required: false, description: 'Last name' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  async search(@Query() query: SearchPromoteClientDto): Promise<PromoteClient[]> {
    return this.clientService.search(query);
  }

  @Get('joinChannelsForPromoteClients')
  @ApiOperation({ summary: 'Join Channels for PromoteClients' })
  async joinChannelsforPromoteClients(): Promise<string> {
    return this.clientService.joinchannelForPromoteClients();
  }

  @Get('checkPromoteClients')
  @ApiOperation({ summary: 'Check Promote Clients' })
  async checkpromoteClients(): Promise<string> {
    // Fire-and-forget pattern for long-running operations
    this.clientService.checkPromoteClients().catch(error => {
      console.error('Error in checkPromoteClients:', error);
    });
    return "initiated Checking"
  }

  @Post('addNewUserstoPromoteClients')
  @ApiOperation({ summary: 'Add New Users to Promote Clients' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        goodIds: { type: 'array', items: { type: 'string' } },
        badIds: { type: 'array', items: { type: 'string' } },
        clientsNeedingPromoteClients: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  async addNewUserstoPromoteClients(@Body() body: { 
    goodIds: string[], 
    badIds: string[], 
    clientsNeedingPromoteClients?: string[] 
  }): Promise<string> {
    // Validate input parameters
    if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
      throw new BadRequestException('goodIds and badIds must be arrays');
    }
    
    if (body.clientsNeedingPromoteClients && !Array.isArray(body.clientsNeedingPromoteClients)) {
      throw new BadRequestException('clientsNeedingPromoteClients must be an array');
    }

    // Fire-and-forget pattern for long-running operations
    this.clientService.addNewUserstoPromoteClients(
      body.badIds, 
      body.goodIds, 
      body.clientsNeedingPromoteClients || [],
      undefined // No promoteClientsPerClient map available in controller
    ).catch(error => {
      console.error('Error in addNewUserstoPromoteClients:', error);
    });
    return "initiated Checking"
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)' })
  async findAll(@Query('status') status?: string): Promise<PromoteClient[]> {
    return this.clientService.findAll(status);
  }

  @Get('SetAsPromoteClient/:mobile')
  @ApiOperation({ summary: 'Set as Promote Client' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  async setAsPromoteClient(
    @Param('mobile') mobile: string,
  ) {
    return await this.clientService.setAsPromoteClient(mobile);
  }

  @Get('mobile/:mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  async findOne(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete('mobile/:mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({ type: Object })
  async executeQuery(@Body() query: object): Promise<any> {
    try {
      return await this.clientService.executeQuery(query);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get promote client distribution per client' })
  async getPromoteClientDistribution(): Promise<any> {
    return this.clientService.getPromoteClientDistribution();
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get promote clients by status' })
  @ApiParam({ name: 'status', description: 'Status to filter by (active/inactive)', type: String })
  async getPromoteClientsByStatus(@Param('status') status: string): Promise<PromoteClient[]> {
    return this.clientService.getPromoteClientsByStatus(status);
  }

  @Get('messages/all')
  @ApiOperation({ summary: 'Get all promote clients with their status messages' })
  async getPromoteClientsWithMessages(): Promise<Array<{mobile: string, status: string, message: string, clientId?: string}>> {
    return this.clientService.getPromoteClientsWithMessages();
  }

  @Patch('status/:mobile')
  @ApiOperation({ summary: 'Update status of a promote client' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'New status (active/inactive)' },
        message: { type: 'string', description: 'Status message (optional)' }
      },
      required: ['status']
    }
  })
  async updateStatus(
    @Param('mobile') mobile: string, 
    @Body() body: { status: string, message?: string }
  ): Promise<PromoteClient> {
    return this.clientService.updateStatus(mobile, body.status, body.message);
  }

  @Patch('activate/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as active' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Activation message (optional)' }
      }
    }
  })
  async markAsActive(
    @Param('mobile') mobile: string, 
    @Body() body: { message?: string } = {}
  ): Promise<PromoteClient> {
    return this.clientService.markAsActive(mobile, body.message);
  }

  @Patch('deactivate/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as inactive' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for deactivation' }
      },
      required: ['reason']
    }
  })
  async markAsInactive(
    @Param('mobile') mobile: string, 
    @Body() body: { reason: string }
  ): Promise<PromoteClient> {
    return this.clientService.markAsInactive(mobile, body.reason);
  }

  @Patch('mark-used/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as used (update lastUsed timestamp)' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Usage message (optional)' }
      }
    }
  })
  async markAsUsed(
    @Param('mobile') mobile: string, 
    @Body() body: { message?: string } = {}
  ): Promise<PromoteClient> {
    return this.clientService.markAsUsed(mobile, body.message);
  }

  @Patch('update-last-used/:mobile')
  @ApiOperation({ summary: 'Update last used timestamp for a promote client' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  async updateLastUsed(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.updateLastUsed(mobile);
  }

  @Get('least-recently-used/:clientId')
  @ApiOperation({ summary: 'Get least recently used promote clients for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get promote clients for', type: String })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of promote clients to return', type: Number })
  async getLeastRecentlyUsed(
    @Param('clientId') clientId: string,
    @Query('limit') limit?: number
  ): Promise<PromoteClient[]> {
    return this.clientService.getLeastRecentlyUsedPromoteClients(clientId, limit || 1);
  }

  @Get('next-available/:clientId')
  @ApiOperation({ summary: 'Get next available promote client for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get next available promote client for', type: String })
  async getNextAvailable(@Param('clientId') clientId: string): Promise<PromoteClient | null> {
    return this.clientService.getNextAvailablePromoteClient(clientId);
  }

  @Get('unused')
  @ApiOperation({ summary: 'Get promote clients that haven\'t been used for a specified time period' })
  @ApiQuery({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  async getUnusedPromoteClients(
    @Query('hoursAgo') hoursAgo?: number,
    @Query('clientId') clientId?: string
  ): Promise<PromoteClient[]> {
    return this.clientService.getUnusedPromoteClients(hoursAgo || 24, clientId);
  }

  @Get('usage-stats')
  @ApiOperation({ summary: 'Get usage statistics for promote clients' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  async getUsageStatistics(@Query('clientId') clientId?: string): Promise<{
    totalClients: number;
    neverUsed: number;
    usedInLast24Hours: number;
    usedInLastWeek: number;
    averageUsageGap: number;
  }> {
    return this.clientService.getUsageStatistics(clientId);
  }

  // Migration endpoints
  @Get('migration/status')
  @ApiOperation({ summary: 'Get current migration status' })
  async getMigrationStatus(): Promise<{
    totalPromoteClients: number;
    assignedPromoteClients: number;
    unassignedPromoteClients: number;
    distributionPerClient: Record<string, number>;
    lastMigrationNeeded: boolean;
  }> {
    return this.migrationService.getMigrationStatus();
  }

  @Get('migration/preview')
  @ApiOperation({ summary: 'Preview round-robin migration without executing' })
  async getMigrationPreview(): Promise<{
    unassignedCount: number;
    availableClients: string[];
    projectedDistribution: Record<string, number>;
    currentDistribution: Record<string, number>;
    isBalanced: boolean;
  }> {
    return this.migrationService.getMigrationPreview();
  }

  @Post('migration/execute')
  @ApiOperation({ summary: 'Execute round-robin migration for unassigned promote clients' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        dryRun: { 
          type: 'boolean', 
          description: 'Run in dry-run mode (no changes will be made)',
          default: true
        }
      }
    }
  })
  async executeRoundRobinMigration(
    @Body() body: { dryRun?: boolean } = {}
  ): Promise<MigrationResult> {
    const dryRun = body.dryRun !== false; // Default to true for safety
    return this.migrationService.executeRoundRobinMigration(dryRun);
  }

  @Post('migration/execute-live')
  @ApiOperation({ 
    summary: 'Execute round-robin migration in LIVE mode (makes actual changes)',
    description: 'This endpoint will make actual changes to the database. Use with caution!'
  })
  async executeRoundRobinMigrationLive(): Promise<MigrationResult> {
    return this.migrationService.executeRoundRobinMigration(false);
  }

}
