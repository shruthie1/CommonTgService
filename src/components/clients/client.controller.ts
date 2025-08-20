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
  constructor(private readonly clientService: ClientService) {}

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

  @Get('sync-npoint')
  @ApiOperation({ summary: 'Sync clients with npoint service' })
  @ApiResponse({ description: 'Clients synchronized successfully with npoint.' })
  async syncNpoint(): Promise<void> {
    await this.clientService.checkNpoint();
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

  @Get(':clientId/ip-info')
  @ApiOperation({ summary: 'Get IP assignment information for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({
    description: 'IP information retrieved successfully',
    type: Object,
    schema: {
      properties: {
        clientId: { type: 'string' },
        mobiles: {
          type: 'object',
          properties: {
            mainMobile: {
              type: 'object',
              properties: {
                mobile: { type: 'string' },
                hasIp: { type: 'boolean' },
                ipAddress: { type: 'string' },
              },
            },
            promoteMobiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  mobile: { type: 'string' },
                  hasIp: { type: 'boolean' },
                  ipAddress: { type: 'string' },
                },
              },
            },
          },
        },
        needingAssignment: {
          type: 'object',
          properties: {
            mainMobile: { type: 'string' },
            promoteMobiles: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  async getClientIpInfo(@Param('clientId') clientId: string): Promise<{
    clientId: string;
    mobiles: {
      mainMobile?: { mobile: string; hasIp: boolean; ipAddress?: string };
      promoteMobiles: { mobile: string; hasIp: boolean; ipAddress?: string }[];
    };
    needingAssignment: {
      mainMobile?: string;
      promoteMobiles: string[];
    };
  }> {
    const client = await this.clientService.findOne(clientId);
    const needingAssignment = await this.clientService.getMobilesNeedingIpAssignment(clientId);

    const result = {
      clientId,
      mobiles: {
        mainMobile: undefined as any,
        promoteMobiles: [] as any[],
      },
      needingAssignment,
    };

    if (client.mobile) {
      const hasIp = await this.clientService.hasMobileAssignedIp(client.mobile);
      const ipAddress = hasIp ? await this.clientService.getIpForMobile(client.mobile) : undefined;
      result.mobiles.mainMobile = {
        mobile: client.mobile,
        hasIp,
        ipAddress: ipAddress || undefined,
      };
    }

    const promoteMobiles = await this.clientService.getPromoteMobiles(clientId);
    for (const mobile of promoteMobiles) {
      const hasIp = await this.clientService.hasMobileAssignedIp(mobile);
      const ipAddress = hasIp ? await this.clientService.getIpForMobile(mobile) : undefined;
      result.mobiles.promoteMobiles.push({
        mobile,
        hasIp,
        ipAddress: ipAddress || undefined,
      });
    }

    return result;
  }

  @Get('mobile/:mobile/ip')
  @ApiOperation({ summary: 'Get IP address for a specific mobile number' })
  @ApiParam({ name: 'mobile', description: 'Mobile number' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID for context' })
  @ApiResponse({
    description: 'IP address retrieved successfully',
    type: Object,
    schema: {
      properties: {
        mobile: { type: 'string' },
        ipAddress: { type: 'string', nullable: true },
        hasAssignment: { type: 'boolean' },
      },
    },
  })
  async getIpForMobile(
    @Param('mobile') mobile: string,
    @Query('clientId') clientId?: string,
  ): Promise<{ mobile: string; ipAddress: string | null; hasAssignment: boolean }> {
    const ipAddress = await this.clientService.getIpForMobile(mobile, clientId);
    return {
      mobile,
      ipAddress,
      hasAssignment: ipAddress !== null,
    };
  }

  @Post(':clientId/auto-assign-ips')
  @ApiOperation({ summary: 'Auto-assign IPs to all client mobile numbers (Simplified System)' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({
    description: 'IPs assigned successfully',
    type: Object,
    schema: {
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: { type: 'object' },
      },
    },
  })
  async autoAssignIpsToClient(@Param('clientId') clientId: string): Promise<any> {
    const result = await this.clientService.autoAssignIpsToClient(clientId);
    return {
      success: true,
      message: `Auto-assigned IPs to ${result.summary.assigned}/${result.summary.totalMobiles} mobiles`,
      data: result,
    };
  }

  @Get(':clientId/mobiles-needing-ips')
  @ApiOperation({ summary: 'Get mobile numbers that need IP assignment' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({
    description: 'Mobile numbers needing IP assignment',
    type: Object,
    schema: {
      properties: {
        clientId: { type: 'string' },
        mobilesNeedingIps: {
          type: 'object',
          properties: {
            mainMobile: { type: 'string' },
            promoteMobiles: { type: 'array', items: { type: 'string' } },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalNeedingAssignment: { type: 'number' },
            mainMobileNeedsIp: { type: 'boolean' },
            promoteMobilesNeedingIp: { type: 'number' },
          },
        },
      },
    },
  })
  async getMobilesNeedingIpAssignment(@Param('clientId') clientId: string): Promise<{
    clientId: string;
    mobilesNeedingIps: {
      mainMobile?: string;
      promoteMobiles: string[];
    };
    summary: {
      totalNeedingAssignment: number;
      mainMobileNeedsIp: boolean;
      promoteMobilesNeedingIp: number;
    };
  }> {
    const mobilesNeedingIps = await this.clientService.getMobilesNeedingIpAssignment(clientId);
    const totalNeedingAssignment = (mobilesNeedingIps.mainMobile ? 1 : 0) + mobilesNeedingIps.promoteMobiles.length;

    return {
      clientId,
      mobilesNeedingIps,
      summary: {
        totalNeedingAssignment,
        mainMobileNeedsIp: !!mobilesNeedingIps.mainMobile,
        promoteMobilesNeedingIp: mobilesNeedingIps.promoteMobiles.length,
      },
    };
  }

  @Delete('mobile/:mobile/ip')
  @ApiOperation({ summary: 'Release IP from a mobile number' })
  @ApiParam({ name: 'mobile', description: 'Mobile number to release IP from' })
  @ApiResponse({
    description: 'IP released successfully',
    type: Object,
    schema: {
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async releaseIpFromMobile(@Param('mobile') mobile: string): Promise<{ success: boolean; message: string }> {
    return await this.clientService.releaseIpFromMobile(mobile);
  }
}