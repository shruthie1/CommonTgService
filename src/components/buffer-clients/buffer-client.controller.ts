import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { BufferClientService } from './buffer-client.service';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';

@ApiTags('Buffer Clients')
@Controller('bufferclients')
export class BufferClientController {
  constructor(private readonly clientService: BufferClientService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  @ApiBody({ type: CreateBufferClientDto })
  @ApiResponse({ type: BufferClient })
  async create(@Body() createClientDto: CreateBufferClientDto): Promise<BufferClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search buffer client data' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  @ApiQuery({ name: 'name', required: false, description: 'Name' })
  @ApiQuery({ name: 'channelLink', required: false, description: 'Channel link' })
  @ApiQuery({ name: 'repl', required: false, description: 'Repl link' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiResponse({ type: [BufferClient] })
  async search(@Query() query: SearchBufferClientDto): Promise<BufferClient[]> {
    return this.clientService.search(query);
  }

  @Get('updateInfo')
  @ApiOperation({ summary: 'Update promote Clients Info' })
  @ApiResponse({ type: String })
  async updateInfo(): Promise<string> {
    // Fire-and-forget pattern for long-running operations
    this.clientService.updateInfo();
    return 'initiated Checking';
  }

  @Get('joinChannelsForBufferClients')
  @ApiOperation({ summary: 'Join Channels for BufferClients' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiResponse({ type: String })
  async joinChannelsforBufferClients(@Query('clientId') clientId?: string): Promise<string> {
    return this.clientService.joinchannelForBufferClients(true, clientId);
  }

  @Get('checkBufferClients')
  @ApiOperation({ summary: 'Check Buffer Clients' })
  @ApiResponse({ type: String })
  async checkbufferClients(): Promise<string> {
    this.clientService.checkBufferClients();
    return 'initiated Checking';
  }

  @Post('addNewUserstoBufferClients')
  @ApiOperation({ summary: 'Add New Users to Buffer Clients' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        goodIds: { type: 'array', items: { type: 'string' } },
        badIds: { type: 'array', items: { type: 'string' } },
        clientsNeedingBufferClients: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  @ApiResponse({ type: String })
  async addNewUserstoBufferClients(@Body() body: {
    goodIds: string[];
    badIds: string[];
    clientsNeedingBufferClients?: string[];
  }): Promise<string> {
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
  @ApiOperation({ summary: 'Get all buffer client data' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)' })
  @ApiResponse({ type: [BufferClient] })
  async findAll(@Query('status') status?: string): Promise<BufferClient[]> {
    return this.clientService.findAll(status as 'active' | 'inactive');
  }

  @Post('SetAsBufferClient/:mobile/:clientId')
  @ApiOperation({ summary: 'Set as Buffer Client' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiParam({ name: 'clientId', description: 'Client ID to assign buffer client to', type: String })
  @ApiResponse({ type: String })
  async setAsBufferClient(@Param('mobile') mobile: string, @Param('clientId') clientId: string) {
    return this.clientService.setAsBufferClient(mobile, clientId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({ type: Object })
  @ApiResponse({ type: Object })
  async executeQuery(@Body() query: object): Promise<any> {
    return this.clientService.executeQuery(query);
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get buffer client distribution per client' })
  @ApiResponse({ type: Object })
  async getBufferClientDistribution(): Promise<any> {
    return this.clientService.getBufferClientDistribution();
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Get buffer clients by client ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get buffer clients for', type: String })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (active/inactive)', type: String })
  @ApiResponse({ type: [BufferClient] })
  async getBufferClientsByClientId(@Param('clientId') clientId: string, @Query('status') status?: string): Promise<BufferClient[]> {
    return this.clientService.getBufferClientsByClientId(clientId, status);
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get buffer clients by status' })
  @ApiParam({ name: 'status', description: 'Status to filter by (active/inactive)', type: String })
  @ApiResponse({ type: [BufferClient] })
  async getBufferClientsByStatus(@Param('status') status: string): Promise<BufferClient[]> {
    return this.clientService.findAll(status as 'active' | 'inactive');
  }

  @Patch('status/:mobile')
  @ApiOperation({ summary: 'Update status of a buffer client' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
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
  @ApiResponse({ type: BufferClient })
  async updateStatus(@Param('mobile') mobile: string, @Body() body: { status: string; message?: string }): Promise<BufferClient> {
    return this.clientService.updateStatus(mobile, body.status, body.message);
  }

  @Patch('activate/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as active' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Activation message (optional)' }
      }
    }
  })
  @ApiResponse({ type: BufferClient })
  async markAsActive(@Param('mobile') mobile: string, @Body() body: { message?: string } = {}): Promise<BufferClient> {
    return this.clientService.updateStatus(mobile, 'active', body.message);
  }

  @Patch('deactivate/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as inactive' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for deactivation' }
      },
      required: ['reason']
    }
  })
  @ApiResponse({ type: BufferClient })
  async markAsInactive(@Param('mobile') mobile: string, @Body() body: { reason: string }): Promise<BufferClient> {
    return this.clientService.markAsInactive(mobile, body.reason);
  }

  @Patch('mark-used/:mobile')
  @ApiOperation({ summary: 'Mark a buffer client as used (update lastUsed timestamp)' })
  @ApiParam({ name: 'mobile', description: 'Mobile number of the buffer client', type: String })
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
  ): Promise<BufferClient> {
    return this.clientService.markAsUsed(mobile, body.message);
  }

  @Get('next-available/:clientId')
  @ApiOperation({ summary: 'Get next available buffer client for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID to get next available buffer client for', type: String })
  @ApiResponse({ type: BufferClient })
  async getNextAvailable(@Param('clientId') clientId: string): Promise<BufferClient | null> {
    return this.clientService.getNextAvailableBufferClient(clientId);
  }

  @Get('unused')
  @ApiOperation({ summary: "Get buffer clients that haven't been used for a specified time period" })
  @ApiQuery({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String })
  @ApiResponse({ type: [BufferClient] })
  async getUnusedBufferClients(@Query('hoursAgo') hoursAgo?: number, @Query('clientId') clientId?: string): Promise<BufferClient[]> {
    return this.clientService.getUnusedBufferClients(hoursAgo || 24, clientId);
  }


  @Get(':mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: BufferClient })
  async findOne(@Param('mobile') mobile: string): Promise<BufferClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdateBufferClientDto })
  @ApiResponse({ type: BufferClient })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiBody({ type: UpdateBufferClientDto })
  @ApiResponse({ type: BufferClient })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete(':mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: null })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }
}