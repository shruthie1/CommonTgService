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
const utils_1 = require("../../utils");
let ClientIpIntegrationService = ClientIpIntegrationService_1 = class ClientIpIntegrationService {
    constructor(clientService, promoteClientService, ipManagementService) {
        this.clientService = clientService;
        this.promoteClientService = promoteClientService;
        this.ipManagementService = ipManagementService;
        this.logger = new utils_1.Logger(ClientIpIntegrationService_1.name);
    }
    async getPromoteMobiles(clientId) {
        return await this.clientService.getPromoteMobiles(clientId);
    }
    async autoAssignIpsToClient(clientId) {
        if (!clientId || clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required');
        }
        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);
        try {
            const client = await this.clientService.findOne(clientId);
            if (!client) {
                throw new common_1.NotFoundException(`Client ${clientId} not found`);
            }
            if (!client.mobile || client.mobile.trim() === '') {
                throw new common_1.BadRequestException(`Client ${clientId} does not have a valid main mobile number`);
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
                this.logger.debug(`Successfully assigned IP ${mainMapping.ipAddress} to main mobile ${client.mobile}`);
            }
            catch (error) {
                mainMobileResult = {
                    mobile: client.mobile,
                    ipAddress: null,
                    status: 'failed'
                };
                const errorMsg = `Main mobile ${client.mobile}: ${error.message}`;
                errors.push(errorMsg);
                failed++;
                this.logger.error(errorMsg);
            }
            const promoteMobileResults = [];
            try {
                const promoteMobiles = await this.getPromoteMobiles(clientId);
                this.logger.debug(`Found ${promoteMobiles.length} promote mobiles for client ${clientId}`);
                for (const promoteMobile of promoteMobiles) {
                    if (!promoteMobile || promoteMobile.trim() === '') {
                        const errorMsg = `Invalid promote mobile: empty or null`;
                        errors.push(errorMsg);
                        failed++;
                        promoteMobileResults.push({
                            mobile: promoteMobile,
                            ipAddress: null,
                            status: 'failed'
                        });
                        continue;
                    }
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
                        this.logger.debug(`Successfully assigned IP ${promoteMapping.ipAddress} to promote mobile ${promoteMobile}`);
                    }
                    catch (error) {
                        promoteMobileResults.push({
                            mobile: promoteMobile,
                            ipAddress: null,
                            status: 'failed'
                        });
                        const errorMsg = `Promote mobile ${promoteMobile}: ${error.message}`;
                        errors.push(errorMsg);
                        failed++;
                        this.logger.error(errorMsg);
                    }
                }
            }
            catch (error) {
                const errorMsg = `Failed to retrieve promote mobiles for client ${clientId}: ${error.message}`;
                errors.push(errorMsg);
                this.logger.error(errorMsg);
            }
            const totalMobiles = 1 + promoteMobileResults.length;
            this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned, ${failed} failed`);
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
        catch (error) {
            this.logger.error(`Failed to auto-assign IPs for client ${clientId}: ${error.message}`);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to auto-assign IPs for client ${clientId}: ${error.message}`);
        }
    }
    async getIpForMobile(mobile, clientId, autoAssign = false) {
        if (!mobile || mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.debug(`Getting IP for mobile: ${mobile} (clientId: ${clientId}, autoAssign: ${autoAssign})`);
        try {
            const existingIp = await this.ipManagementService.getIpForMobile(mobile);
            if (existingIp) {
                this.logger.debug(`Found existing IP mapping for ${mobile}: ${existingIp}`);
                return existingIp;
            }
            if (autoAssign && clientId) {
                const client = await this.clientService.findOne(clientId);
                if (client) {
                    const isMainMobile = mobile === client.mobile;
                    const { isPromote } = await this.clientService.isPromoteMobile(mobile);
                    if (isMainMobile || isPromote) {
                        this.logger.debug(`Mobile ${mobile} belongs to client ${clientId} as ${isMainMobile ? 'main' : 'promote'} mobile - attempting auto-assignment`);
                        try {
                            const mapping = await this.ipManagementService.assignIpToMobile({
                                mobile,
                                clientId
                            });
                            this.logger.log(`Auto-assigned IP ${mapping.ipAddress} to mobile ${mobile}`);
                            return mapping.ipAddress;
                        }
                        catch (assignError) {
                            this.logger.warn(`Failed to auto-assign IP to mobile ${mobile}: ${assignError.message}`);
                        }
                    }
                    else {
                        this.logger.debug(`Mobile ${mobile} does not belong to client ${clientId}`);
                    }
                }
                else {
                    this.logger.warn(`Client ${clientId} not found`);
                }
            }
            return null;
        }
        catch (error) {
            this.logger.error(`Error getting IP for mobile ${mobile}: ${error.message}`);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to get IP for mobile ${mobile}`);
        }
    }
    async getClientIpSummary(clientId) {
        if (!clientId || clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required');
        }
        this.logger.debug(`Getting IP summary for client: ${clientId}`);
        try {
            const client = await this.clientService.findOne(clientId);
            if (!client) {
                throw new common_1.NotFoundException(`Client ${clientId} not found`);
            }
            const clientIpInfo = await this.clientService.getClientIpInfo(clientId);
            if (!clientIpInfo || !clientIpInfo.mainMobile) {
                throw new common_1.BadRequestException(`Invalid client IP info structure for client ${clientId}`);
            }
            const mainMobile = {
                mobile: client.mobile,
                ipAddress: clientIpInfo.mainMobile.ipAddress,
                type: 'main',
                status: clientIpInfo.mainMobile.hasIp ? 'assigned' : 'unassigned'
            };
            const promoteMobilesData = (clientIpInfo.promoteMobiles || []).map(pm => {
                if (!pm || typeof pm.mobile !== 'string') {
                    this.logger.warn(`Invalid promote mobile data found for client ${clientId}`);
                    return null;
                }
                return {
                    mobile: pm.mobile,
                    ipAddress: pm.ipAddress,
                    type: 'promote',
                    status: pm.hasIp ? 'assigned' : 'unassigned'
                };
            }).filter(pm => pm !== null);
            const totalMobiles = clientIpInfo.summary?.totalMobiles || (1 + promoteMobilesData.length);
            const assignedMobiles = clientIpInfo.summary?.mobilesWithIp || 0;
            const unassignedMobiles = clientIpInfo.summary?.mobilesWithoutIp || (totalMobiles - assignedMobiles);
            return {
                clientId,
                clientName: client.name || 'Unknown Client',
                mainMobile,
                promoteMobiles: promoteMobilesData,
                dedicatedIps: clientIpInfo.dedicatedIps || [],
                statistics: {
                    totalMobiles,
                    assignedMobiles,
                    unassignedMobiles,
                    totalDedicatedIps: (clientIpInfo.dedicatedIps || []).length
                }
            };
        }
        catch (error) {
            this.logger.error(`Failed to get IP summary for client ${clientId}: ${error.message}`);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to get IP summary for client ${clientId}: ${error.message}`);
        }
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
        if (!mobile || mobile.trim() === '') {
            return 'unknown';
        }
        if (!clientId) {
            try {
                const mappings = await this.ipManagementService.getClientMobileMappings(clientId);
                const mapping = mappings.find(m => m.mobile === mobile);
                if (mapping) {
                    clientId = mapping.clientId;
                }
                else {
                    return 'unknown';
                }
            }
            catch (error) {
                this.logger.debug(`Could not determine clientId for mobile ${mobile}: ${error.message}`);
                return 'unknown';
            }
        }
        try {
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
        catch (error) {
            this.logger.error(`Error determining mobile type for ${mobile}: ${error.message}`);
            return 'unknown';
        }
    }
    async releaseIpFromMobile(mobile, clientId) {
        if (!mobile || mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.debug(`Releasing IP from mobile: ${mobile}`);
        try {
            const currentIp = await this.ipManagementService.getIpForMobile(mobile);
            if (!currentIp) {
                return {
                    mobile,
                    releasedIp: null,
                    status: 'no_ip_assigned',
                    message: `No IP assigned to mobile ${mobile}`
                };
            }
            await this.ipManagementService.releaseIpFromMobile({ mobile });
            this.logger.log(`Successfully released IP ${currentIp} from mobile ${mobile}`);
            return {
                mobile,
                releasedIp: currentIp,
                status: 'released',
                message: `Successfully released IP ${currentIp} from mobile ${mobile}`
            };
        }
        catch (error) {
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to release IP from mobile ${mobile}: ${error.message}`);
        }
    }
    async checkMobileIpStatus(mobile) {
        if (!mobile || mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        try {
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);
            const hasIp = ipAddress !== null;
            let mobileType = 'unknown';
            let clientId;
            if (hasIp) {
                try {
                    mobileType = await this.getMobileType(mobile);
                }
                catch (error) {
                    this.logger.debug(`Could not determine mobile type for ${mobile}: ${error.message}`);
                }
            }
            return {
                mobile,
                hasIp,
                ipAddress,
                mobileType,
                clientId
            };
        }
        catch (error) {
            this.logger.error(`Error checking IP status for mobile ${mobile}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to check IP status for mobile ${mobile}: ${error.message}`);
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