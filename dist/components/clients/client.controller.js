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
exports.ClientController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_service_1 = require("./client.service");
const create_client_dto_1 = require("./dto/create-client.dto");
const client_schema_1 = require("./schemas/client.schema");
const search_client_dto_1 = require("./dto/search-client.dto");
const update_client_dto_1 = require("./dto/update-client.dto");
const execute_client_query_dto_1 = require("./dto/execute-client-query.dto");
const decorators_1 = require("../../decorators");
const interceptors_1 = require("../../interceptors");
let ClientController = class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    sanitizeQuery(query) {
        const { apiKey: _apiKey, ...rest } = query;
        return rest;
    }
    async create(createClientDto) {
        return await this.clientService.create(createClientDto);
    }
    async search(query) {
        return await this.clientService.search(this.sanitizeQuery(query));
    }
    async updateClient(clientId) {
        const updated = await this.clientService.updateClient(clientId, '', false, true);
        return updated ? 'Update client completed' : 'Update client skipped';
    }
    async findAllMasked() {
        return await this.clientService.findAllMasked();
    }
    async findOneMasked(clientId) {
        return await this.clientService.findOneMasked(clientId);
    }
    async findAll() {
        return await this.clientService.findAll();
    }
    async getPersonaPool(clientId) {
        return await this.clientService.getPersonaPool(clientId);
    }
    async getExistingAssignments(clientId, scope = 'all') {
        return await this.clientService.getExistingAssignments(clientId, scope);
    }
    async findOne(clientId) {
        return await this.clientService.findOne(clientId);
    }
    async update(clientId, updateClientDto) {
        return await this.clientService.update(clientId, updateClientDto);
    }
    async remove(clientId) {
        return await this.clientService.remove(clientId);
    }
    async executeQuery(requestBody) {
        const { query, sort, limit, skip } = requestBody;
        return await this.clientService.executeQuery(query, sort, limit, skip);
    }
};
exports.ClientController = ClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a client' }),
    (0, swagger_1.ApiBody)({ type: create_client_dto_1.CreateClientDto }),
    (0, swagger_1.ApiCreatedResponse)({ type: client_schema_1.Client }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_client_dto_1.CreateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search clients' }),
    (0, swagger_1.ApiOkResponse)({ type: [client_schema_1.Client] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('updateClient/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh client profile on Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "updateClient", null);
__decorate([
    (0, common_1.Get)('maskedCls'),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get all clients (sensitive fields masked)' }),
    (0, swagger_1.ApiOkResponse)({ type: [client_schema_1.Client] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAllMasked", null);
__decorate([
    (0, common_1.Get)('maskedCls/:clientId'),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get client by ID (sensitive fields masked)' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    (0, swagger_1.ApiOkResponse)({ type: client_schema_1.Client }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOneMasked", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get all clients' }),
    (0, swagger_1.ApiOkResponse)({ type: [client_schema_1.Client] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':clientId/persona-pool'),
    (0, swagger_1.ApiOperation)({ summary: 'Get persona pool for a client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "getPersonaPool", null);
__decorate([
    (0, common_1.Get)(':clientId/existing-assignments'),
    (0, swagger_1.ApiOperation)({ summary: 'Get existing persona assignments' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    (0, swagger_1.ApiQuery)({ name: 'scope', required: false, enum: ['all', 'buffer', 'activeClient'] }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Query)('scope')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "getExistingAssignments", null);
__decorate([
    (0, common_1.Get)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get client by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    (0, swagger_1.ApiOkResponse)({ type: client_schema_1.Client }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    (0, swagger_1.ApiBody)({ type: update_client_dto_1.UpdateClientDto }),
    (0, swagger_1.ApiOkResponse)({ type: client_schema_1.Client }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId' }),
    (0, swagger_1.ApiOkResponse)({ type: client_schema_1.Client }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: execute_client_query_dto_1.ExecuteClientQueryDto }),
    (0, swagger_1.ApiOkResponse)({ type: [client_schema_1.Client] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [execute_client_query_dto_1.ExecuteClientQueryDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "executeQuery", null);
exports.ClientController = ClientController = __decorate([
    (0, swagger_1.ApiTags)('Clients'),
    (0, common_1.Controller)('clients'),
    __metadata("design:paramtypes", [client_service_1.ClientService])
], ClientController);
//# sourceMappingURL=client.controller.js.map