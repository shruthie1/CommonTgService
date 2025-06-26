import { Controller, Get, Post, Body, Param, Delete, Query, Patch, Put, HttpStatus, BadRequestException } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBody, 
  ApiQuery, 
  ApiResponse, 
  ApiParam,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse 
} from '@nestjs/swagger';
import { ArchivedClient } from './schemas/archived-client.schema';
import { ArchivedClientService } from './archived-client.service';
import { CreateArchivedClientDto } from './dto/create-archived-client.dto';
import { SearchClientDto } from '../clients/dto/search-client.dto';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { SessionUpdateDto } from './dto/session-update.dto';
import { CleanupSessionsDto } from './dto/cleanup-sessions.dto';
import { MaintenanceResultDto } from './dto/maintenance-result.dto';
import { SessionStatusDto, SessionHealthMetricsDto } from './dto/session-status.dto';

@ApiTags('Archived Clients')
@Controller('archived-clients')
export class ArchivedClientController {
  constructor(private readonly archivedclientService: ArchivedClientService) { }

  @Post()
  @ApiOperation({ 
    summary: 'Create new archived client', 
    description: 'Creates a new archived client record with session information. Used when a Telegram client becomes inactive but needs to be preserved for potential future reactivation.' 
  })
  @ApiBody({ 
    type: CreateArchivedClientDto,
    description: 'Archived client data including mobile number and session token'
  })
  @ApiOkResponse({ 
    description: 'Archived client successfully created',
    type: ArchivedClient
  })
  @ApiBadRequestResponse({ description: 'Invalid input data provided' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error occurred' })
  async create(@Body() createArchivedClientDto: CreateArchivedClientDto): Promise<ArchivedClient> {
    return this.archivedclientService.create(createArchivedClientDto);
  }

  @Get('search')
  @ApiOperation({ 
    summary: 'Search archived clients', 
    description: 'Search for archived clients using various filter criteria. Supports partial matching for names and exact matching for other fields.' 
  })
  @ApiQuery({ name: 'clientId', required: false, description: 'Unique client identifier' })
  @ApiQuery({ name: 'dbcoll', required: false, description: 'Database collection name for filtering' })
  @ApiQuery({ name: 'channelLink', required: false, description: 'Associated channel link' })
  @ApiQuery({ name: 'link', required: false, description: 'Client profile link' })
  @ApiQuery({ name: 'firstName', required: false, description: 'First name (supports partial matching)' })
  @ApiOkResponse({ 
    description: 'List of archived clients matching search criteria',
    type: [ArchivedClient]
  })
  @ApiBadRequestResponse({ description: 'Invalid search parameters' })
  async search(@Query() query: SearchClientDto): Promise<ArchivedClient[]> {
    return this.archivedclientService.search(query);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all archived clients', 
    description: 'Retrieves a complete list of all archived clients in the system. Use with caution on large datasets.' 
  })
  @ApiOkResponse({ 
    description: 'Complete list of all archived clients',
    type: [ArchivedClient]
  })
  @ApiInternalServerErrorResponse({ description: 'Database error occurred' })
  async findAll(): Promise<ArchivedClient[]> {
    return this.archivedclientService.findAll();
  }
  
  @Get('maintenance/check-archived-clients')
  @ApiOperation({ 
    summary: 'Run archived clients maintenance check', 
    description: 'Performs comprehensive maintenance on all archived clients including session validation, profile updates, and cleanup of inactive sessions. This is a long-running operation that should be used during maintenance windows.' 
  })
  @ApiOkResponse({ 
    description: 'Maintenance check completed successfully',
    schema: {
      type: 'string',
      example: 'Archived clients check completed. Processed: 150, Updated: 23, Deleted: 5, Errors: 2'
    }
  })
  @ApiInternalServerErrorResponse({ description: 'Maintenance operation failed' })
  async checkArchivedClients(): Promise<string> {
    return this.archivedclientService.checkArchivedClients();
  }

  @Get(':mobile')
  @ApiOperation({ 
    summary: 'Get archived client by mobile number', 
    description: 'Retrieves a specific archived client using their mobile number. Returns null if not found.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiOkResponse({ 
    description: 'Archived client found',
    type: ArchivedClient
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  async findOne(@Param('mobile') mobile: string): Promise<ArchivedClient> {
    return this.archivedclientService.findOne(mobile);
  }
  
  @Get('fetch/:mobile')
  @ApiOperation({ 
    summary: 'Fetch or create archived client', 
    description: 'Retrieves an archived client by mobile number. If not found, creates a new session and archived client record automatically.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the client',
    example: '916265240911'
  })
  @ApiOkResponse({ 
    description: 'Archived client retrieved or created',
    type: ArchivedClient
  })
  @ApiNotFoundResponse({ description: 'Could not create session for the mobile number' })
  @ApiInternalServerErrorResponse({ description: 'Session creation failed' })
  async fetchOne(@Param('mobile') mobile: string): Promise<ArchivedClient> {
    return this.archivedclientService.fetchOne(mobile);
  }

  @Patch(':mobile')
  @ApiOperation({ 
    summary: 'Update archived client', 
    description: 'Updates an existing archived client record. Uses upsert operation - creates if not exists.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiBody({ 
    type: UpdateClientDto,
    description: 'Fields to update (partial update supported)'
  })
  @ApiOkResponse({ 
    description: 'Archived client updated successfully',
    type: ArchivedClient
  })
  @ApiBadRequestResponse({ description: 'Invalid update data' })
  async update(@Param('mobile') mobile: string, @Body() updateClientDto: UpdateClientDto): Promise<ArchivedClient> {
    return this.archivedclientService.update(mobile, updateClientDto);
  }

  @Delete(':mobile')
  @ApiOperation({ 
    summary: 'Delete archived client', 
    description: 'Permanently removes an archived client record from the system.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client to delete',
    example: '916265240911'
  })
  @ApiOkResponse({ 
    description: 'Archived client deleted successfully',
    type: ArchivedClient
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  async remove(@Param('mobile') mobile: string): Promise<ArchivedClient> {
    return this.archivedclientService.remove(mobile);
  }

  @Post('query')
  @ApiOperation({ 
    summary: 'Execute custom MongoDB query', 
    description: 'Executes a custom MongoDB query against the archived clients collection. Use with caution as this provides direct database access.' 
  })
  @ApiBody({
    description: 'MongoDB query object',
    schema: {
      type: 'object',
      example: {
        mobile: '916265240911'
      }
    }
  })
  @ApiOkResponse({ 
    description: 'Query executed successfully',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/ArchivedClient' }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid query provided' })
  @ApiInternalServerErrorResponse({ description: 'Query execution failed' })
  async executeQuery(@Body() query: object): Promise<any> {
    if (!query || Object.keys(query).length === 0) {
      throw new BadRequestException('Query cannot be empty');
    }
    return await this.archivedclientService.executeQuery(query);
  }

  @Put(':mobile/session')
  @ApiOperation({ 
    summary: 'Update session with backup', 
    description: 'Updates the main session for an archived client. If the current session is still active, it will be backed up to oldSessions array before being replaced.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiBody({ 
    type: SessionUpdateDto,
    description: 'New session data'
  })
  @ApiOkResponse({ 
    description: 'Session updated successfully',
    type: ArchivedClient
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  @ApiBadRequestResponse({ description: 'Invalid session token provided' })
  async updateSession(
    @Param('mobile') mobile: string, 
    @Body() sessionUpdateDto: SessionUpdateDto
  ): Promise<ArchivedClient> {
    return this.archivedclientService.updateSession(mobile, sessionUpdateDto.newSession);
  }

  @Get(':mobile/old-sessions')
  @ApiOperation({ 
    summary: 'Get old sessions for client', 
    description: 'Retrieves all old session tokens stored for an archived client. These are previous sessions that were backed up when new sessions were set.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiOkResponse({ 
    description: 'List of old session tokens',
    schema: {
      type: 'array',
      items: {
        type: 'string',
        description: 'Session token'
      },
      example: ['1BQANOTEuM==', '2CRANOTEuN==', '3DRANOTEuO==']
    }
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  @ApiBadRequestResponse({ description: 'Mobile number is required' })
  async getOldSessions(@Param('mobile') mobile: string): Promise<string[]> {
    return this.archivedclientService.getOldSessions(mobile);
  }

  @Post(':mobile/cleanup-sessions')
  @ApiOperation({ 
    summary: 'Clean up old sessions', 
    description: 'Removes inactive old sessions and limits the number of stored old sessions. Only keeps the most recent active sessions up to the specified limit.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiBody({ 
    type: CleanupSessionsDto,
    description: 'Cleanup configuration',
    required: false
  })
  @ApiOkResponse({ 
    description: 'Session cleanup completed successfully',
    type: ArchivedClient
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  @ApiBadRequestResponse({ description: 'Invalid maxSessions value' })
  async cleanupOldSessions(
    @Param('mobile') mobile: string,
    @Body() cleanupDto?: CleanupSessionsDto
  ): Promise<ArchivedClient> {
    return this.archivedclientService.cleanupOldSessions(mobile, cleanupDto?.maxSessions);
  }

  @Get(':mobile/session-status')
  @ApiOperation({ 
    summary: 'Check session status', 
    description: 'Checks if the current session for an archived client is active. This is useful for verifying session health before performing operations.' 
  })
  @ApiParam({ 
    name: 'mobile', 
    description: 'Mobile number of the archived client',
    example: '916265240911'
  })
  @ApiOkResponse({ 
    description: 'Session status information',
    type: SessionStatusDto
  })
  @ApiNotFoundResponse({ description: 'Archived client not found' })
  async checkSessionStatus(@Param('mobile') mobile: string): Promise<SessionStatusDto> {
    return this.archivedclientService.getSessionStatus(mobile);
  }

  @Post('batch-fetch')
  @ApiOperation({ 
    summary: 'Batch fetch sessions for multiple mobiles', 
    description: 'Efficiently retrieves or creates active sessions for multiple mobile numbers in a single request. Useful for bulk operations.' 
  })
  @ApiBody({ 
    description: 'Array of mobile numbers to process',
    schema: {
      type: 'object',
      properties: {
        mobiles: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 50,
          example: ['916265240911', '916265240912', '916265240913']
        }
      },
      required: ['mobiles']
    }
  })
  @ApiOkResponse({ 
    description: 'Batch processing results',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mobile: { type: 'string' },
          client: { $ref: '#/components/schemas/ArchivedClient' },
          error: { type: 'string' }
        }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid batch request or too many mobiles' })
  async batchFetchSessions(@Body('mobiles') mobiles: string[]): Promise<{ 
    mobile: string; 
    client: ArchivedClient | null; 
    error?: string 
  }[]> {
    return this.archivedclientService.batchFetchSessions(mobiles);
  }

  @Get('health/cache-stats')
  @ApiOperation({ 
    summary: 'Get session validation cache statistics', 
    description: 'Returns statistics about the internal session validation cache for monitoring and debugging purposes.' 
  })
  @ApiOkResponse({ 
    description: 'Cache statistics',
    schema: {
      type: 'object',
      properties: {
        totalEntries: { type: 'number', example: 150 },
        validEntries: { type: 'number', example: 120 },
        expiredEntries: { type: 'number', example: 30 },
        cacheHitRate: { type: 'string', example: '85%' },
        lastCleanup: { type: 'string', format: 'date-time' }
      }
    }
  })
  async getCacheStats(): Promise<{
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    cacheHitRate: string;
    lastCleanup: string;
  }> {
    return (this.archivedclientService as any).getCacheStatistics();
  }
}
