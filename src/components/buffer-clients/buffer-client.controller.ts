import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { BufferClientService } from './buffer-client.service';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';

@ApiTags('Buffer Clients')
@Controller('bufferclients')
export class BufferClientController {
  constructor(private readonly clientService: BufferClientService) {}

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  @ApiBody({ type: CreateBufferClientDto })
  @ApiResponse({ type: BufferClient })
  async create(@Body() createClientDto: CreateBufferClientDto): Promise<BufferClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
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
  @ApiResponse({ type: String })
  async joinChannelsforBufferClients(): Promise<string> {
    return this.clientService.joinchannelForBufferClients();
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
  @ApiBody({ type: Object, schema: { type: 'object', properties: { goodIds: { type: 'array', items: { type: 'string' } }, badIds: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ type: String })
  async addNewUserstoBufferClients(@Body() body: { goodIds: string[]; badIds: string[] }): Promise<string> {
    this.clientService.addNewUserstoBufferClients(body.badIds, body.goodIds);
    return 'initiated Checking';
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  @ApiResponse({ type: [BufferClient] })
  async findAll(): Promise<BufferClient[]> {
    return this.clientService.findAll();
  }

  @Get('SetAsBufferClient/:mobile')
  @ApiOperation({ summary: 'Set as Buffer Client' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  @ApiResponse({ type: BufferClient })
  async setAsBufferClient(@Param('mobile') mobile: string) {
    return this.clientService.setAsBufferClient(mobile);
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

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({ type: Object })
  @ApiResponse({ type: Object })
  async executeQuery(@Body() query: object): Promise<any> {
    return this.clientService.executeQuery(query);
  }
}