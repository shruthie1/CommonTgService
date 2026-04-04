import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, BadRequestException, ParseEnumPipe } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import {
  ActivationRequestDto,
  BulkEnrollPromoteClientsRequestDto,
  DeactivationRequestDto,
  MarkUsedRequestDto,
  StatusUpdateRequestDto,
  UsageStatisticsDto,
} from '../shared/dto/client-swagger.dto';
import { ClientStatus, ClientStatusType } from '../shared/base-client.service';

@ApiTags('Promote Clients')
@Controller('promoteclients')
export class PromoteClientController {
  constructor(private readonly clientService: PromoteClientService) {}

  @Post()
  @ApiOperation({ summary: 'Create a promote client record', description: 'Creates a promote client directly from supplied data.' })
  @ApiBody({ type: CreatePromoteClientDto })
  @ApiCreatedResponse({ type: PromoteClient })
  @ApiBadRequestResponse({ description: 'Request body validation failed.' })
  async create(@Body() createClientDto: CreatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search promote clients', description: 'Searches promote client records by supported fields.' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name' })
  @ApiQuery({ name: 'lastName', required: false, description: 'Last name' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  @ApiOkResponse({ type: [PromoteClient] })
  async search(@Query() query: SearchPromoteClientDto): Promise<PromoteClient[]> {
    return this.clientService.search(query);
  }

  @Get('joinChannelsForPromoteClients')
  @ApiOperation({ summary: 'Prepare channel joins for promote clients', description: 'Builds the next join queue for eligible promote clients.' })
  @ApiOkResponse({ schema: { type: 'string', example: 'Join channels initiated successfully' } })
  async joinChannelsforPromoteClients(): Promise<string> {
    return this.clientService.joinchannelForPromoteClients();
  }

  @Get('updateInfo')
  @ApiOperation({ summary: 'Refresh promote client metadata', description: 'Starts a background refresh of promote client metadata and channel counts.' })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  async updateInfo(): Promise<string> {
    this.clientService.updateInfo();
    return 'initiated Checking';
  }

  @Get('checkPromoteClients')
  @ApiOperation({ summary: 'Run promote warmup processing', description: 'Starts the background warmup processor for eligible promote clients.' })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  async checkpromoteClients(): Promise<string> {
    this.clientService.checkPromoteClients();
    return 'initiated Checking';
  }

  @Post('addNewUserstoPromoteClients')
  @ApiOperation({ summary: 'Bulk enroll users into promote warmup', description: 'Starts background enrollment of candidate users into the promote client pool.' })
  @ApiBody({ type: BulkEnrollPromoteClientsRequestDto })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  @ApiBadRequestResponse({ description: 'goodIds, badIds, or clientsNeedingPromoteClients were not valid arrays.' })
  async addNewUserstoPromoteClients(@Body() body: BulkEnrollPromoteClientsRequestDto): Promise<string> {
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
  @ApiOperation({ summary: 'List promote clients', description: 'Returns all promote clients, optionally filtered by status.' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)' })
  @ApiOkResponse({ type: [PromoteClient] })
  async findAll(
    @Query('status', new ParseEnumPipe(ClientStatus, { optional: true })) status?: ClientStatusType
  ): Promise<PromoteClient[]> {
    return this.clientService.findAll(status);
  }

  @Get('SetAsPromoteClient/:mobile')
  @ApiOperation({ summary: 'Enroll a user as a promote client', description: 'Converts an existing user account into a warmup-managed promote client.' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ schema: { type: 'string', example: 'Client enrolled as promote successfully' } })
  @ApiBadRequestResponse({ description: 'The user was not found or is already an active main client.' })
  @ApiConflictResponse({ description: 'A promote client record already exists for this mobile.' })
  async setAsPromoteClient(@Param('mobile') mobile: string) {
    return this.clientService.setAsPromoteClient(mobile);
  }

  @Get('mobile/:mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ type: PromoteClient })
  @ApiNotFoundResponse({ description: 'Promote client not found.' })
  async findOne(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdatePromoteClientDto })
  @ApiOkResponse({ type: PromoteClient })
  @ApiNotFoundResponse({ description: 'Promote client not found.' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put('mobile/:mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdatePromoteClientDto })
  @ApiOkResponse({ type: PromoteClient })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete('mobile/:mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ schema: { type: 'null' } })
  @ApiNotFoundResponse({ description: 'Promote client not found.' })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a raw promote client query', description: 'Executes a direct MongoDB-style filter against the promote client collection.' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true, example: { status: 'active', clientId: 'client-a' } } })
  @ApiOkResponse({ type: [PromoteClient] })
  async executeQuery(@Body() query: object): Promise<any> {
    return this.clientService.executeQuery(query);
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get promote client distribution per client' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async getPromoteClientDistribution(): Promise<any> {
    return this.clientService.getPromoteClientDistribution();
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get promote clients by status' })
  @ApiParam({ name: 'status', description: 'Status to filter by (active/inactive)', type: String })
  @ApiOkResponse({ type: [PromoteClient] })
  async getPromoteClientsByStatus(
    @Param('status', new ParseEnumPipe(ClientStatus)) status: ClientStatusType
  ): Promise<PromoteClient[]> {
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
  @ApiBody({ type: StatusUpdateRequestDto })
  @ApiOkResponse({ type: PromoteClient })
  @ApiBadRequestResponse({ description: 'Status must be either active or inactive.' })
  async updateStatus(@Param('mobile') mobile: string, @Body() body: StatusUpdateRequestDto): Promise<PromoteClient> {
    if (body.status !== 'active' && body.status !== 'inactive') {
      throw new BadRequestException('Status must be either "active" or "inactive"');
    }
    return this.clientService.updateStatus(mobile, body.status as 'active' | 'inactive', body.message);
  }

  @Patch('activate/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as active' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ type: ActivationRequestDto })
  @ApiOkResponse({ type: PromoteClient })
  async markAsActive(@Param('mobile') mobile: string, @Body() body: ActivationRequestDto = {}): Promise<PromoteClient> {
    return this.clientService.markAsActive(mobile, body.message);
  }

  @Patch('deactivate/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as inactive' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ type: DeactivationRequestDto })
  @ApiOkResponse({ type: PromoteClient })
  async markAsInactive(@Param('mobile') mobile: string, @Body() body: DeactivationRequestDto): Promise<PromoteClient> {
    return this.clientService.markAsInactive(mobile, body.reason);
  }

  @Patch('mark-used/:mobile')
  @ApiOperation({ summary: 'Mark a promote client as used (update lastUsed timestamp)' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiBody({ type: MarkUsedRequestDto })
  @ApiOkResponse({ type: PromoteClient })
  async markAsUsed(
    @Param('mobile') mobile: string,
    @Body() body: MarkUsedRequestDto = {}
  ): Promise<PromoteClient> {
    return this.clientService.markAsUsed(mobile, body.message);
  }

  @Patch('update-last-used/:mobile')
  @ApiOperation({ summary: 'Update last used timestamp for a promote client' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the promote client', type: String })
  @ApiOkResponse({ type: PromoteClient })
  async updateLastUsed(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.updateLastUsed(mobile);
  }

  @Get('least-recently-used/:clientId')
  @ApiOperation({ summary: 'Get least recently used promote clients for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get promote clients for', type: String })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of promote clients to return', type: Number })
  @ApiOkResponse({ type: [PromoteClient] })
  async getLeastRecentlyUsed(@Param('clientId') clientId: string, @Query('limit') limit?: number): Promise<PromoteClient[]> {
    return this.clientService.getLeastRecentlyUsedPromoteClients(clientId, limit || 1);
  }

  @Get('next-available/:clientId')
  @ApiOperation({ summary: 'Get next available promote client for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get next available promote client for', type: String })
  @ApiOkResponse({ type: PromoteClient })
  async getNextAvailable(@Param('clientId') clientId: string): Promise<PromoteClient | null> {
    return this.clientService.getNextAvailablePromoteClient(clientId);
  }

  @Get('unused')
  @ApiOperation({ summary: "Get promote clients that haven't been used for a specified time period" })
  @ApiQuery({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiOkResponse({ type: [PromoteClient] })
  async getUnusedPromoteClients(@Query('hoursAgo') hoursAgo?: number, @Query('clientId') clientId?: string): Promise<PromoteClient[]> {
    return this.clientService.getUnusedPromoteClients(hoursAgo || 24, clientId);
  }

  @Get('usage-stats')
  @ApiOperation({ summary: 'Get usage statistics for promote clients' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiOkResponse({ type: UsageStatisticsDto })
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
