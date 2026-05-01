import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiCreatedResponse, ApiOkResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ExecuteClientQueryDto } from './dto/execute-client-query.dto';
import { CloudflareCache } from '../../decorators';
import { CloudflareCacheInterceptor } from '../../interceptors';

@ApiTags('Clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) { }

  private sanitizeQuery<T extends object>(query: T): T {
    const { apiKey: _apiKey, ...rest } = query as T & { apiKey?: unknown };
    return rest as T;
  }

  @Post()
  @ApiOperation({ summary: 'Create a client' })
  @ApiBody({ type: CreateClientDto })
  @ApiCreatedResponse({ type: Client })
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    return await this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search clients' })
  @ApiOkResponse({ type: [Client] })
  async search(@Query() query: SearchClientDto): Promise<Client[]> {
    return await this.clientService.search(this.sanitizeQuery(query));
  }

  @Get('updateClient/:clientId')
  @ApiOperation({ summary: 'Refresh client profile on Telegram' })
  @ApiParam({ name: 'clientId' })
  async updateClient(@Param('clientId') clientId: string) {
    const updated = await this.clientService.updateClient(clientId, '', false, true);
    return updated ? 'Update client completed' : 'Update client skipped';
  }

  @Get('maskedCls')
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get all clients (sensitive fields masked)' })
  @ApiOkResponse({ type: [Client] })
  async findAllMasked() {
    return await this.clientService.findAllMasked();
  }

  @Get('maskedCls/:clientId')
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get client by ID (sensitive fields masked)' })
  @ApiParam({ name: 'clientId' })
  @ApiOkResponse({ type: Client })
  @ApiNotFoundResponse({ description: 'Client not found.' })
  async findOneMasked(@Param('clientId') clientId: string) {
    return await this.clientService.findOneMasked(clientId);
  }

  @Get()
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get all clients' })
  @ApiOkResponse({ type: [Client] })
  async findAll() {
    return await this.clientService.findAll();
  }

  @Get(':clientId/persona-pool')
  @ApiOperation({ summary: 'Get persona pool for a client' })
  @ApiParam({ name: 'clientId' })
  async getPersonaPool(@Param('clientId') clientId: string) {
    return await this.clientService.getPersonaPool(clientId);
  }

  @Get(':clientId/existing-assignments')
  @ApiOperation({ summary: 'Get existing persona assignments' })
  @ApiParam({ name: 'clientId' })
  @ApiQuery({ name: 'scope', required: false, enum: ['all', 'buffer', 'activeClient'] })
  async getExistingAssignments(
    @Param('clientId') clientId: string,
    @Query('scope') scope: 'all' | 'buffer' | 'activeClient' = 'all',
  ) {
    return await this.clientService.getExistingAssignments(clientId, scope);
  }

  @Get(':clientId')
  @ApiOperation({ summary: 'Get client by ID' })
  @ApiParam({ name: 'clientId' })
  @ApiOkResponse({ type: Client })
  @ApiNotFoundResponse({ description: 'Client not found.' })
  async findOne(@Param('clientId') clientId: string): Promise<Client> {
    return await this.clientService.findOne(clientId);
  }

  @Patch(':clientId')
  @ApiOperation({ summary: 'Update client' })
  @ApiParam({ name: 'clientId' })
  @ApiBody({ type: UpdateClientDto })
  @ApiOkResponse({ type: Client })
  @ApiNotFoundResponse({ description: 'Client not found.' })
  async update(@Param('clientId') clientId: string, @Body() updateClientDto: UpdateClientDto): Promise<Client> {
    return await this.clientService.update(clientId, updateClientDto);
  }

  @Delete(':clientId')
  @ApiOperation({ summary: 'Delete client' })
  @ApiParam({ name: 'clientId' })
  @ApiOkResponse({ type: Client })
  @ApiNotFoundResponse({ description: 'Client not found.' })
  async remove(@Param('clientId') clientId: string): Promise<Client> {
    return await this.clientService.remove(clientId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute custom MongoDB query' })
  @ApiBody({ type: ExecuteClientQueryDto })
  @ApiOkResponse({ type: [Client] })
  async executeQuery(@Body() requestBody: ExecuteClientQueryDto): Promise<Client[]> {
    const { query, sort, limit, skip } = requestBody;
    return await this.clientService.executeQuery(query, sort, limit, skip);
  }

}
