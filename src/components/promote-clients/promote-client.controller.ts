import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';

@ApiTags('Promote Clients')
@Controller('promoteclients')
export class PromoteClientController {
  constructor(private readonly clientService: PromoteClientService) {}

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  @ApiBody({ type: CreatePromoteClientDto })
  @ApiResponse({ type: PromoteClient })
  async create(@Body() createClientDto: CreatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name' })
  @ApiQuery({ name: 'lastName', required: false, description: 'Last name' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  @ApiResponse({ type: [PromoteClient] })
  async search(@Query() query: SearchPromoteClientDto): Promise<PromoteClient[]> {
    return this.clientService.search(query);
  }

  @Get('joinChannelsForPromoteClients')
  @ApiOperation({ summary: 'Join Channels for PromoteClients' })
  @ApiResponse({ type: String })
  async joinChannelsforPromoteClients(): Promise<string> {
    return this.clientService.joinchannelForPromoteClients();
  }

  @Get('updateInfo')
  @ApiOperation({ summary: 'Update promote Clients Info' })
  @ApiResponse({ type: String })
  async updateInfo(): Promise<string> {
    this.clientService.updateInfo();
    return 'initiated Checking';
  }

  @Get('checkPromoteClients')
  @ApiOperation({ summary: 'Check Promote Clients' })
  @ApiResponse({ type: String })
  async checkpromoteClients(): Promise<string> {
    this.clientService.checkPromoteClients();
    return 'initiated Checking';
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
  @ApiResponse({ type: String })
  async addNewUserstoPromoteClients(@Body() body: {
    goodIds: string[];
    badIds: string[];
    clientsNeedingPromoteClients?: string[];
  }): Promise<string> {
    if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
      throw new BadRequestException('goodIds and badIds must be arrays');
    }

    if (body.clientsNeedingPromoteClients && !Array.isArray(body.clientsNeedingPromoteClients)) {
      throw new BadRequestException('clientsNeedingPromoteClients must be an array');
    }

    this.clientService.addNewUserstoPromoteClients(
      body.badIds,
      body.goodIds,
      body.clientsNeedingPromoteClients || [],
      undefined
    );
    return 'initiated Checking';
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)' })
  @ApiResponse({ type: [PromoteClient] })
  async findAll(@Query('status') status?: string): Promise<PromoteClient[]> {
    return this.clientService.findAll(status);
  }

  @Get('SetAsPromoteClient/:mobile')
  @ApiOperation({ summary: 'Set as Promote Client' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: PromoteClient })
  async setAsPromoteClient(@Param('mobile') mobile: string) {
    return this.clientService.setAsPromoteClient(mobile);
  }

  @Get('mobile/:mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: PromoteClient })
  async findOne(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdatePromoteClientDto })
  @ApiResponse({ type: PromoteClient })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdatePromoteClientDto })
  @ApiResponse({ type: PromoteClient })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete('mobile/:mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: null })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({ type: Object })
  @ApiResponse({ type: Object })
  async executeQuery(@Body() query: object): Promise<any> {
    return this.clientService.executeQuery(query);
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get promote client distribution per client' })
  @ApiResponse({ type: Object })
  async getPromoteClientDistribution(): Promise<any> {
    return this.clientService.getPromoteClientDistribution();
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get promote clients by status' })
  @ApiParam({ name: 'status', description: 'Status to filter by (active/inactive)', type: String })
  @ApiResponse({ type: [PromoteClient] })
  async getPromoteClientsByStatus(@Param('status') status: string): Promise<PromoteClient[]> {
    return this.clientService.getPromoteClientsByStatus(status);
  }

  @Get('messages/all')
  @ApiOperation({ summary: 'Get all promote clients with their status messages' })
  async getPromoteClientsWithMessages(): Promise<Array<{ mobile: string, status: string, message: string, clientId?: string }>> {
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
  @ApiResponse({ type: PromoteClient })
  async updateStatus(@Param('mobile') mobile: string, @Body() body: { status: string; message?: string }): Promise<PromoteClient> {
    if (body.status !== 'active' && body.status !== 'inactive') {
      throw new BadRequestException('Status must be either "active" or "inactive"');
    }
    return this.clientService.updateStatus(mobile, body.status as 'active' | 'inactive', body.message);
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
  @ApiResponse({ type: PromoteClient })
  async markAsActive(@Param('mobile') mobile: string, @Body() body: { message?: string } = {}): Promise<PromoteClient> {
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
  @ApiResponse({ type: PromoteClient })
  async markAsInactive(@Param('mobile') mobile: string, @Body() body: { reason: string }): Promise<PromoteClient> {
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
  @ApiResponse({ type: PromoteClient })
  async updateLastUsed(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.updateLastUsed(mobile);
  }

  @Get('least-recently-used/:clientId')
  @ApiOperation({ summary: 'Get least recently used promote clients for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get promote clients for', type: String })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of promote clients to return', type: Number })
  @ApiResponse({ type: [PromoteClient] })
  async getLeastRecentlyUsed(@Param('clientId') clientId: string, @Query('limit') limit?: number): Promise<PromoteClient[]> {
    return this.clientService.getLeastRecentlyUsedPromoteClients(clientId, limit || 1);
  }

  @Get('next-available/:clientId')
  @ApiOperation({ summary: 'Get next available promote client for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get next available promote client for', type: String })
  @ApiResponse({ type: PromoteClient })
  async getNextAvailable(@Param('clientId') clientId: string): Promise<PromoteClient | null> {
    return this.clientService.getNextAvailablePromoteClient(clientId);
  }

  @Get('unused')
  @ApiOperation({ summary: "Get promote clients that haven't been used for a specified time period" })
  @ApiQuery({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiResponse({ type: [PromoteClient] })
  async getUnusedPromoteClients(@Query('hoursAgo') hoursAgo?: number, @Query('clientId') clientId?: string): Promise<PromoteClient[]> {
    return this.clientService.getUnusedPromoteClients(hoursAgo || 24, clientId);
  }

  @Get('usage-stats')
  @ApiOperation({ summary: 'Get usage statistics for promote clients' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiResponse({
    schema: {
      type: 'object',
      properties: {
        totalClients: { type: 'number' },
        neverUsed: { type: 'number' },
        usedInLast24Hours: { type: 'number' },
        usedInLastWeek: { type: 'number' },
        averageUsageGap: { type: 'number' }
      }
    }
  })
  async getUsageStatistics(@Query('clientId') clientId?: string): Promise<{
    totalClients: number;
    neverUsed: number;
    usedInLast24Hours: number;
    usedInLastWeek: number;
    averageUsageGap: number;
  }> {
    return this.clientService.getUsageStatistics(clientId);
  }
}