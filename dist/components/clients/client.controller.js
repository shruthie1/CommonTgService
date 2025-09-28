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
const decorators_1 = require("../../decorators");
const interceptors_1 = require("../../interceptors");
let ClientController = class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return await this.clientService.create(createClientDto);
    }
    async search(query) {
        return await this.clientService.search(query);
    }
    async searchByPromoteMobile(mobile) {
        const result = await this.clientService.enhancedSearch({ promoteMobileNumber: mobile });
        return {
            clients: result.clients,
            matches: result.promoteMobileMatches || [],
            searchedMobile: mobile,
        };
    }
    async enhancedSearch(query) {
        const result = await this.clientService.enhancedSearch(query);
        return {
            clients: result.clients,
            searchType: result.searchType,
            promoteMobileMatches: result.promoteMobileMatches,
            totalResults: result.clients.length,
        };
    }
    async updateClient(clientId) {
        this.clientService.updateClient(clientId);
        return 'Update client initiated';
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
    async syncNpoint() {
        await this.clientService.checkNpoint();
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
    async addPromoteMobile(clientId, body) {
        return this.clientService.addPromoteMobile(clientId, body.mobileNumber);
    }
    async removePromoteMobile(clientId, body) {
        return await this.clientService.removePromoteMobile(clientId, body.mobileNumber);
    }
    async getClientIpInfo(clientId) {
        const client = await this.clientService.findOne(clientId);
        const needingAssignment = await this.clientService.getMobilesNeedingIpAssignment(clientId);
        const result = {
            clientId,
            mobiles: {
                mainMobile: undefined,
                promoteMobiles: [],
            },
            needingAssignment,
        };
        if (client.mobile) {
            const hasIp = await this.clientService.hasMobileAssignedIp(client.mobile);
            const ipAddress = hasIp ? await this.clientService.getIpForMobile(client.mobile) : undefined;
            result.mobiles.mainMobile = {
                mobile: client.mobile,
                hasIp,
                ipAddress: ipAddress || undefined,
            };
        }
        const promoteMobiles = await this.clientService.getPromoteMobiles(clientId);
        for (const mobile of promoteMobiles) {
            const hasIp = await this.clientService.hasMobileAssignedIp(mobile);
            const ipAddress = hasIp ? await this.clientService.getIpForMobile(mobile) : undefined;
            result.mobiles.promoteMobiles.push({
                mobile,
                hasIp,
                ipAddress: ipAddress || undefined,
            });
        }
        return result;
    }
    async getIpForMobile(mobile, clientId) {
        const ipAddress = await this.clientService.getIpForMobile(mobile, clientId);
        return {
            mobile,
            ipAddress,
            hasAssignment: ipAddress !== null,
        };
    }
    async autoAssignIpsToClient(clientId) {
        const result = await this.clientService.autoAssignIpsToClient(clientId);
        return {
            success: true,
            message: `Auto-assigned IPs to ${result.summary.assigned}/${result.summary.totalMobiles} mobiles`,
            data: result,
        };
    }
    async getMobilesNeedingIpAssignment(clientId) {
        const mobilesNeedingIps = await this.clientService.getMobilesNeedingIpAssignment(clientId);
        const totalNeedingAssignment = (mobilesNeedingIps.mainMobile ? 1 : 0) + mobilesNeedingIps.promoteMobiles.length;
        return {
            clientId,
            mobilesNeedingIps,
            summary: {
                totalNeedingAssignment,
                mainMobileNeedsIp: !!mobilesNeedingIps.mainMobile,
                promoteMobilesNeedingIp: mobilesNeedingIps.promoteMobiles.length,
            },
        };
    }
    async releaseIpFromMobile(mobile) {
        return await this.clientService.releaseIpFromMobile(mobile);
    }
};
exports.ClientController = ClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    (0, swagger_1.ApiBody)({ type: create_client_dto_1.CreateClientDto }),
    (0, swagger_1.ApiResponse)({ description: 'The user data has been successfully created.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_client_dto_1.CreateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Client ID' }),
    (0, swagger_1.ApiQuery)({ name: 'dbcoll', required: false, description: 'Database collection name' }),
    (0, swagger_1.ApiQuery)({ name: 'channelLink', required: false, description: 'Channel link' }),
    (0, swagger_1.ApiQuery)({ name: 'link', required: false, description: 'Client link' }),
    (0, swagger_1.ApiResponse)({ description: 'Matching user data returned successfully.', type: [client_schema_1.Client] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('search/promote-mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Search clients by promote mobile numbers' }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: true, description: 'Promote mobile number to search for' }),
    (0, swagger_1.ApiResponse)({
        description: 'Clients with matching promote mobiles returned successfully.',
        type: Object,
        schema: {
            properties: {
                clients: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
                matches: { type: 'array', items: { type: 'object', properties: { clientId: { type: 'string' }, mobile: { type: 'string' } } } },
                searchedMobile: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Query)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "searchByPromoteMobile", null);
__decorate([
    (0, common_1.Get)('search/enhanced'),
    (0, swagger_1.ApiOperation)({ summary: 'Enhanced search with promote mobile support' }),
    (0, swagger_1.ApiQuery)({ name: 'promoteMobileNumber', required: false, description: 'Promote mobile number to search for' }),
    (0, swagger_1.ApiQuery)({ name: 'hasPromoteMobiles', required: false, description: 'Filter by clients that have promote mobiles (true/false)' }),
    (0, swagger_1.ApiResponse)({
        description: 'Enhanced search results with promote mobile context.',
        type: Object,
        schema: {
            properties: {
                clients: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
                searchType: { type: 'string' },
                promoteMobileMatches: { type: 'array', items: { type: 'object', properties: { clientId: { type: 'string' }, mobile: { type: 'string' } } } },
                totalResults: { type: 'number' },
            },
        },
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "enhancedSearch", null);
__decorate([
    (0, common_1.Get)('updateClient/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ description: 'Return the user data.', type: String }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "updateClient", null);
__decorate([
    (0, common_1.Get)('maskedCls'),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data with masked fields' }),
    (0, swagger_1.ApiResponse)({ description: 'All user data returned successfully.', type: [client_schema_1.Client] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAllMasked", null);
__decorate([
    (0, common_1.Get)('maskedCls/:clientId'),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data with masked fields by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ description: 'User data returned successfully.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOneMasked", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    (0, swagger_1.ApiResponse)({ description: 'All user data returned successfully.', type: [client_schema_1.Client] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('sync-npoint'),
    (0, swagger_1.ApiOperation)({ summary: 'Sync clients with npoint service' }),
    (0, swagger_1.ApiResponse)({ description: 'Clients synchronized successfully with npoint.' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "syncNpoint", null);
__decorate([
    (0, common_1.Get)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ description: 'User data returned successfully.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiBody)({ type: update_client_dto_1.UpdateClientDto }),
    (0, swagger_1.ApiResponse)({ description: 'The user data has been successfully updated.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({ description: 'The user data has been successfully deleted.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({
        schema: {
            properties: {
                query: { type: 'object' },
                sort: { type: 'object' },
                limit: { type: 'number' },
                skip: { type: 'number' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ description: 'Query executed successfully.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "executeQuery", null);
__decorate([
    (0, common_1.Patch)(':clientId/promoteMobile/add'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a mobile number as a promote mobile for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'The unique identifier of the client' }),
    (0, swagger_1.ApiBody)({
        schema: {
            properties: {
                mobileNumber: { type: 'string', example: '916265240911' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ description: 'Mobile number assigned as promote mobile successfully.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "addPromoteMobile", null);
__decorate([
    (0, common_1.Patch)(':clientId/promoteMobile/remove'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a promote mobile assignment from a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'The unique identifier of the client' }),
    (0, swagger_1.ApiBody)({
        schema: {
            properties: {
                mobileNumber: { type: 'string', example: '916265240911' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ description: 'Promote mobile assignment removed successfully.', type: client_schema_1.Client }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "removePromoteMobile", null);
__decorate([
    (0, common_1.Get)(':clientId/ip-info'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP assignment information for a client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({
        description: 'IP information retrieved successfully',
        type: Object,
        schema: {
            properties: {
                clientId: { type: 'string' },
                mobiles: {
                    type: 'object',
                    properties: {
                        mainMobile: {
                            type: 'object',
                            properties: {
                                mobile: { type: 'string' },
                                hasIp: { type: 'boolean' },
                                ipAddress: { type: 'string' },
                            },
                        },
                        promoteMobiles: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    mobile: { type: 'string' },
                                    hasIp: { type: 'boolean' },
                                    ipAddress: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                needingAssignment: {
                    type: 'object',
                    properties: {
                        mainMobile: { type: 'string' },
                        promoteMobiles: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "getClientIpInfo", null);
__decorate([
    (0, common_1.Get)('mobile/:mobile/ip'),
    (0, swagger_1.ApiOperation)({ summary: 'Get IP address for a specific mobile number' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Client ID for context' }),
    (0, swagger_1.ApiResponse)({
        description: 'IP address retrieved successfully',
        type: Object,
        schema: {
            properties: {
                mobile: { type: 'string' },
                ipAddress: { type: 'string', nullable: true },
                hasAssignment: { type: 'boolean' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "getIpForMobile", null);
__decorate([
    (0, common_1.Post)(':clientId/auto-assign-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Auto-assign IPs to all client mobile numbers (Simplified System)' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({
        description: 'IPs assigned successfully',
        type: Object,
        schema: {
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: { type: 'object' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "autoAssignIpsToClient", null);
__decorate([
    (0, common_1.Get)(':clientId/mobiles-needing-ips'),
    (0, swagger_1.ApiOperation)({ summary: 'Get mobile numbers that need IP assignment' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'Client ID' }),
    (0, swagger_1.ApiResponse)({
        description: 'Mobile numbers needing IP assignment',
        type: Object,
        schema: {
            properties: {
                clientId: { type: 'string' },
                mobilesNeedingIps: {
                    type: 'object',
                    properties: {
                        mainMobile: { type: 'string' },
                        promoteMobiles: { type: 'array', items: { type: 'string' } },
                    },
                },
                summary: {
                    type: 'object',
                    properties: {
                        totalNeedingAssignment: { type: 'number' },
                        mainMobileNeedsIp: { type: 'boolean' },
                        promoteMobilesNeedingIp: { type: 'number' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "getMobilesNeedingIpAssignment", null);
__decorate([
    (0, common_1.Delete)('mobile/:mobile/ip'),
    (0, swagger_1.ApiOperation)({ summary: 'Release IP from a mobile number' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number to release IP from' }),
    (0, swagger_1.ApiResponse)({
        description: 'IP released successfully',
        type: Object,
        schema: {
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "releaseIpFromMobile", null);
exports.ClientController = ClientController = __decorate([
    (0, swagger_1.ApiTags)('Clients'),
    (0, common_1.Controller)('clients'),
    __metadata("design:paramtypes", [client_service_1.ClientService])
], ClientController);
//# sourceMappingURL=client.controller.js.map