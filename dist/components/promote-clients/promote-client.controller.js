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
const update_promote_client_dto_1 = require("./dto/update-promote-client.dto");
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
    async checkpromoteClients() {
        this.clientService.checkPromoteClients();
        return "initiated Checking";
    }
    async addNewUserstoPromoteClients(body) {
        this.clientService.addNewUserstoPromoteClients(body.badIds, body.goodIds);
        return "initiated Checking";
    }
    async findAll() {
        return this.clientService.findAll();
    }
    async setAsPromoteClient(mobile) {
        return await this.clientService.setAsPromoteClient(mobile);
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
        try {
            return await this.clientService.executeQuery(query);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.PromoteClientController = PromoteClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promote_client_dto_1.CreatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_promote_client_dto_1.SearchPromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('joinChannelsForPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Join Channels for PromoteClients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "joinChannelsforPromoteClients", null);
__decorate([
    (0, common_1.Get)('checkPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Check Promote Clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "checkpromoteClients", null);
__decorate([
    (0, common_1.Post)('addNewUserstoPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Add New Users to Promote Clients' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "addNewUserstoPromoteClients", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('SetAsPromoteClient/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set as Promote Client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "setAsPromoteClient", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "createdOrupdate", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "executeQuery", null);
exports.PromoteClientController = PromoteClientController = __decorate([
    (0, swagger_1.ApiTags)('Promote Clients'),
    (0, common_1.Controller)('promoteclients'),
    __metadata("design:paramtypes", [promote_client_service_1.PromoteClientService])
], PromoteClientController);
//# sourceMappingURL=promote-client.controller.js.map