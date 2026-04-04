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
exports.PromoteClientController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const promote_client_service_1 = require("./promote-client.service");
const create_promote_client_dto_1 = require("./dto/create-promote-client.dto");
const search_promote_client_dto_1 = require("./dto/search-promote-client.dto");
const promote_client_schema_1 = require("./schemas/promote-client.schema");
const update_promote_client_dto_1 = require("./dto/update-promote-client.dto");
const client_swagger_dto_1 = require("../shared/dto/client-swagger.dto");
const base_client_service_1 = require("../shared/base-client.service");
let PromoteClientController = class PromoteClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return this.clientService.create(createClientDto);
    }
    async search(query) {
        return this.clientService.search(query);
    }
    async joinChannelsforPromoteClients() {
        return this.clientService.joinchannelForPromoteClients();
    }
    async updateInfo() {
        this.clientService.updateInfo();
        return 'initiated Checking';
    }
    async checkpromoteClients() {
        this.clientService.checkPromoteClients();
        return 'initiated Checking';
    }
    async addNewUserstoPromoteClients(body) {
        if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
            throw new common_1.BadRequestException('goodIds and badIds must be arrays');
        }
        if (body.clientsNeedingPromoteClients && !Array.isArray(body.clientsNeedingPromoteClients)) {
            throw new common_1.BadRequestException('clientsNeedingPromoteClients must be an array');
        }
        this.clientService.addNewUserstoPromoteClients(body.badIds, body.goodIds, body.clientsNeedingPromoteClients || [], undefined);
        return 'initiated Checking';
    }
    async findAll(status) {
        return this.clientService.findAll(status);
    }
    async setAsPromoteClient(mobile) {
        return this.clientService.setAsPromoteClient(mobile);
    }
    async findOne(mobile) {
        return this.clientService.findOne(mobile);
    }
    async update(mobile, updateClientDto) {
        return this.clientService.update(mobile, updateClientDto);
    }
    async createdOrupdate(mobile, updateClientDto) {
        return this.clientService.createOrUpdate(mobile, updateClientDto);
    }
    async remove(mobile) {
        return this.clientService.remove(mobile);
    }
    async executeQuery(query) {
        return this.clientService.executeQuery(query);
    }
    async getPromoteClientDistribution() {
        return this.clientService.getPromoteClientDistribution();
    }
    async getPromoteClientsByStatus(status) {
        return this.clientService.getPromoteClientsByStatus(status);
    }
    async getPromoteClientsWithMessages() {
        return this.clientService.getPromoteClientsWithMessages();
    }
    async updateStatus(mobile, body) {
        if (body.status !== 'active' && body.status !== 'inactive') {
            throw new common_1.BadRequestException('Status must be either "active" or "inactive"');
        }
        return this.clientService.updateStatus(mobile, body.status, body.message);
    }
    async markAsActive(mobile, body = {}) {
        return this.clientService.markAsActive(mobile, body.message);
    }
    async markAsInactive(mobile, body) {
        return this.clientService.markAsInactive(mobile, body.reason);
    }
    async markAsUsed(mobile, body = {}) {
        return this.clientService.markAsUsed(mobile, body.message);
    }
    async updateLastUsed(mobile) {
        return this.clientService.updateLastUsed(mobile);
    }
    async getLeastRecentlyUsed(clientId, limit) {
        return this.clientService.getLeastRecentlyUsedPromoteClients(clientId, limit || 1);
    }
    async getNextAvailable(clientId) {
        return this.clientService.getNextAvailablePromoteClient(clientId);
    }
    async getUnusedPromoteClients(hoursAgo, clientId) {
        return this.clientService.getUnusedPromoteClients(hoursAgo || 24, clientId);
    }
    async getUsageStatistics(clientId) {
        return this.clientService.getUsageStatistics(clientId);
    }
};
exports.PromoteClientController = PromoteClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a promote client record', description: 'Creates a promote client directly from supplied data.' }),
    (0, swagger_1.ApiBody)({ type: create_promote_client_dto_1.CreatePromoteClientDto }),
    (0, swagger_1.ApiCreatedResponse)({ type: promote_client_schema_1.PromoteClient }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Request body validation failed.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promote_client_dto_1.CreatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search promote clients', description: 'Searches promote client records by supported fields.' }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false, description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', required: false, description: 'First name' }),
    (0, swagger_1.ApiQuery)({ name: 'lastName', required: false, description: 'Last name' }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, description: 'Username' }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_promote_client_dto_1.SearchPromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('joinChannelsForPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Prepare channel joins for promote clients', description: 'Builds the next join queue for eligible promote clients.' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'string', example: 'Join channels initiated successfully' } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "joinChannelsforPromoteClients", null);
__decorate([
    (0, common_1.Get)('updateInfo'),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh promote client metadata', description: 'Starts a background refresh of promote client metadata and channel counts.' }),
    (0, swagger_1.ApiAcceptedResponse)({ schema: { type: 'string', example: 'initiated Checking' } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "updateInfo", null);
__decorate([
    (0, common_1.Get)('checkPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Run promote warmup processing', description: 'Starts the background warmup processor for eligible promote clients.' }),
    (0, swagger_1.ApiAcceptedResponse)({ schema: { type: 'string', example: 'initiated Checking' } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "checkpromoteClients", null);
__decorate([
    (0, common_1.Post)('addNewUserstoPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk enroll users into promote warmup', description: 'Starts background enrollment of candidate users into the promote client pool.' }),
    (0, swagger_1.ApiBody)({ type: client_swagger_dto_1.BulkEnrollPromoteClientsRequestDto }),
    (0, swagger_1.ApiAcceptedResponse)({ schema: { type: 'string', example: 'initiated Checking' } }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'goodIds, badIds, or clientsNeedingPromoteClients were not valid arrays.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [client_swagger_dto_1.BulkEnrollPromoteClientsRequestDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "addNewUserstoPromoteClients", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List promote clients', description: 'Returns all promote clients, optionally filtered by status.' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by status (active/inactive)' }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Query)('status', new common_1.ParseEnumPipe(base_client_service_1.ClientStatus, { optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('SetAsPromoteClient/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Enroll a user as a promote client', description: 'Converts an existing user account into a warmup-managed promote client.' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'string', example: 'Client enrolled as promote successfully' } }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'The user was not found or is already an active main client.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'A promote client record already exists for this mobile.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "setAsPromoteClient", null);
__decorate([
    (0, common_1.Get)('mobile/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Promote client not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)('mobile/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiBody)({ type: update_promote_client_dto_1.UpdatePromoteClientDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Promote client not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "update", null);
__decorate([
    (0, common_1.Put)('mobile/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiBody)({ type: update_promote_client_dto_1.UpdatePromoteClientDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "createdOrupdate", null);
__decorate([
    (0, common_1.Delete)('mobile/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'null' } }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Promote client not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a raw promote client query', description: 'Executes a direct MongoDB-style filter against the promote client collection.' }),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', additionalProperties: true, example: { status: 'active', clientId: 'client-a' } } }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "executeQuery", null);
__decorate([
    (0, common_1.Get)('distribution'),
    (0, swagger_1.ApiOperation)({ summary: 'Get promote client distribution per client' }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', additionalProperties: true } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getPromoteClientDistribution", null);
__decorate([
    (0, common_1.Get)('status/:status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get promote clients by status' }),
    (0, swagger_1.ApiParam)({ name: 'status', description: 'Status to filter by (active/inactive)', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Param)('status', new common_1.ParseEnumPipe(base_client_service_1.ClientStatus))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getPromoteClientsByStatus", null);
__decorate([
    (0, common_1.Get)('messages/all'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all promote clients with their status messages' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getPromoteClientsWithMessages", null);
__decorate([
    (0, common_1.Patch)('status/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update status of a promote client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the promote client', type: String }),
    (0, swagger_1.ApiBody)({ type: client_swagger_dto_1.StatusUpdateRequestDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Status must be either active or inactive.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, client_swagger_dto_1.StatusUpdateRequestDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)('activate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a promote client as active' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the promote client', type: String }),
    (0, swagger_1.ApiBody)({ type: client_swagger_dto_1.ActivationRequestDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, client_swagger_dto_1.ActivationRequestDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "markAsActive", null);
__decorate([
    (0, common_1.Patch)('deactivate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a promote client as inactive' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the promote client', type: String }),
    (0, swagger_1.ApiBody)({ type: client_swagger_dto_1.DeactivationRequestDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, client_swagger_dto_1.DeactivationRequestDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "markAsInactive", null);
__decorate([
    (0, common_1.Patch)('mark-used/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a promote client as used (update lastUsed timestamp)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the promote client', type: String }),
    (0, swagger_1.ApiBody)({ type: client_swagger_dto_1.MarkUsedRequestDto }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, client_swagger_dto_1.MarkUsedRequestDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "markAsUsed", null);
__decorate([
    (0, common_1.Patch)('update-last-used/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update last used timestamp for a promote client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the promote client', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "updateLastUsed", null);
__decorate([
    (0, common_1.Get)('least-recently-used/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get least recently used promote clients for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID to get promote clients for', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Number of promote clients to return', type: Number }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getLeastRecentlyUsed", null);
__decorate([
    (0, common_1.Get)('next-available/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get next available promote client for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID to get next available promote client for', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: promote_client_schema_1.PromoteClient }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getNextAvailable", null);
__decorate([
    (0, common_1.Get)('unused'),
    (0, swagger_1.ApiOperation)({ summary: "Get promote clients that haven't been used for a specified time period" }),
    (0, swagger_1.ApiQuery)({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: [promote_client_schema_1.PromoteClient] }),
    __param(0, (0, common_1.Query)('hoursAgo')),
    __param(1, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getUnusedPromoteClients", null);
__decorate([
    (0, common_1.Get)('usage-stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get usage statistics for promote clients' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: client_swagger_dto_1.UsageStatisticsDto }),
    __param(0, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "getUsageStatistics", null);
exports.PromoteClientController = PromoteClientController = __decorate([
    (0, swagger_1.ApiTags)('Promote Clients'),
    (0, common_1.Controller)('promoteclients'),
    __metadata("design:paramtypes", [promote_client_service_1.PromoteClientService])
], PromoteClientController);
//# sourceMappingURL=promote-client.controller.js.map