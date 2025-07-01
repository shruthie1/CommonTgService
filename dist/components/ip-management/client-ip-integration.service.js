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
var ClientIpIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientIpIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const client_service_1 = require("../clients/client.service");
const promote_client_service_1 = require("../promote-clients/promote-client.service");
const ip_management_service_1 = require("./ip-management.service");
let ClientIpIntegrationService = ClientIpIntegrationService_1 = class ClientIpIntegrationService {
    constructor(clientService, promoteClientService, ipManagementService) {
        this.clientService = clientService;
        this.promoteClientService = promoteClientService;
        this.ipManagementService = ipManagementService;
        this.logger = new common_1.Logger(ClientIpIntegrationService_1.name);
    }
    async getPromoteMobiles(clientId) {
        return await this.clientService.getPromoteMobiles(clientId);
    }
    async autoAssignIpsToClient(clientId) {
        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        const errors = [];
        let assigned = 0;
        let failed = 0;
        let mainMobileResult;
        try {
            const mainMapping = await this.ipManagementService.assignIpToMobile({
                mobile: client.mobile,
                clientId: client.clientId
            });
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: mainMapping.ipAddress,
                status: 'assigned'
            };
            assigned++;
        }
        catch (error) {
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: null,
                status: 'failed'
            };
            errors.push(`Main mobile ${client.mobile}: ${error.message}`);
            failed++;
        }
        const promoteMobileResults = [];
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const promoteMobile of promoteMobiles) {
            try {
                const promoteMapping = await this.ipManagementService.assignIpToMobile({
                    mobile: promoteMobile,
                    clientId: client.clientId
                });
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: promoteMapping.ipAddress,
                    status: 'assigned'
                });
                assigned++;
            }
            catch (error) {
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: null,
                    status: 'failed'
                });
                errors.push(`Promote mobile ${promoteMobile}: ${error.message}`);
                failed++;
            }
        }
        const totalMobiles = 1 + promoteMobiles.length;
        this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned`);
        return {
            clientId,
            mainMobile: mainMobileResult,
            promoteMobiles: promoteMobileResults,
            summary: {
                totalMobiles,
                assigned,
                failed,
                errors
            }
        };
    }
    async getIpForMobile(mobile, clientId) {
        this.logger.debug(`Getting IP for mobile: ${mobile} (clientId: ${clientId})`);
        const existingIp = await this.ipManagementService.getIpForMobile(mobile);
        if (existingIp) {
            this.logger.debug(`Found existing IP mapping for ${mobile}: ${existingIp}`);
            return existingIp;
        }
        if (clientId) {
            const client = await this.clientService.findOne(clientId);
            if (client) {
                const isMainMobile = mobile === client.mobile;
                const { isPromote } = await this.clientService.isPromoteMobile(mobile);
                if (isMainMobile || isPromote) {
                    this.logger.debug(`Mobile ${mobile} belongs to client ${clientId} as ${isMainMobile ? 'main' : 'promote'} mobile`);
                }
            }
        }
        return null;
    }
    async getClientIpSummary(clientId) {
        this.logger.debug(`Getting IP summary for client: ${clientId}`);
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        const clientIpInfo = await this.clientService.getClientIpInfo(clientId);
        const mainMobile = {
            mobile: client.mobile,
            ipAddress: clientIpInfo.mainMobile.ipAddress,
            type: 'main',
            status: clientIpInfo.mainMobile.hasIp ? 'assigned' : 'unassigned'
        };
        const promoteMobilesData = clientIpInfo.promoteMobiles.map(pm => ({
            mobile: pm.mobile,
            ipAddress: pm.ipAddress,
            type: 'promote',
            status: pm.hasIp ? 'assigned' : 'unassigned'
        }));
        const totalMobiles = clientIpInfo.summary.totalMobiles;
        const assignedMobiles = clientIpInfo.summary.mobilesWithIp;
        const unassignedMobiles = clientIpInfo.summary.mobilesWithoutIp;
        return {
            clientId,
            clientName: client.name,
            mainMobile,
            promoteMobiles: promoteMobilesData,
            dedicatedIps: clientIpInfo.dedicatedIps,
            statistics: {
                totalMobiles,
                assignedMobiles,
                unassignedMobiles,
                totalDedicatedIps: clientIpInfo.dedicatedIps.length
            }
        };
    }
    async assignIpToMainMobile(clientId, mobile, preferredCountry) {
        this.logger.debug(`Assigning IP to main mobile ${mobile} for client ${clientId}`);
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        if (client.mobile !== mobile) {
            throw new common_1.BadRequestException(`Mobile ${mobile} is not the main mobile for client ${clientId}`);
        }
        const mapping = await this.ipManagementService.assignIpToMobile({
            mobile,
            clientId
        });
        return {
            clientId,
            mobile,
            mobileType: 'main',
            ipAddress: mapping.ipAddress,
            status: 'assigned'
        };
    }
    async assignIpsToPromoteMobiles(clientId, promoteMobiles, preferredCountry) {
        this.logger.debug(`Assigning IPs to ${promoteMobiles.length} promote mobiles for client ${clientId}`);
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        const clientPromoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of promoteMobiles) {
            if (!clientPromoteMobiles.includes(mobile)) {
                throw new common_1.BadRequestException(`Mobile ${mobile} is not a promote mobile for client ${clientId}`);
            }
        }
        const bulkResult = await this.ipManagementService.bulkAssignIpsToMobiles({
            mobiles: promoteMobiles,
            clientId
        });
        const results = bulkResult.results.map(result => ({
            mobile: result.mobile,
            mobileType: 'promote',
            ipAddress: result.ipAddress,
            status: result.ipAddress ? 'assigned' : 'failed',
            error: result.error
        }));
        return {
            clientId,
            assigned: bulkResult.assigned,
            failed: bulkResult.failed,
            results
        };
    }
    async getMobileType(mobile, clientId) {
        if (!clientId) {
            const existingIp = await this.ipManagementService.getIpForMobile(mobile);
            if (!existingIp) {
                return 'unknown';
            }
            return 'unknown';
        }
        const client = await this.clientService.findOne(clientId);
        if (!client) {
            return 'unknown';
        }
        if (mobile === client.mobile) {
            return 'main';
        }
        else {
            const { isPromote } = await this.clientService.isPromoteMobile(mobile);
            return isPromote ? 'promote' : 'unknown';
        }
    }
};
exports.ClientIpIntegrationService = ClientIpIntegrationService;
exports.ClientIpIntegrationService = ClientIpIntegrationService = ClientIpIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_client_service_1.PromoteClientService))),
    __metadata("design:paramtypes", [client_service_1.ClientService,
        promote_client_service_1.PromoteClientService,
        ip_management_service_1.IpManagementService])
], ClientIpIntegrationService);
//# sourceMappingURL=client-ip-integration.service.js.map