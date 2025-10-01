import { Controller, Get, Post, Body, Param, Delete, Query, Patch, HttpException, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { CloudflareCache } from '../../decorators';
import { CloudflareCacheInterceptor } from '../../interceptors';

@ApiTags('Clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({ description: 'The user data has been successfully created.', type: Client })
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    return await this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID' })
  @ApiQuery({ name: 'dbcoll', required: false, description: 'Database collection name' })
  @ApiQuery({ name: 'channelLink', required: false, description: 'Channel link' })
  @ApiQuery({ name: 'link', required: false, description: 'Client link' })
  @ApiResponse({ description: 'Matching user data returned successfully.', type: [Client] })
  async search(@Query() query: SearchClientDto): Promise<Client[]> {
    return await this.clientService.search(query);
  }

  @Get('search/promote-mobile')
  @ApiOperation({ summary: 'Search clients by promote mobile numbers' })
  @ApiQuery({ name: 'mobile', required: true, description: 'Promote mobile number to search for' })
  @ApiResponse({
    description: 'Clients with matching promote mobiles returned successfully.',
    type: Object,
    schema: {
      properties: {
        clients: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
        matches: { type: 'array', items: { type: 'object', properties: { clientId: { type: 'string' }, mobile: { type: 'string' } } } },
        searchedMobile: { type: 'string' },
      },
    },
  })
  async searchByPromoteMobile(@Query('mobile') mobile: string): Promise<{
    clients: Client[];
    matches: Array<{ clientId: string; mobile: string }>;
    searchedMobile: string;
  }> {
    const result = await this.clientService.enhancedSearch({ promoteMobileNumber: mobile });
    return {
      clients: result.clients,
      matches: result.promoteMobileMatches || [],
      searchedMobile: mobile,
    };
  }

  @Get('search/enhanced')
  @ApiOperation({ summary: 'Enhanced search with promote mobile support' })
  @ApiQuery({ name: 'promoteMobileNumber', required: false, description: 'Promote mobile number to search for' })
  @ApiQuery({ name: 'hasPromoteMobiles', required: false, description: 'Filter by clients that have promote mobiles (true/false)' })
  @ApiResponse({
    description: 'Enhanced search results with promote mobile context.',
    type: Object,
    schema: {
      properties: {
        clients: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
        searchType: { type: 'string' },
        promoteMobileMatches: { type: 'array', items: { type: 'object', properties: { clientId: { type: 'string' }, mobile: { type: 'string' } } } },
        totalResults: { type: 'number' },
      },
    },
  })
  async enhancedSearch(@Query() query: any): Promise<{
    clients: Client[];
    searchType: string;
    promoteMobileMatches?: Array<{ clientId: string; mobile: string }>;
    totalResults: number;
  }> {
    const result = await this.clientService.enhancedSearch(query);
    return {
      clients: result.clients,
      searchType: result.searchType,
      promoteMobileMatches: result.promoteMobileMatches,
      totalResults: result.clients.length,
    };
  }

  @Get('updateClient/:clientId')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ description: 'Return the user data.', type: String })
  async updateClient(@Param('clientId') clientId: string) {
    this.clientService.updateClient(clientId);
    return 'Update client initiated';
  }

  @Get('maskedCls')
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get all user data with masked fields' })
  @ApiResponse({ description: 'All user data returned successfully.', type: [Client] })
  async findAllMasked() {
    return await this.clientService.findAllMasked();
  }

  @Get('maskedCls/:clientId')
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get user data with masked fields by ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ description: 'User data returned successfully.', type: Client })
  async findOneMasked(@Param('clientId') clientId: string) {
    return await this.clientService.findOneMasked(clientId);
  }

  @Get()
  @UseInterceptors(CloudflareCacheInterceptor)
  @CloudflareCache(3600, 60)
  @ApiOperation({ summary: 'Get all user data' })
  @ApiResponse({ description: 'All user data returned successfully.', type: [Client] })
  async findAll() {
    return await this.clientService.findAll();
  }

  @Get(':clientId')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ description: 'User data returned successfully.', type: Client })
  async findOne(@Param('clientId') clientId: string): Promise<Client> {
    return await this.clientService.findOne(clientId);
  }

  @Patch(':clientId')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiBody({ type: UpdateClientDto })
  @ApiResponse({ description: 'The user data has been successfully updated.', type: Client })
  async update(@Param('clientId') clientId: string, @Body() updateClientDto: UpdateClientDto): Promise<Client> {
    return await this.clientService.update(clientId, updateClientDto);
  }

  @Delete(':clientId')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ description: 'The user data has been successfully deleted.', type: Client })
  async remove(@Param('clientId') clientId: string): Promise<Client> {
    return await this.clientService.remove(clientId);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({
    schema: {
      properties: {
        query: { type: 'object' },
        sort: { type: 'object' },
        limit: { type: 'number' },
        skip: { type: 'number' },
      },
    },
  })
  @ApiResponse({ description: 'Query executed successfully.' })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    const { query, sort, limit, skip } = requestBody;
    return await this.clientService.executeQuery(query, sort, limit, skip);
  }

  @Patch(':clientId/promoteMobile/add')
  @ApiOperation({ summary: 'Add a mobile number as a promote mobile for a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({
    schema: {
      properties: {
        mobileNumber: { type: 'string', example: '916265240911' },
      },
    },
  })
  @ApiResponse({ description: 'Mobile number assigned as promote mobile successfully.', type: Client })
  async addPromoteMobile(@Param('clientId') clientId: string, @Body() body: { mobileNumber: string }): Promise<Client> {
    return this.clientService.addPromoteMobile(clientId, body.mobileNumber);
  }

  @Patch(':clientId/promoteMobile/remove')
  @ApiOperation({ summary: 'Remove a promote mobile assignment from a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({
    schema: {
      properties: {
        mobileNumber: { type: 'string', example: '916265240911' },
      },
    },
  })
  @ApiResponse({ description: 'Promote mobile assignment removed successfully.', type: Client })
  async removePromoteMobile(@Param('clientId') clientId: string, @Body() body: { mobileNumber: string }) {
    return await this.clientService.removePromoteMobile(clientId, body.mobileNumber);
  }
}