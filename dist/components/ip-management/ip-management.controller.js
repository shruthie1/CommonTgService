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
const assign_ip_dto_1 = require("./dto/assign-ip.dto");
const proxy_ip_schema_1 = require("./schemas/proxy-ip.schema");
const ip_mobile_mapping_schema_1 = require("./schemas/ip-mobile-mapping.schema");
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
    async getIpForMobile(mobile) {
        try {
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);
            return { mobile, ipAddress };
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async assignIpToMobile(assignDto) {
        try {
            return await this.ipManagementService.assignIpToMobile(assignDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async bulkAssignIps(bulkAssignDto) {
        try {
            return await this.ipManagementService.bulkAssignIpsToMobiles(bulkAssignDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async releaseIpFromMobile(mobile, releaseDto) {
        try {
            releaseDto.mobile = mobile;
            await this.ipManagementService.releaseIpFromMobile(releaseDto);
            return { message: 'IP released successfully' };
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getClientMappings(clientId) {
        try {
            return await this.ipManagementService.getClientMobileMappings(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getStatistics() {
        try {
            return await this.ipManagementService.getStats();
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
    (0, common_1.Get)('mappings/mobile/:mobile/ip'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP address assigned to a mobile number' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number' }),
    (0, swagger_1.ApiOkResponse)({ description: 'IP address found' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'No IP assigned to this mobile' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getIpForMobile", null);
__decorate([
    (0, common_1.Post)('assign'),
    (0, swagger_1.ApiOperation)({ summary: 'Assign an IP to a mobile number' }),
    (0, swagger_1.ApiBody)({ type: assign_ip_dto_1.AssignIpToMobileDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'IP assigned successfully', type: ip_mobile_mapping_schema_1.IpMobileMapping }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Assignment failed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [assign_ip_dto_1.AssignIpToMobileDto]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "assignIpToMobile", null);
__decorate([
    (0, common_1.Post)('assign/bulk'),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk assign IPs to multiple mobile numbers' }),
    (0, swagger_1.ApiBody)({ type: assign_ip_dto_1.BulkAssignIpDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'Bulk assignment completed' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [assign_ip_dto_1.BulkAssignIpDto]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "bulkAssignIps", null);
__decorate([
    (0, common_1.Delete)('assign/mobile/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Release IP from a mobile number' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number' }),
    (0, swagger_1.ApiBody)({ type: assign_ip_dto_1.ReleaseIpFromMobileDto }),
    (0, swagger_1.ApiOkResponse)({ description: 'IP released successfully' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'No IP assignment found for mobile' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_ip_dto_1.ReleaseIpFromMobileDto]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "releaseIpFromMobile", null);
__decorate([
    (0, common_1.Get)('clients/:clientId/mappings'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all mobile mappings for a client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Client mappings retrieved successfully', type: [ip_mobile_mapping_schema_1.IpMobileMapping] }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getClientMappings", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP management statistics' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Statistics retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IpManagementController.prototype, "getStatistics", null);
exports.IpManagementController = IpManagementController = __decorate([
    (0, swagger_1.ApiTags)('IP Management'),
    (0, common_1.Controller)('ip-management'),
    __metadata("design:paramtypes", [ip_management_service_1.IpManagementService])
], IpManagementController);
//# sourceMappingURL=ip-management.controller.js.map