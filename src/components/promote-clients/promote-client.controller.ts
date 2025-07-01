import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PromoteClientService } from './promote-client.service';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { SearchPromoteClientDto } from './dto/search-promote-client.dto';
import { PromoteClient } from './schemas/promote-client.schema';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';

@ApiTags('Promote Clients')
@Controller('promoteclients')
export class PromoteClientController {
  constructor(private readonly clientService: PromoteClientService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  async create(@Body() createClientDto: CreatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  @ApiQuery({ name: 'mobile', required: false, description: 'Mobile number' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name' })
  @ApiQuery({ name: 'lastName', required: false, description: 'Last name' })
  @ApiQuery({ name: 'username', required: false, description: 'Username' })
  async search(@Query() query: SearchPromoteClientDto): Promise<PromoteClient[]> {
    return this.clientService.search(query);
  }

  @Get('joinChannelsForPromoteClients')
  @ApiOperation({ summary: 'Join Channels for PromoteClients' })
  async joinChannelsforPromoteClients(): Promise<string> {
    return this.clientService.joinchannelForPromoteClients();
  }

  @Get('checkPromoteClients')
  @ApiOperation({ summary: 'Check Promote Clients' })
  async checkpromoteClients(): Promise<string> {
    // Fire-and-forget pattern for long-running operations
    this.clientService.checkPromoteClients().catch(error => {
      console.error('Error in checkPromoteClients:', error);
    });
    return "initiated Checking"
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
  async addNewUserstoPromoteClients(@Body() body: { 
    goodIds: string[], 
    badIds: string[], 
    clientsNeedingPromoteClients?: string[] 
  }): Promise<string> {
    // Validate input parameters
    if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
      throw new BadRequestException('goodIds and badIds must be arrays');
    }
    
    if (body.clientsNeedingPromoteClients && !Array.isArray(body.clientsNeedingPromoteClients)) {
      throw new BadRequestException('clientsNeedingPromoteClients must be an array');
    }

    // Fire-and-forget pattern for long-running operations
    this.clientService.addNewUserstoPromoteClients(
      body.badIds, 
      body.goodIds, 
      body.clientsNeedingPromoteClients || [],
      undefined // No promoteClientsPerClient map available in controller
    ).catch(error => {
      console.error('Error in addNewUserstoPromoteClients:', error);
    });
    return "initiated Checking"
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  async findAll(): Promise<PromoteClient[]> {
    return this.clientService.findAll();
  }

  @Get('SetAsPromoteClient/:mobile')
  @ApiOperation({ summary: 'Set as Promote Client' })
  @ApiParam({ name: 'mobile', description: 'User mobile number', type: String })
  async setAsPromoteClient(
    @Param('mobile') mobile: string,
  ) {
    return await this.clientService.setAsPromoteClient(mobile);
  }

  @Get(':mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  async findOne(@Param('mobile') mobile: string): Promise<PromoteClient> {
    return this.clientService.findOne(mobile);
  }

  @Patch(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.update(mobile, updateClientDto);
  }

  @Put(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  async createdOrupdate(@Param('mobile') mobile: string, @Body() updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
    return this.clientService.createOrUpdate(mobile, updateClientDto);
  }

  @Delete(':mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  async remove(@Param('mobile') mobile: string): Promise<void> {
    return this.clientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  @ApiBody({ type: Object })
  async executeQuery(@Body() query: object): Promise<any> {
    try {
      return await this.clientService.executeQuery(query);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }

  @Get('distribution')
  @ApiOperation({ summary: 'Get promote client distribution per client' })
  async getPromoteClientDistribution(): Promise<any> {
    return this.clientService.getPromoteClientDistribution();
  }

}
