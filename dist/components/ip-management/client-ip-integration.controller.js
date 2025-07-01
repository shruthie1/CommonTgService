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
exports.ClientIpIntegrationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_ip_integration_service_1 = require("./client-ip-integration.service");
let ClientIpIntegrationController = class ClientIpIntegrationController {
    constructor(clientIpIntegrationService) {
        this.clientIpIntegrationService = clientIpIntegrationService;
    }
    async autoAssignIpsToClient(clientId) {
        try {
            return await this.clientIpIntegrationService.autoAssignIpsToClient(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getIpForMobile(mobile, clientId) {
        try {
            const ipAddress = await this.clientIpIntegrationService.getIpForMobile(mobile, clientId);
            const source = ipAddress ? 'existing_mapping' : 'not_found';
            return { mobile, ipAddress, source };
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getClientIpSummary(clientId) {
        try {
            return await this.clientIpIntegrationService.getClientIpSummary(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async autoAssignAllIpsViaClientService(clientId) {
        try {
            return await this.clientIpIntegrationService.autoAssignIpsToClient(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async assignIpToMainMobile(clientId, body) {
        try {
            return await this.clientIpIntegrationService.assignIpToMainMobile(clientId, body.mobile, body.preferredCountry);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async assignIpsToPromoteMobiles(clientId, body) {
        try {
            return await this.clientIpIntegrationService.assignIpsToPromoteMobiles(clientId, body.promoteMobiles, body.preferredCountry);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.ClientIpIntegrationController = ClientIpIntegrationController;
__decorate([
    (0, common_1.Post)('clients/:clientId/auto-assign-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Auto-assign IPs to all client mobile numbers' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'IPs assigned successfully' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "autoAssignIpsToClient", null);
__decorate([
    (0, common_1.Get)('mobile/:mobile/ip'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP assigned to a mobile number with smart assignment' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', description: 'Optional client ID for context', required: false }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'IP address retrieved or assigned' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "getIpForMobile", null);
__decorate([
    (0, common_1.Get)('clients/:clientId/ip-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Get comprehensive IP information for a client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Client IP summary retrieved successfully' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "getClientIpSummary", null);
__decorate([
    (0, common_1.Post)('clients/:clientId/auto-assign-all-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Auto-assign IPs to all client mobile numbers (alternative endpoint)' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'IPs auto-assigned using ClientService' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "autoAssignAllIpsViaClientService", null);
__decorate([
    (0, common_1.Post)('clients/:clientId/assign-main-mobile-ip'),
    (0, swagger_1.ApiOperation)({ summary: 'Assign IP to client main mobile number' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                mobile: { type: 'string', description: 'Mobile number' },
                preferredCountry: { type: 'string', description: 'Preferred country code' }
            },
            required: ['mobile']
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'IP assigned to main mobile' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "assignIpToMainMobile", null);
__decorate([
    (0, common_1.Post)('clients/:clientId/assign-promote-mobiles-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Assign IPs to client promote mobile numbers' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                promoteMobiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of promote mobile numbers'
                },
                preferredCountry: { type: 'string', description: 'Preferred country code' }
            },
            required: ['promoteMobiles']
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'IPs assigned to promote mobiles' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ClientIpIntegrationController.prototype, "assignIpsToPromoteMobiles", null);
exports.ClientIpIntegrationController = ClientIpIntegrationController = __decorate([
    (0, swagger_1.ApiTags)('Client IP Integration'),
    (0, common_1.Controller)('client-ip-integration'),
    __metadata("design:paramtypes", [client_ip_integration_service_1.ClientIpIntegrationService])
], ClientIpIntegrationController);
//# sourceMappingURL=client-ip-integration.controller.js.map