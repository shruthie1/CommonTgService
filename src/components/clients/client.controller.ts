import { Controller, Get, Post, Body, Param, Delete, Query, Patch, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Client } from './schemas/client.schema';
import { SearchClientDto } from './dto/search-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('Clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  /**
   * Create a new client
   */
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

  /**
   * Search for clients based on query parameters
   */
  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
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
    return this.clientService.updateClient(clientId);
  }
  
  /**
   * Get all clients with masked sensitive fields
   */
  @Get('maskedCls')
  @ApiOperation({ summary: 'Get all user data with masked fields' })
  @ApiResponse({ status: 200, description: 'All user data returned successfully.' })
  async findAllMasked(@Query() query: SearchClientDto) {
    try {
      return await this.clientService.findAllMasked(query);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get all clients
   */
  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  @ApiResponse({ status: 200, description: 'All user data returned successfully.' })
  async findAll(): Promise<Client[]> {
    try {
      return await this.clientService.findAll();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get a specific client by ID
   */
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

  /**
   * Update a specific client by ID
   */
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

  /**
   * Delete a specific client by ID
   */
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
