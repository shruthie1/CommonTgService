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
const search_client_dto_1 = require("./dto/search-client.dto");
const setup_client_dto_1 = require("./dto/setup-client.dto");
const update_client_dto_1 = require("./dto/update-client.dto");
let ClientController = class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return this.clientService.create(createClientDto);
    }
    async search(query) {
        return this.clientService.search(query);
    }
    async findAll() {
        return this.clientService.findAll();
    }
    async findOne(clientId) {
        return this.clientService.findOne(clientId);
    }
    async setupClient(clientId, setupClientQueryDto) {
        this.clientService.setupClient(clientId, setupClientQueryDto);
        return `Started Client Seup for ${clientId}`;
    }
    async update(clientId, updateClientDto) {
        return this.clientService.update(clientId, updateClientDto);
    }
    async remove(clientId) {
        return this.clientService.remove(clientId);
    }
    async executeQuery(query) {
        try {
            return await this.clientService.executeQuery(query);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.ClientController = ClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_client_dto_1.CreateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('setupClient/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'SetUp Client data' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, setup_client_dto_1.SetupClientQueryDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "setupClient", null);
__decorate([
    (0, common_1.Patch)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "executeQuery", null);
exports.ClientController = ClientController = __decorate([
    (0, swagger_1.ApiTags)('Clients'),
    (0, common_1.Controller)('client'),
    __metadata("design:paramtypes", [client_service_1.ClientService])
], ClientController);
//# sourceMappingURL=client.controller.js.map