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
var IpManagementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpManagementService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const proxy_ip_schema_1 = require("./schemas/proxy-ip.schema");
const ip_mobile_mapping_schema_1 = require("./schemas/ip-mobile-mapping.schema");
let IpManagementService = IpManagementService_1 = class IpManagementService {
    constructor(proxyIpModel, ipMobileMappingModel) {
        this.proxyIpModel = proxyIpModel;
        this.ipMobileMappingModel = ipMobileMappingModel;
        this.logger = new common_1.Logger(IpManagementService_1.name);
    }
    async createProxyIp(createProxyIpDto) {
        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);
        const existingIp = await this.proxyIpModel.findOne({
            ipAddress: createProxyIpDto.ipAddress,
            port: createProxyIpDto.port
        });
        if (existingIp) {
            throw new common_1.ConflictException(`Proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port} already exists`);
        }
        const createdIp = new this.proxyIpModel(createProxyIpDto);
        const savedIp = await createdIp.save();
        this.logger.log(`Created proxy IP: ${savedIp.ipAddress}:${savedIp.port}`);
        return savedIp.toJSON();
    }
    async bulkCreateProxyIps(proxyIps) {
        this.logger.debug(`Bulk creating ${proxyIps.length} proxy IPs`);
        let created = 0;
        let failed = 0;
        const errors = [];
        for (const ipDto of proxyIps) {
            try {
                await this.createProxyIp(ipDto);
                created++;
            }
            catch (error) {
                failed++;
                errors.push(`${ipDto.ipAddress}:${ipDto.port} - ${error.message}`);
            }
        }
        this.logger.log(`Bulk creation completed: ${created} created, ${failed} failed`);
        return { created, failed, errors };
    }
    async findAllProxyIps() {
        return this.proxyIpModel.find().lean();
    }
    async getAvailableProxyIps() {
        return this.proxyIpModel.find({
            status: 'active',
            isAssigned: false
        }).lean();
    }
    async updateProxyIp(ipAddress, port, updateDto) {
        this.logger.debug(`Updating proxy IP: ${ipAddress}:${port}`);
        const updatedIp = await this.proxyIpModel.findOneAndUpdate({ ipAddress, port }, { $set: updateDto }, { new: true }).lean();
        if (!updatedIp) {
            throw new common_1.NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }
        this.logger.log(`Updated proxy IP: ${ipAddress}:${port}`);
        return updatedIp;
    }
    async deleteProxyIp(ipAddress, port) {
        this.logger.debug(`Deleting proxy IP: ${ipAddress}:${port}`);
        const mapping = await this.ipMobileMappingModel.findOne({
            ipAddress: `${ipAddress}:${port}`,
            status: 'active'
        });
        if (mapping) {
            throw new common_1.BadRequestException(`Cannot delete IP ${ipAddress}:${port} - it is currently assigned to mobile ${mapping.mobile}`);
        }
        const result = await this.proxyIpModel.deleteOne({ ipAddress, port });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }
        this.logger.log(`Deleted proxy IP: ${ipAddress}:${port}`);
    }
    async getIpForMobile(mobile) {
        this.logger.debug(`Getting IP for mobile: ${mobile}`);
        const mapping = await this.ipMobileMappingModel.findOne({
            mobile,
            status: 'active'
        }).lean();
        return mapping ? mapping.ipAddress : null;
    }
    async assignIpToMobile(assignDto) {
        this.logger.debug(`Assigning IP to mobile: ${assignDto.mobile}`);
        const existingMapping = await this.ipMobileMappingModel.findOne({
            mobile: assignDto.mobile,
            status: 'active'
        });
        if (existingMapping) {
            this.logger.debug(`Mobile ${assignDto.mobile} already has IP: ${existingMapping.ipAddress}`);
            return existingMapping;
        }
        let selectedIp;
        if (assignDto.preferredIp) {
            const [ipAddress, portStr] = assignDto.preferredIp.split(':');
            const port = parseInt(portStr);
            selectedIp = await this.proxyIpModel.findOne({
                ipAddress,
                port,
                status: 'active',
                isAssigned: false
            }).lean();
            if (!selectedIp) {
                throw new common_1.NotFoundException(`Preferred IP ${assignDto.preferredIp} not available`);
            }
        }
        else {
            selectedIp = await this.proxyIpModel.findOne({
                status: 'active',
                isAssigned: false
            }).lean();
            if (!selectedIp) {
                throw new common_1.NotFoundException('No available proxy IPs');
            }
        }
        const mappingDto = {
            mobile: assignDto.mobile,
            ipAddress: `${selectedIp.ipAddress}:${selectedIp.port}`,
            clientId: assignDto.clientId,
            status: 'active'
        };
        const [newMapping] = await Promise.all([
            this.ipMobileMappingModel.create(mappingDto),
            this.proxyIpModel.updateOne({ ipAddress: selectedIp.ipAddress, port: selectedIp.port }, { $set: { isAssigned: true, assignedToClient: assignDto.clientId } })
        ]);
        this.logger.log(`Assigned IP ${mappingDto.ipAddress} to mobile ${assignDto.mobile}`);
        return newMapping.toJSON();
    }
    async bulkAssignIpsToMobiles(bulkDto) {
        this.logger.debug(`Bulk assigning IPs to ${bulkDto.mobiles.length} mobiles`);
        let assigned = 0;
        let failed = 0;
        const results = [];
        for (const mobile of bulkDto.mobiles) {
            try {
                const assignDto = {
                    mobile,
                    clientId: bulkDto.clientId
                };
                const mapping = await this.assignIpToMobile(assignDto);
                assigned++;
                results.push({ mobile, ipAddress: mapping.ipAddress });
            }
            catch (error) {
                failed++;
                results.push({ mobile, error: error.message });
            }
        }
        this.logger.log(`Bulk assignment completed: ${assigned} assigned, ${failed} failed`);
        return { assigned, failed, results };
    }
    async releaseIpFromMobile(releaseDto) {
        this.logger.debug(`Releasing IP from mobile: ${releaseDto.mobile}`);
        const mapping = await this.ipMobileMappingModel.findOne({
            mobile: releaseDto.mobile,
            status: 'active'
        });
        if (!mapping) {
            throw new common_1.NotFoundException(`No active IP mapping found for mobile: ${releaseDto.mobile}`);
        }
        const [ipAddress, portStr] = mapping.ipAddress.split(':');
        const port = parseInt(portStr);
        await Promise.all([
            this.ipMobileMappingModel.updateOne({ mobile: releaseDto.mobile }, { $set: { status: 'inactive' } }),
            this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { isAssigned: false }, $unset: { assignedToClient: 1 } })
        ]);
        this.logger.log(`Released IP ${mapping.ipAddress} from mobile ${releaseDto.mobile}`);
    }
    async getClientMobileMappings(clientId) {
        return this.ipMobileMappingModel.find({
            clientId,
            status: 'active'
        }).lean();
    }
    async getStats() {
        const [total, available, assigned, inactive] = await Promise.all([
            this.proxyIpModel.countDocuments(),
            this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
            this.proxyIpModel.countDocuments({ isAssigned: true }),
            this.proxyIpModel.countDocuments({ status: 'inactive' })
        ]);
        return { total, available, assigned, inactive };
    }
};
exports.IpManagementService = IpManagementService;
exports.IpManagementService = IpManagementService = IpManagementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(proxy_ip_schema_1.ProxyIp.name)),
    __param(1, (0, mongoose_1.InjectModel)(ip_mobile_mapping_schema_1.IpMobileMapping.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], IpManagementService);
//# sourceMappingURL=ip-management.service.js.map