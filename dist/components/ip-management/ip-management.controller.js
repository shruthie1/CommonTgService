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
exports.IpManagementController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ip_management_service_1 = require("./ip-management.service");
const create_proxy_ip_dto_1 = require("./dto/create-proxy-ip.dto");
const update_proxy_ip_dto_1 = require("./dto/update-proxy-ip.dto");
const proxy_ip_schema_1 = require("./schemas/proxy-ip.schema");
let IpManagementController = class IpManagementController {
    constructor(ipManagementService) {
        this.ipManagementService = ipManagementService;
    }
    async createProxyIp(createProxyIpDto) {
        try {
            return await this.ipManagementService.createProxyIp(createProxyIpDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async bulkCreateProxyIps(proxyIps) {
        try {
            return await this.ipManagementService.bulkCreateProxyIps(proxyIps);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getAllProxyIps() {
        try {
            return await this.ipManagementService.findAllProxyIps();
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateProxyIp(ipAddress, port, updateProxyIpDto) {
        try {
            return await this.ipManagementService.updateProxyIp(ipAddress, parseInt(port), updateProxyIpDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async deleteProxyIp(ipAddress, port) {
        try {
            await this.ipManagementService.deleteProxyIp(ipAddress, parseInt(port));
            return { message: 'Proxy IP deleted successfully' };
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getHealthStatus() {
        try {
            return await this.ipManagementService.healthCheck();
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getProxyIpById(ipAddress, port) {
        try {
            return await this.ipManagementService.findProxyIpById(ipAddress, parseInt(port));
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async getClientAssignedIps(clientId) {
        try {
            return await this.ipManagementService.getClientAssignedIps(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getAvailableIpCount() {
        try {
            const count = await this.ipManagementService.getAvailableIpCount();
            return { count };
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.IpManagementController = IpManagementController;
__decorate([
    (0, common_1.Post)('proxy-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new proxy IP' }),
    (0, swagger_1.ApiBody)({ type: create_proxy_ip_dto_1.CreateProxyIpDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'Proxy IP created successfully', type: proxy_ip_schema_1.ProxyIp }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid input data' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Proxy IP already exists' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_proxy_ip_dto_1.CreateProxyIpDto]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "createProxyIp", null);
__decorate([
    (0, common_1.Post)('proxy-ips/bulk'),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk create proxy IPs' }),
    (0, swagger_1.ApiBody)({ type: [create_proxy_ip_dto_1.CreateProxyIpDto] }),
    (0, swagger_1.ApiOkResponse)({ description: 'Bulk creation completed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "bulkCreateProxyIps", null);
__decorate([
    (0, common_1.Get)('proxy-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all proxy IPs' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Proxy IPs retrieved successfully', type: [proxy_ip_schema_1.ProxyIp] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getAllProxyIps", null);
__decorate([
    (0, common_1.Put)('proxy-ips/:ipAddress/:port'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a proxy IP' }),
    (0, swagger_1.ApiParam)({ name: 'ipAddress', description: 'IP address' }),
    (0, swagger_1.ApiParam)({ name: 'port', description: 'Port number' }),
    (0, swagger_1.ApiBody)({ type: update_proxy_ip_dto_1.UpdateProxyIpDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'Proxy IP updated successfully', type: proxy_ip_schema_1.ProxyIp }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Proxy IP not found' }),
    __param(0, (0, common_1.Param)('ipAddress')),
    __param(1, (0, common_1.Param)('port')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_proxy_ip_dto_1.UpdateProxyIpDto]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "updateProxyIp", null);
__decorate([
    (0, common_1.Delete)('proxy-ips/:ipAddress/:port'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a proxy IP' }),
    (0, swagger_1.ApiParam)({ name: 'ipAddress', description: 'IP address' }),
    (0, swagger_1.ApiParam)({ name: 'port', description: 'Port number' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Proxy IP deleted successfully' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Proxy IP not found' }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Cannot delete assigned IP' }),
    __param(0, (0, common_1.Param)('ipAddress')),
    __param(1, (0, common_1.Param)('port')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "deleteProxyIp", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP management health status' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Health status retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getHealthStatus", null);
__decorate([
    (0, common_1.Get)('proxy-ips/:ipAddress/:port'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a specific proxy IP' }),
    (0, swagger_1.ApiParam)({ name: 'ipAddress', description: 'IP address' }),
    (0, swagger_1.ApiParam)({ name: 'port', description: 'Port number' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Proxy IP found', type: proxy_ip_schema_1.ProxyIp }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Proxy IP not found' }),
    __param(0, (0, common_1.Param)('ipAddress')),
    __param(1, (0, common_1.Param)('port')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getProxyIpById", null);
__decorate([
    (0, common_1.Get)('clients/:clientId/assigned-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all IPs assigned to a client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Client assigned IPs retrieved successfully', type: [proxy_ip_schema_1.ProxyIp] }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getClientAssignedIps", null);
__decorate([
    (0, common_1.Get)('available-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get count of available IPs' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Available IP count retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getAvailableIpCount", null);
exports.IpManagementController = IpManagementController = __decorate([
    (0, swagger_1.ApiTags)('IP Management'),
    (0, common_1.Controller)('ip-management'),
    __metadata("design:paramtypes", [ip_management_service_1.IpManagementService])
], IpManagementController);
//# sourceMappingURL=ip-management.controller.js.map