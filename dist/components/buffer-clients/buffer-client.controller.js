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
exports.BufferClientController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const buffer_client_service_1 = require("./buffer-client.service");
const create_buffer_client_dto_1 = require("./dto/create-buffer-client.dto");
const search_buffer_client_dto_1 = require("./dto/search-buffer-client.dto");
const buffer_client_schema_1 = require("./schemas/buffer-client.schema");
const update_buffer_client_dto_1 = require("./dto/update-buffer-client.dto");
let BufferClientController = class BufferClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return this.clientService.create(createClientDto);
    }
    async search(query) {
        return this.clientService.search(query);
    }
    async updateInfo() {
        this.clientService.updateInfo();
        return 'initiated Checking';
    }
    async joinChannelsforBufferClients(clientId) {
        return this.clientService.joinchannelForBufferClients(true, clientId);
    }
    async checkbufferClients() {
        this.clientService.checkBufferClients();
        return 'initiated Checking';
    }
    async addNewUserstoBufferClients(body) {
        if (!body || !Array.isArray(body.goodIds) || !Array.isArray(body.badIds)) {
            throw new common_1.BadRequestException('goodIds and badIds must be arrays');
        }
        if (body.clientsNeedingBufferClients && !Array.isArray(body.clientsNeedingBufferClients)) {
            throw new common_1.BadRequestException('clientsNeedingBufferClients must be an array');
        }
        this.clientService.addNewUserstoBufferClients(body.badIds, body.goodIds, body.clientsNeedingBufferClients || [], undefined);
        return 'initiated Checking';
    }
    async findAll(status) {
        return this.clientService.findAll(status);
    }
    async setAsBufferClient(mobile, clientId) {
        return this.clientService.setAsBufferClient(mobile, clientId);
    }
    async executeQuery(query) {
        return this.clientService.executeQuery(query);
    }
    async getBufferClientDistribution() {
        return this.clientService.getBufferClientDistribution();
    }
    async getBufferClientsByClientId(clientId, status) {
        return this.clientService.getBufferClientsByClientId(clientId, status);
    }
    async getBufferClientsByStatus(status) {
        return this.clientService.findAll(status);
    }
    async updateStatus(mobile, body) {
        if (body.status !== 'active' && body.status !== 'inactive') {
            throw new common_1.BadRequestException('Status must be either "active" or "inactive"');
        }
        return this.clientService.updateStatus(mobile, body.status, body.message);
    }
    async markAsActive(mobile, body = {}) {
        return this.clientService.updateStatus(mobile, 'active', body.message);
    }
    async markAsInactive(mobile, body) {
        return this.clientService.markAsInactive(mobile, body.reason);
    }
    async markAsUsed(mobile, body = {}) {
        return this.clientService.markAsUsed(mobile, body.message);
    }
    async getNextAvailable(clientId) {
        return this.clientService.getNextAvailableBufferClient(clientId);
    }
    async getUnusedBufferClients(hoursAgo, clientId) {
        return this.clientService.getUnusedBufferClients(hoursAgo || 24, clientId);
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
};
exports.BufferClientController = BufferClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    (0, swagger_1.ApiBody)({ type: create_buffer_client_dto_1.CreateBufferClientDto }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_buffer_client_dto_1.CreateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search buffer client data' }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false, description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Client ID' }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, description: 'Username' }),
    (0, swagger_1.ApiQuery)({ name: 'name', required: false, description: 'Name' }),
    (0, swagger_1.ApiQuery)({ name: 'channelLink', required: false, description: 'Channel link' }),
    (0, swagger_1.ApiQuery)({ name: 'repl', required: false, description: 'Repl link' }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, description: 'Filter by active status' }),
    (0, swagger_1.ApiResponse)({ type: [buffer_client_schema_1.BufferClient] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_buffer_client_dto_1.SearchBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('updateInfo'),
    (0, swagger_1.ApiOperation)({ summary: 'Update promote Clients Info' }),
    (0, swagger_1.ApiResponse)({ type: String }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "updateInfo", null);
__decorate([
    (0, common_1.Get)('joinChannelsForBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Join Channels for BufferClients' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String }),
    (0, swagger_1.ApiResponse)({ type: String }),
    __param(0, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "joinChannelsforBufferClients", null);
__decorate([
    (0, common_1.Get)('checkBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Check Buffer Clients' }),
    (0, swagger_1.ApiResponse)({ type: String }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "checkbufferClients", null);
__decorate([
    (0, common_1.Post)('addNewUserstoBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Add New Users to Buffer Clients' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                goodIds: { type: 'array', items: { type: 'string' } },
                badIds: { type: 'array', items: { type: 'string' } },
                clientsNeedingBufferClients: { type: 'array', items: { type: 'string' } }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ type: String }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "addNewUserstoBufferClients", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all buffer client data' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by status (active/inactive)' }),
    (0, swagger_1.ApiResponse)({ type: [buffer_client_schema_1.BufferClient] }),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('SetAsBufferClient/:mobile/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Set as Buffer Client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID to assign buffer client to', type: String }),
    (0, swagger_1.ApiResponse)({ type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "setAsBufferClient", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "executeQuery", null);
__decorate([
    (0, common_1.Get)('distribution'),
    (0, swagger_1.ApiOperation)({ summary: 'Get buffer client distribution per client' }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "getBufferClientDistribution", null);
__decorate([
    (0, common_1.Get)('client/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get buffer clients by client ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID to get buffer clients for', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by status (active/inactive)', type: String }),
    (0, swagger_1.ApiResponse)({ type: [buffer_client_schema_1.BufferClient] }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "getBufferClientsByClientId", null);
__decorate([
    (0, common_1.Get)('status/:status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get buffer clients by status' }),
    (0, swagger_1.ApiParam)({ name: 'status', description: 'Status to filter by (active/inactive)', type: String }),
    (0, swagger_1.ApiResponse)({ type: [buffer_client_schema_1.BufferClient] }),
    __param(0, (0, common_1.Param)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "getBufferClientsByStatus", null);
__decorate([
    (0, common_1.Patch)('status/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update status of a buffer client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the buffer client', type: String }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'New status (active/inactive)' },
                message: { type: 'string', description: 'Status message (optional)' }
            },
            required: ['status']
        }
    }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)('activate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a buffer client as active' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the buffer client', type: String }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Activation message (optional)' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "markAsActive", null);
__decorate([
    (0, common_1.Patch)('deactivate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a buffer client as inactive' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the buffer client', type: String }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                reason: { type: 'string', description: 'Reason for deactivation' }
            },
            required: ['reason']
        }
    }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "markAsInactive", null);
__decorate([
    (0, common_1.Patch)('mark-used/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a buffer client as used (update lastUsed timestamp)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the buffer client', type: String }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Usage message (optional)' }
            }
        }
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "markAsUsed", null);
__decorate([
    (0, common_1.Get)('next-available/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get next available buffer client for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID to get next available buffer client for', type: String }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "getNextAvailable", null);
__decorate([
    (0, common_1.Get)('unused'),
    (0, swagger_1.ApiOperation)({ summary: "Get buffer clients that haven't been used for a specified time period" }),
    (0, swagger_1.ApiQuery)({ name: 'hoursAgo', required: false, description: 'Hours ago cutoff (default: 24)', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Filter by specific client ID', type: String }),
    (0, swagger_1.ApiResponse)({ type: [buffer_client_schema_1.BufferClient] }),
    __param(0, (0, common_1.Query)('hoursAgo')),
    __param(1, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "getUnusedBufferClients", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiBody)({ type: update_buffer_client_dto_1.UpdateBufferClientDto }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_buffer_client_dto_1.UpdateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiBody)({ type: update_buffer_client_dto_1.UpdateBufferClientDto }),
    (0, swagger_1.ApiResponse)({ type: buffer_client_schema_1.BufferClient }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_buffer_client_dto_1.UpdateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "createdOrupdate", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiResponse)({ type: null }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "remove", null);
exports.BufferClientController = BufferClientController = __decorate([
    (0, swagger_1.ApiTags)('Buffer Clients'),
    (0, common_1.Controller)('bufferclients'),
    __metadata("design:paramtypes", [buffer_client_service_1.BufferClientService])
], BufferClientController);
//# sourceMappingURL=buffer-client.controller.js.map