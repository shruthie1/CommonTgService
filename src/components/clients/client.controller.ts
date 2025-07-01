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

  @Get('search/promote-mobile')
  @ApiOperation({ summary: 'Search clients by promote mobile numbers' })
  @ApiQuery({ name: 'mobile', required: true, description: 'Promote mobile number to search for' })
  @ApiResponse({ status: 200, description: 'Clients with matching promote mobiles returned successfully.' })
  async searchByPromoteMobile(@Query('mobile') mobile: string): Promise<{
    clients: Client[];
    matches: Array<{ clientId: string; mobile: string }>;
    searchedMobile: string;
  }> {
    try {
      const result = await this.clientService.enhancedSearch({ promoteMobileNumber: mobile });
      return {
        clients: result.clients,
        matches: result.promoteMobileMatches || [],
        searchedMobile: mobile
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('search/enhanced')
  @ApiOperation({ summary: 'Enhanced search with promote mobile support' })
  @ApiQuery({ name: 'promoteMobileNumber', required: false, description: 'Promote mobile number to search for' })
  @ApiQuery({ name: 'hasPromoteMobiles', required: false, description: 'Filter by clients that have promote mobiles (true/false)' })
  @ApiResponse({ status: 200, description: 'Enhanced search results with promote mobile context.' })
  async enhancedSearch(@Query() query: any): Promise<{
    clients: Client[];
    searchType: string;
    promoteMobileMatches?: Array<{ clientId: string; mobile: string }>;
    totalResults: number;
  }> {
    try {
      const result = await this.clientService.enhancedSearch(query);
      return {
        clients: result.clients,
        searchType: result.searchType,
        promoteMobileMatches: result.promoteMobileMatches,
        totalResults: result.clients.length
      };
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
   * Add a mobile number as a promote mobile for a specific client
   */
  @Patch(':clientId/promoteMobile/add')
  @ApiOperation({ summary: 'Add a mobile number as a promote mobile for a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } })
  @ApiResponse({ status: 200, description: 'Mobile number assigned as promote mobile successfully.' })
  @ApiResponse({ status: 404, description: 'Client not found.' })
  async addPromoteMobile(@Param('clientId') clientId: string, @Body() body: { mobileNumber: string }): Promise<Client> {
    return this.clientService.addPromoteMobile(clientId, body.mobileNumber);
  }

  /**
   * Remove a promote mobile assignment from a specific client
   */
  @Patch(':clientId/promoteMobile/remove')
  @ApiOperation({ summary: 'Remove a promote mobile assignment from a specific client' })
  @ApiParam({ name: 'clientId', description: 'The unique identifier of the client' })
  @ApiBody({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } })
  @ApiResponse({ status: 200, description: 'Promote mobile assignment removed successfully.' })
  @ApiResponse({ status: 404, description: 'Client not found.' })
  async removePromoteMobile(@Param('clientId') clientId: string, @Body() body: { mobileNumber: string }) {
    try {
      return await this.clientService.removePromoteMobile(clientId, body.mobileNumber);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  // ==================== IP MANAGEMENT INTEGRATION ====================

  @Get(':clientId/ip-info')
  @ApiOperation({ summary: 'Get IP assignment information for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'IP information retrieved successfully' })
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
      try {
          const client = await this.clientService.findOne(clientId);
          const needingAssignment = await this.clientService.getMobilesNeedingIpAssignment(clientId);
          
          const result = {
              clientId,
              mobiles: {
                  mainMobile: undefined as any,
                  promoteMobiles: [] as any[]
              },
              needingAssignment
          };

          // Get main mobile info
          if (client.mobile) {
              const hasIp = await this.clientService.hasMobileAssignedIp(client.mobile);
              const ipAddress = hasIp ? await this.clientService.getIpForMobile(client.mobile) : undefined;
              result.mobiles.mainMobile = {
                  mobile: client.mobile,
                  hasIp,
                  ipAddress: ipAddress || undefined
              };
          }

          // Get promote mobiles info from PromoteClient collection
          const promoteMobiles = await this.clientService.getPromoteMobiles(clientId);
          for (const mobile of promoteMobiles) {
              const hasIp = await this.clientService.hasMobileAssignedIp(mobile);
              const ipAddress = hasIp ? await this.clientService.getIpForMobile(mobile) : undefined;
              result.mobiles.promoteMobiles.push({
                  mobile,
                  hasIp,
                  ipAddress: ipAddress || undefined
              });
          }

          return result;
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
  }

  @Get('mobile/:mobile/ip')
  @ApiOperation({ summary: 'Get IP address for a specific mobile number' })
  @ApiParam({ name: 'mobile', description: 'Mobile number' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Client ID for context' })
  @ApiResponse({ status: 200, description: 'IP address retrieved successfully' })
  async getIpForMobile(
      @Param('mobile') mobile: string,
      @Query('clientId') clientId?: string
  ): Promise<{ mobile: string; ipAddress: string | null; hasAssignment: boolean }> {
      try {
          const ipAddress = await this.clientService.getIpForMobile(mobile, clientId);
          return {
              mobile,
              ipAddress,
              hasAssignment: ipAddress !== null
          };
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
  }

  // ==================== IP MANAGEMENT ENDPOINTS ====================

  @Post(':clientId/auto-assign-ips')
  @ApiOperation({ summary: 'Auto-assign IPs to all client mobile numbers (Simplified System)' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'IPs assigned successfully' })
  @ApiResponse({ status: 400, description: 'Assignment failed' })
  async autoAssignIpsToClient(@Param('clientId') clientId: string): Promise<any> {
      try {
          const result = await this.clientService.autoAssignIpsToClient(clientId);
          return {
              success: true,
              message: `Auto-assigned IPs to ${result.summary.assigned}/${result.summary.totalMobiles} mobiles`,
              data: result
          };
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
  }

  @Get(':clientId/mobiles-needing-ips')
  @ApiOperation({ summary: 'Get mobile numbers that need IP assignment' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'Mobile numbers needing IP assignment' })
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
      try {
          const mobilesNeedingIps = await this.clientService.getMobilesNeedingIpAssignment(clientId);
          const totalNeedingAssignment = (mobilesNeedingIps.mainMobile ? 1 : 0) + mobilesNeedingIps.promoteMobiles.length;
          
          return {
              clientId,
              mobilesNeedingIps,
              summary: {
                  totalNeedingAssignment,
                  mainMobileNeedsIp: !!mobilesNeedingIps.mainMobile,
                  promoteMobilesNeedingIp: mobilesNeedingIps.promoteMobiles.length
              }
          };
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
  }

  @Delete('mobile/:mobile/ip')
  @ApiOperation({ summary: 'Release IP from a mobile number' })
  @ApiParam({ name: 'mobile', description: 'Mobile number to release IP from' })
  @ApiResponse({ status: 200, description: 'IP released successfully' })
  async releaseIpFromMobile(@Param('mobile') mobile: string): Promise<{ success: boolean; message: string }> {
      try {
          return await this.clientService.releaseIpFromMobile(mobile);
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
  }

  // ==================== PROMOTE MOBILE MIGRATION ====================

  @Get('migration/status')
  @ApiOperation({ summary: 'Check promote mobile migration status' })
  @ApiResponse({ status: 200, description: 'Migration status retrieved successfully' })
  async checkMigrationStatus(): Promise<{
      isLegacyData: boolean;
      legacyClientsCount: number;
      modernClientsCount: number;
      totalPromoteClients: number;
      recommendations: string[];
  }> {
      try {
          return await this.clientService.checkPromoteMobileMigrationStatus();
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  @Post('migration/migrate')
  @ApiOperation({ summary: 'Migrate promote mobiles from array to clientId reference' })
  @ApiResponse({ status: 200, description: 'Migration completed successfully' })
  async migratePromoteMobiles(): Promise<{
      success: boolean;
      message: string;
      results: any;
  }> {
      try {
          return await this.clientService.migratePromoteMobilesToClientId();
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  @Post('migration/verify')
  @ApiOperation({ summary: 'Verify promote mobile migration' })
  @ApiResponse({ status: 200, description: 'Migration verification completed' })
  async verifyMigration(): Promise<{
      success: boolean;
      message: string;
      verification: any;
  }> {
      try {
          return await this.clientService.verifyPromoteMobileMigration();
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  @Post('migration/rollback')
  @ApiOperation({ summary: 'Rollback promote mobile migration' })
  @ApiBody({ 
      schema: { 
          type: 'object', 
          properties: { 
              backupCollectionName: { type: 'string', description: 'Name of backup collection to restore from' } 
          },
          required: ['backupCollectionName']
      } 
  })
  @ApiResponse({ status: 200, description: 'Migration rollback completed' })
  async rollbackMigration(@Body() body: { backupCollectionName: string }): Promise<{
      success: boolean;
      message: string;
      restored: number;
  }> {
      try {
          return await this.clientService.rollbackPromoteMobileMigration(body.backupCollectionName);
      } catch (error) {
          throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }
}
