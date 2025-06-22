import { Controller, Get, Post, Body, Param, Delete, Query, Patch, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';

@ApiTags('Clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  @ApiResponse({ status: 201, description: 'The user data has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    try {
      return await this.clientService.create(createClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID' })
  @ApiQuery({ name: 'dbcoll', required: false, description: 'Database collection name' })
  @ApiQuery({ name: 'channelLink', required: false, description: 'Channel link' })
  @ApiQuery({ name: 'link', required: false, description: 'Client link' })
  @ApiResponse({ status: 200, description: 'Matching user data returned successfully.' })
  async search(@Query() query: SearchClientDto): Promise<Client[]> {
    try {
      return await this.clientService.search(query);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('updateClient/:clientId')
  @ApiOperation({ summary: 'Get user data by ID' })
  //@apiresponse({ status: 200, description: 'Return the user data.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async updateClient(@Param('clientId') clientId: string) {
    this.clientService.updateClient(clientId);
    return "Update client initiated";
  }

  @Get('maskedCls')
  @ApiOperation({ summary: 'Get all user data with masked fields' })
  @ApiResponse({ status: 200, description: 'All user data returned successfully.' })
  async findAllMasked() {
    try {
      return await this.clientService.findAllMasked();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  @ApiResponse({ status: 200, description: 'All user data returned successfully.' })
  async findAll() {
    try {
      return await this.clientService.findAll();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sync-npoint')
  @ApiOperation({ summary: 'Sync clients with npoint service' })
  @ApiResponse({ status: 200, description: 'Clients synchronized successfully with npoint.' })
  @ApiResponse({ status: 500, description: 'Internal server error during synchronization.' })
  async syncNpoint(): Promise<void> {
    try {
      await this.clientService.checkNpoint();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clientId')
  @ApiOperation({ summary: 'Get user data by ID' })
  @ApiResponse({ status: 200, description: 'User data returned successfully.' })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async findOne(@Param('clientId') clientId: string): Promise<Client> {
    try {
      return await this.clientService.findOne(clientId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Patch(':clientId')
  @ApiOperation({ summary: 'Update user data by ID' })
  @ApiResponse({ status: 200, description: 'The user data has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async update(@Param('clientId') clientId: string, @Body() updateClientDto: UpdateClientDto): Promise<Client> {
    try {
      return await this.clientService.update(clientId, updateClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Delete(':clientId')
  @ApiOperation({ summary: 'Delete user data by ID' })
  @ApiResponse({ status: 200, description: 'The user data has been successfully deleted.' })
  @ApiResponse({ status: 404, description: 'User data not found.' })
  async remove(@Param('clientId') clientId: string): Promise<Client> {
    try {
      return await this.clientService.remove(clientId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  // @Get('setupClient/:clientId')
  // @ApiOperation({ summary: 'SetUp Client data' })
  // //@apiresponse({ status: 200, description: 'Return the user data.' })
  // //@apiresponse({ status: 404, description: 'User data not found.' })
  // async setupClient(@Param('clientId') clientId: string, @Query() setupClientQueryDto: SetupClientQueryDto) {
  //   this.clientService.setupClient(clientId, setupClientQueryDto);
  //   return `Started Client Seup for ${clientId}`
  // }

  /**
   * Execute a custom MongoDB query
   */
  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiResponse({ status: 200, description: 'Query executed successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid query.' })
  @ApiBody({ schema: { properties: { query: { type: 'object' }, sort: { type: 'object' }, limit: { type: 'number' }, skip: { type: 'number' } } } })
  async executeQuery(@Body() requestBody: any): Promise<any> {
    const { query, sort, limit, skip } = requestBody;
    try {
      return await this.clientService.executeQuery(query, sort, limit, skip);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Add a mobile number to the promoteMobile array for a specific client
   */
  @Patch(':clientId/promoteMobile/add')
  @ApiOperation({ summary: 'Add a mobile number to the promoteMobile array for a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } })
  @ApiResponse({ status: 200, description: 'Mobile number added successfully.' })
  @ApiResponse({ status: 404, description: 'Client not found.' })
  async addPromoteMobile(@Param('clientId') clientId: string, @Body('mobileNumber') mobileNumber: string) {
    try {
      return await this.clientService.addPromoteMobile(clientId, mobileNumber);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Remove a mobile number from the promoteMobile array for a specific client
   */
  @Patch(':clientId/promoteMobile/remove')
  @ApiOperation({ summary: 'Remove a mobile number from the promoteMobile array for a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } })
  @ApiResponse({ status: 200, description: 'Mobile number removed successfully.' })
  @ApiResponse({ status: 404, description: 'Client not found.' })
  async removePromoteMobile(@Param('clientId') clientId: string, @Body('mobileNumber') mobileNumber: string) {
    try {
      return await this.clientService.removePromoteMobile(clientId, mobileNumber);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
