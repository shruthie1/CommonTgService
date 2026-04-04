import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { EnhancedSearchClientDto } from './dto/enhanced-search-client.dto';
import { ExecuteClientQueryDto } from './dto/execute-client-query.dto';
import { PromoteMobileAssignmentDto } from './dto/promote-mobile-assignment.dto';
import { PromoteMobileSearchQueryDto } from './dto/promote-mobile-search-query.dto';
import { EnhancedClientSearchResponseDto, PromoteMobileSearchResponseDto } from './dto/client-response.dto';
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
    return await this.clientService.search(this.sanitizeQuery(query));
  }

  @Get('search/promote-mobile')
  @ApiOperation({ summary: 'Search clients by promote mobile numbers' })
  @ApiQuery({ name: 'mobile', required: true, description: 'Promote mobile number to search for' })
  @ApiResponse({
    description: 'Clients with matching promote mobiles returned successfully.',
    type: PromoteMobileSearchResponseDto,
  })
  async searchByPromoteMobile(@Query() query: PromoteMobileSearchQueryDto): Promise<PromoteMobileSearchResponseDto> {
    const result = await this.clientService.enhancedSearch({ promoteMobileNumber: query.mobile });
    return {
      clients: result.clients,
      matches: result.promoteMobileMatches || [],
      searchedMobile: query.mobile,
    };
  }

  @Get('search/enhanced')
  @ApiOperation({ summary: 'Enhanced search with promote mobile support' })
  @ApiQuery({ name: 'promoteMobileNumber', required: false, description: 'Promote mobile number to search for' })
  @ApiQuery({ name: 'hasPromoteMobiles', required: false, description: 'Filter by clients that have promote mobiles (true/false)' })
  @ApiResponse({
    description: 'Enhanced search results with promote mobile context.',
    type: EnhancedClientSearchResponseDto,
  })
  async enhancedSearch(@Query() query: EnhancedSearchClientDto): Promise<EnhancedClientSearchResponseDto> {
    const result = await this.clientService.enhancedSearch(this.sanitizeQuery(query));
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

  @Get(':clientId/persona-pool')
  @ApiOperation({ summary: 'Get persona pool for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  async getPersonaPool(@Param('clientId') clientId: string) {
    return await this.clientService.getPersonaPool(clientId);
  }

  @Get(':clientId/existing-assignments')
  @ApiOperation({ summary: 'Get existing persona assignments for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiQuery({ name: 'scope', required: false, enum: ['all', 'buffer', 'promote', 'activeClient'] })
  async getExistingAssignments(
    @Param('clientId') clientId: string,
    @Query('scope') scope: 'all' | 'buffer' | 'promote' | 'activeClient' = 'all',
  ) {
    return await this.clientService.getExistingAssignments(clientId, scope);
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
  @ApiBody({ type: ExecuteClientQueryDto })
  @ApiResponse({ description: 'Query executed successfully.', type: [Client] })
  async executeQuery(@Body() requestBody: ExecuteClientQueryDto): Promise<Client[]> {
    const { query, sort, limit, skip } = requestBody;
    return await this.clientService.executeQuery(query, sort, limit, skip);
  }

  @Patch(':clientId/promoteMobile/add')
  @ApiOperation({ summary: 'Add a mobile number as a promote mobile for a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ type: PromoteMobileAssignmentDto })
  @ApiResponse({ description: 'Mobile number assigned as promote mobile successfully.', type: Client })
  async addPromoteMobile(@Param('clientId') clientId: string, @Body() body: PromoteMobileAssignmentDto): Promise<Client> {
    return this.clientService.addPromoteMobile(clientId, body.mobileNumber);
  }

  @Patch(':clientId/promoteMobile/remove')
  @ApiOperation({ summary: 'Remove a promote mobile assignment from a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ type: PromoteMobileAssignmentDto })
  @ApiResponse({ description: 'Promote mobile assignment removed successfully.', type: Client })
  async removePromoteMobile(@Param('clientId') clientId: string, @Body() body: PromoteMobileAssignmentDto) {
    return await this.clientService.removePromoteMobile(clientId, body.mobileNumber);
  }
}
