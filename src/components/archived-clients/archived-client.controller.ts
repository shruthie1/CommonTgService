import { Controller, Get, Post, Body, Param, Delete, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Client } from '../clients/schemas/client.schema';
import { ArchivedClientService } from './archived-client.service';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { SearchClientDto } from '../clients/dto/search-client.dto';

@ApiTags('Archived Clients')
@Controller('ArchivedClients')
export class ArchivedClientController {
  constructor(private readonly archivedclientService: ArchivedClientService) { }

  @Post()
  @ApiOperation({ summary: 'Create user data' })
  //@apiresponse({ status: 201, description: 'The user data has been successfully created.' })
  //@apiresponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createClientDto: CreateClientDto): Promise<Client> {
    return this.archivedclientService.create(createClientDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user data' })
  //@apiresponse({ status: 200, description: 'Return the searched user data.' })
  async search(@Query() query: SearchClientDto): Promise<Client[]> {
    return this.archivedclientService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user data' })
  //@apiresponse({ status: 200, description: 'Return all user data.' })
  //@apiresponse({ status: 403, description: 'Forbidden.' })
  async findAll(): Promise<Client[]> {
    return this.archivedclientService.findAll();
  }

  @Get(':mobile')
  @ApiOperation({ summary: 'Get user data by ID' })
  //@apiresponse({ status: 200, description: 'Return the user data.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async findOne(@Param('mobile') mobile: string): Promise<Client> {
    return this.archivedclientService.findOne(mobile);
  }

  @Patch(':mobile')
  @ApiOperation({ summary: 'Update user data by ID' })
  //@apiresponse({ status: 200, description: 'The user data has been successfully updated.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: Partial<Client>): Promise<Client> {
    return this.archivedclientService.update(mobile, updateClientDto);
  }

  @Delete(':mobile')
  @ApiOperation({ summary: 'Delete user data by ID' })
  //@apiresponse({ status: 200, description: 'The user data has been successfully deleted.' })
  //@apiresponse({ status: 404, description: 'User data not found.' })
  async remove(@Param('mobile') mobile: string): Promise<Client> {
    return this.archivedclientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ summary: 'Execute a custom MongoDB query' })
  //@apiresponse({ status: 200, description: 'Query executed successfully.' })
  //@apiresponse({ status: 400, description: 'Invalid query.' })
  //@apiresponse({ status: 500, description: 'Internal server error.' })
  @ApiBody({type: Object})
  async executeQuery(@Body() query: object): Promise<any> {
    try {
      return await this.archivedclientService.executeQuery(query);
    } catch (error) {
      throw error;  // You might want to handle errors more gracefully
    }
  }
}
