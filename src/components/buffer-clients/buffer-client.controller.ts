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
import { BufferClientService } from './buffer-client.service';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
import {
  ActivationRequestDto,
  BulkEnrollBufferClientsRequestDto,
  DeactivationRequestDto,
  MarkUsedRequestDto,
  StatusUpdateRequestDto,
} from '../shared/dto/client-swagger.dto';
import { ClientStatus, ClientStatusType } from '../shared/base-client.service';

@ApiTags('Buffer Clients')
@Controller('bufferclients')
export class BufferClientController {
  constructor(private readonly clientService: BufferClientService) { }

  @Post()
  @ApiOperation({ summary: 'Create a buffer client record', description: 'Creates a buffer client directly from supplied data.' })
  @ApiBody({ type: CreateBufferClientDto })
  @ApiCreatedResponse({ type: BufferClient })
  @ApiBadRequestResponse({ description: 'Request body validation failed.' })
  async create(@Body() createClientDto: CreateBufferClientDto): Promise<BufferClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search buffer clients', description: 'Searches buffer client records by indexed and operational fields.' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  @ApiQuery({ name: 'name', required: false, description: 'Name' })
  @ApiQuery({ name: 'channelLink', required: false, description: 'Channel link' })
  @ApiQuery({ name: 'repl', required: false, description: 'Repl link' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiOkResponse({ type: [BufferClient] })
  async search(@Query() query: SearchBufferClientDto): Promise<BufferClient[]> {
    return this.clientService.search(query);
  }

  @Get('updateInfo')
  @ApiOperation({ summary: 'Refresh buffer client metadata', description: 'Starts a background refresh of buffer client metadata and channel counts.' })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  async updateInfo(): Promise<string> {
    // Fire-and-forget pattern for long-running operations
    this.clientService.updateInfo();
    return 'initiated Checking';
  }

  @Get('joinChannelsForBufferClients')
  @ApiOperation({ summary: 'Prepare channel joins for buffer clients', description: 'Builds the next join queue for eligible buffer clients.' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiOkResponse({ schema: { type: 'string', example: 'Join channels initiated successfully' } })
  async joinChannelsforBufferClients(@Query('clientId') clientId?: string): Promise<string> {
    return this.clientService.joinchannelForBufferClients(true, clientId);
  }

  @Get('checkBufferClients')
  @ApiOperation({ summary: 'Run buffer warmup processing', description: 'Starts the background warmup processor for eligible buffer clients.' })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  async checkbufferClients(): Promise<string> {
    this.clientService.checkBufferClients();
    return 'initiated Checking';
  }

  @Post('addNewUserstoBufferClients')
  @ApiOperation({ summary: 'Bulk enroll users into buffer warmup', description: 'Starts background enrollment of candidate users into the buffer client pool.' })
  @ApiBody({ type: BulkEnrollBufferClientsRequestDto })
  @ApiAcceptedResponse({ schema: { type: 'string', example: 'initiated Checking' } })
  @ApiBadRequestResponse({ description: 'goodIds, badIds, or clientsNeedingBufferClients were not valid arrays.' })
  async addNewUserstoBufferClients(@Body() body: BulkEnrollBufferClientsRequestDto): Promise<string> {
    if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
      throw new BadRequestException('goodIds and badIds must be arrays');
    }

    if (body.clientsNeedingBufferClients && !Array.isArray(body.clientsNeedingBufferClients)) {
      throw new BadRequestException('clientsNeedingBufferClients must be an array');
    }

    this.clientService.addNewUserstoBufferClients(
      body.badIds,
      body.goodIds,
      body.clientsNeedingBufferClients || [],
      undefined
    );
    return 'initiated Checking';
  }

  @Get()
  @ApiOperation({ summary: 'List buffer clients', description: 'Returns all buffer clients, optionally filtered by status.' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)' })
  @ApiOkResponse({ type: [BufferClient] })
  async findAll(
    @Query('status', new ParseEnumPipe(ClientStatus, { optional: true })) status?: ClientStatusType
  ): Promise<BufferClient[]> {
    return this.clientService.findAll(status);
  }

  @Post('SetAsBufferClient/:mobile/:clientId')
  @ApiOperation({ summary: 'Enroll a user as a buffer client', description: 'Converts an existing user account into a warmup-managed buffer client.' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiParam({ name: 'clientId', description: 'Client ID to assign buffer client to', type: String })
  @ApiOkResponse({ schema: { type: 'string', example: 'Client enrolled as buffer successfully' } })
  @ApiBadRequestResponse({ description: 'The user was not found or is already an active main client.' })
  @ApiConflictResponse({ description: 'A buffer client record already exists for this mobile.' })
  async setAsBufferClient(@Param('mobile') mobile: string, @Param('clientId') clientId: string) {
    return this.clientService.setAsBufferClient(mobile, clientId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a raw buffer client query', description: 'Executes a direct MongoDB-style filter against the buffer client collection.' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true, example: { status: 'active', clientId: 'client-a' } } })
  @ApiOkResponse({ type: [BufferClient] })
  async executeQuery(@Body() query: object): Promise<any> {
    return this.clientService.executeQuery(query);
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get buffer client distribution per client' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async getBufferClientDistribution(): Promise<any> {
    return this.clientService.getBufferClientDistribution();
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Get buffer clients by client ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get buffer clients for', type: String })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)', type: String })
  @ApiOkResponse({ type: [BufferClient] })
  async getBufferClientsByClientId(
    @Param('clientId') clientId: string,
    @Query('status', new ParseEnumPipe(ClientStatus, { optional: true })) status?: ClientStatusType
  ): Promise<BufferClient[]> {
    return this.clientService.getBufferClientsByClientId(clientId, status);
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get buffer clients by status' })
  @ApiParam({ name: 'status', description: 'Status to filter by (active/inactive)', type: String })
  @ApiOkResponse({ type: [BufferClient] })
  async getBufferClientsByStatus(
    @Param('status', new ParseEnumPipe(ClientStatus)) status: ClientStatusType
  ): Promise<BufferClient[]> {
    return this.clientService.findAll(status);
  }

  @Patch('status/:mobile')
  @ApiOperation({ summary: 'Update status of a buffer client' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({ type: StatusUpdateRequestDto })
  @ApiOkResponse({ type: BufferClient })
  @ApiBadRequestResponse({ description: 'Status must be either active or inactive.' })
  @ApiNotFoundResponse({ description: 'Buffer client not found.' })
  async updateStatus(@Param('mobile') mobile: string, @Body() body: StatusUpdateRequestDto): Promise<BufferClient> {
    if (body.status !== 'active' && body.status !== 'inactive') {
      throw new BadRequestException('Status must be either "active" or "inactive"');
    }
    return this.clientService.updateStatus(mobile, body.status as 'active' | 'inactive', body.message);
  }

  @Patch('activate/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as active' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({ type: ActivationRequestDto })
  @ApiOkResponse({ type: BufferClient })
  async markAsActive(@Param('mobile') mobile: string, @Body() body: ActivationRequestDto = {}): Promise<BufferClient> {
    return this.clientService.updateStatus(mobile, 'active', body.message);
  }

  @Patch('deactivate/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as inactive' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({ type: DeactivationRequestDto })
  @ApiOkResponse({ type: BufferClient })
  async markAsInactive(@Param('mobile') mobile: string, @Body() body: DeactivationRequestDto): Promise<BufferClient> {
    return this.clientService.markAsInactive(mobile, body.reason);
  }

  @Patch('mark-used/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as used (update lastUsed timestamp)' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({ type: MarkUsedRequestDto })
  @ApiOkResponse({ type: BufferClient })
  async markAsUsed(
    @Param('mobile') mobile: string,
    @Body() body: MarkUsedRequestDto = {}
  ): Promise<BufferClient> {
    return this.clientService.markAsUsed(mobile, body.message);
  }

  @Get('next-available/:clientId')
  @ApiOperation({ summary: 'Get next available buffer client for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get next available buffer client for', type: String })
  @ApiOkResponse({ type: BufferClient })
  async getNextAvailable(@Param('clientId') clientId: string): Promise<BufferClient | null> {
    return this.clientService.getNextAvailableBufferClient(clientId);
  }

  @Get('unused')
  @ApiOperation({ summary: "Get buffer clients that haven't been used for a specified time period" })
  @ApiQuery({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiOkResponse({ type: [BufferClient] })
  async getUnusedBufferClients(@Query('hoursAgo') hoursAgo?: number, @Query('clientId') clientId?: string): Promise<BufferClient[]> {
    return this.clientService.getUnusedBufferClients(hoursAgo || 24, clientId);
  }


  @Get(':mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ type: BufferClient })
  @ApiNotFoundResponse({ description: 'Buffer client not found.' })
  async findOne(@Param('mobile') mobile: string): Promise<BufferClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdateBufferClientDto })
  @ApiOkResponse({ type: BufferClient })
  @ApiNotFoundResponse({ description: 'Buffer client not found.' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdateBufferClientDto })
  @ApiOkResponse({ type: BufferClient })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete(':mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiOkResponse({ schema: { type: 'null' } })
  @ApiNotFoundResponse({ description: 'Buffer client not found.' })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }
}
