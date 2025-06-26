"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivedClientController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const archived_client_schema_1 = require("./schemas/archived-client.schema");
const archived_client_service_1 = require("./archived-client.service");
const create_archived_client_dto_1 = require("./dto/create-archived-client.dto");
const search_client_dto_1 = require("../clients/dto/search-client.dto");
const update_client_dto_1 = require("../clients/dto/update-client.dto");
const session_update_dto_1 = require("./dto/session-update.dto");
const cleanup_sessions_dto_1 = require("./dto/cleanup-sessions.dto");
const session_status_dto_1 = require("./dto/session-status.dto");
let ArchivedClientController = class ArchivedClientController {
    constructor(archivedclientService) {
        this.archivedclientService = archivedclientService;
    }
    async create(createArchivedClientDto) {
        return this.archivedclientService.create(createArchivedClientDto);
    }
    async search(query) {
        return this.archivedclientService.search(query);
    }
    async findAll() {
        return this.archivedclientService.findAll();
    }
    async checkArchivedClients() {
        return this.archivedclientService.checkArchivedClients();
    }
    async findOne(mobile) {
        return this.archivedclientService.findOne(mobile);
    }
    async fetchOne(mobile) {
        return this.archivedclientService.fetchOne(mobile);
    }
    async update(mobile, updateClientDto) {
        return this.archivedclientService.update(mobile, updateClientDto);
    }
    async remove(mobile) {
        return this.archivedclientService.remove(mobile);
    }
    async executeQuery(query) {
        if (!query || Object.keys(query).length === 0) {
            throw new common_1.BadRequestException('Query cannot be empty');
        }
        return await this.archivedclientService.executeQuery(query);
    }
    async updateSession(mobile, sessionUpdateDto) {
        return this.archivedclientService.updateSession(mobile, sessionUpdateDto.newSession);
    }
    async getOldSessions(mobile) {
        return this.archivedclientService.getOldSessions(mobile);
    }
    async cleanupOldSessions(mobile, cleanupDto) {
        return this.archivedclientService.cleanupOldSessions(mobile, cleanupDto?.maxSessions);
    }
    async checkSessionStatus(mobile) {
        return this.archivedclientService.getSessionStatus(mobile);
    }
    async batchFetchSessions(mobiles) {
        return this.archivedclientService.batchFetchSessions(mobiles);
    }
    async getCacheStats() {
        return this.archivedclientService.getCacheStatistics();
    }
};
exports.ArchivedClientController = ArchivedClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Create new archived client',
        description: 'Creates a new archived client record with session information. Used when a Telegram client becomes inactive but needs to be preserved for potential future reactivation.'
    }),
    (0, swagger_1.ApiBody)({
        type: create_archived_client_dto_1.CreateArchivedClientDto,
        description: 'Archived client data including mobile number and session token'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Archived client successfully created',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid input data provided' }),
    (0, swagger_1.ApiInternalServerErrorResponse)({ description: 'Internal server error occurred' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_archived_client_dto_1.CreateArchivedClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({
        summary: 'Search archived clients',
        description: 'Search for archived clients using various filter criteria. Supports partial matching for names and exact matching for other fields.'
    }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Unique client identifier' }),
    (0, swagger_1.ApiQuery)({ name: 'dbcoll', required: false, description: 'Database collection name for filtering' }),
    (0, swagger_1.ApiQuery)({ name: 'channelLink', required: false, description: 'Associated channel link' }),
    (0, swagger_1.ApiQuery)({ name: 'link', required: false, description: 'Client profile link' }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', required: false, description: 'First name (supports partial matching)' }),
    (0, swagger_1.ApiOkResponse)({
        description: 'List of archived clients matching search criteria',
        type: [archived_client_schema_1.ArchivedClient]
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid search parameters' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Get all archived clients',
        description: 'Retrieves a complete list of all archived clients in the system. Use with caution on large datasets.'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Complete list of all archived clients',
        type: [archived_client_schema_1.ArchivedClient]
    }),
    (0, swagger_1.ApiInternalServerErrorResponse)({ description: 'Database error occurred' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('maintenance/check-archived-clients'),
    (0, swagger_1.ApiOperation)({
        summary: 'Run archived clients maintenance check',
        description: 'Performs comprehensive maintenance on all archived clients including session validation, profile updates, and cleanup of inactive sessions. This is a long-running operation that should be used during maintenance windows.'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Maintenance check completed successfully',
        schema: {
            type: 'string',
            example: 'Archived clients check completed. Processed: 150, Updated: 23, Deleted: 5, Errors: 2'
        }
    }),
    (0, swagger_1.ApiInternalServerErrorResponse)({ description: 'Maintenance operation failed' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "checkArchivedClients", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get archived client by mobile number',
        description: 'Retrieves a specific archived client using their mobile number. Returns null if not found.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Archived client found',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('fetch/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Fetch or create archived client',
        description: 'Retrieves an archived client by mobile number. If not found, creates a new session and archived client record automatically.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Archived client retrieved or created',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Could not create session for the mobile number' }),
    (0, swagger_1.ApiInternalServerErrorResponse)({ description: 'Session creation failed' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "fetchOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update archived client',
        description: 'Updates an existing archived client record. Uses upsert operation - creates if not exists.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiBody)({
        type: update_client_dto_1.UpdateClientDto,
        description: 'Fields to update (partial update supported)'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Archived client updated successfully',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid update data' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Delete archived client',
        description: 'Permanently removes an archived client record from the system.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client to delete',
        example: '916265240911'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Archived client deleted successfully',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({
        summary: 'Execute custom MongoDB query',
        description: 'Executes a custom MongoDB query against the archived clients collection. Use with caution as this provides direct database access.'
    }),
    (0, swagger_1.ApiBody)({
        description: 'MongoDB query object',
        schema: {
            type: 'object',
            example: {
                mobile: '916265240911'
            }
        }
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Query executed successfully',
        schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/ArchivedClient' }
        }
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid query provided' }),
    (0, swagger_1.ApiInternalServerErrorResponse)({ description: 'Query execution failed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "executeQuery", null);
__decorate([
    (0, common_1.Put)(':mobile/session'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update session with backup',
        description: 'Updates the main session for an archived client. If the current session is still active, it will be backed up to oldSessions array before being replaced.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiBody)({
        type: session_update_dto_1.SessionUpdateDto,
        description: 'New session data'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session updated successfully',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid session token provided' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, session_update_dto_1.SessionUpdateDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "updateSession", null);
__decorate([
    (0, common_1.Get)(':mobile/old-sessions'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get old sessions for client',
        description: 'Retrieves all old session tokens stored for an archived client. These are previous sessions that were backed up when new sessions were set.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'List of old session tokens',
        schema: {
            type: 'array',
            items: {
                type: 'string',
                description: 'Session token'
            },
            example: ['1BQANOTEuM==', '2CRANOTEuN==', '3DRANOTEuO==']
        }
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Mobile number is required' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "getOldSessions", null);
__decorate([
    (0, common_1.Post)(':mobile/cleanup-sessions'),
    (0, swagger_1.ApiOperation)({
        summary: 'Clean up old sessions',
        description: 'Removes inactive old sessions and limits the number of stored old sessions. Only keeps the most recent active sessions up to the specified limit.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiBody)({
        type: cleanup_sessions_dto_1.CleanupSessionsDto,
        description: 'Cleanup configuration',
        required: false
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session cleanup completed successfully',
        type: archived_client_schema_1.ArchivedClient
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid maxSessions value' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, cleanup_sessions_dto_1.CleanupSessionsDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "cleanupOldSessions", null);
__decorate([
    (0, common_1.Get)(':mobile/session-status'),
    (0, swagger_1.ApiOperation)({
        summary: 'Check session status',
        description: 'Checks if the current session for an archived client is active. This is useful for verifying session health before performing operations.'
    }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the archived client',
        example: '916265240911'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session status information',
        type: session_status_dto_1.SessionStatusDto
    }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Archived client not found' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "checkSessionStatus", null);
__decorate([
    (0, common_1.Post)('batch-fetch'),
    (0, swagger_1.ApiOperation)({
        summary: 'Batch fetch sessions for multiple mobiles',
        description: 'Efficiently retrieves or creates active sessions for multiple mobile numbers in a single request. Useful for bulk operations.'
    }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiOkResponse)({
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
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid batch request or too many mobiles' }),
    __param(0, (0, common_1.Body)('mobiles')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "batchFetchSessions", null);
__decorate([
    (0, common_1.Get)('health/cache-stats'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get session validation cache statistics',
        description: 'Returns statistics about the internal session validation cache for monitoring and debugging purposes.'
    }),
    (0, swagger_1.ApiOkResponse)({
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
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "getCacheStats", null);
exports.ArchivedClientController = ArchivedClientController = __decorate([
    (0, swagger_1.ApiTags)('Archived Clients'),
    (0, common_1.Controller)('archived-clients'),
    __metadata("design:paramtypes", [archived_client_service_1.ArchivedClientService])
], ArchivedClientController);
//# sourceMappingURL=archived-client.controller.js.map