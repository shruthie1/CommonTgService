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
const utils_1 = require("../../utils");
let IpManagementService = IpManagementService_1 = class IpManagementService {
    constructor(proxyIpModel, ipMobileMappingModel) {
        this.proxyIpModel = proxyIpModel;
        this.ipMobileMappingModel = ipMobileMappingModel;
        this.logger = new utils_1.Logger(IpManagementService_1.name);
    }
    async createProxyIp(createProxyIpDto) {
        if (!createProxyIpDto.ipAddress || !createProxyIpDto.port) {
            throw new common_1.BadRequestException('IP address and port are required');
        }
        if (createProxyIpDto.port < 1 || createProxyIpDto.port > 65535) {
            throw new common_1.BadRequestException('Port must be between 1 and 65535');
        }
        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);
        try {
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
        catch (error) {
            if (error instanceof common_1.ConflictException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to create proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to create proxy IP: ${error.message}`);
        }
    }
    async bulkCreateProxyIps(proxyIps) {
        if (!proxyIps || proxyIps.length === 0) {
            throw new common_1.BadRequestException('No proxy IPs provided for bulk creation');
        }
        this.logger.debug(`Bulk creating ${proxyIps.length} proxy IPs`);
        let created = 0;
        let failed = 0;
        const errors = [];
        const batchSize = 10;
        for (let i = 0; i < proxyIps.length; i += batchSize) {
            const batch = proxyIps.slice(i, i + batchSize);
            for (const ipDto of batch) {
                try {
                    if (!ipDto.ipAddress || !ipDto.port) {
                        failed++;
                        errors.push(`Invalid IP data: missing address or port`);
                        continue;
                    }
                    await this.createProxyIp(ipDto);
                    created++;
                }
                catch (error) {
                    failed++;
                    errors.push(`${ipDto.ipAddress}:${ipDto.port} - ${error.message}`);
                }
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
        if (!mobile || mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.debug(`Getting IP for mobile: ${mobile}`);
        try {
            const mapping = await this.ipMobileMappingModel.findOne({
                mobile: mobile.trim(),
                status: 'active'
            }).lean();
            return mapping ? mapping.ipAddress : null;
        }
        catch (error) {
            this.logger.error(`Error getting IP for mobile ${mobile}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to get IP for mobile: ${error.message}`);
        }
    }
    async assignIpToMobile(assignDto) {
        if (!assignDto.mobile || assignDto.mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (!assignDto.clientId || assignDto.clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required');
        }
        const mobile = assignDto.mobile.trim();
        const clientId = assignDto.clientId.trim();
        this.logger.debug(`Assigning IP to mobile: ${mobile}`);
        try {
            const existingMapping = await this.ipMobileMappingModel.findOne({
                mobile,
                status: 'active'
            });
            if (existingMapping) {
                this.logger.debug(`Mobile ${mobile} already has IP: ${existingMapping.ipAddress}`);
                return existingMapping;
            }
            let selectedIp;
            if (assignDto.preferredIp) {
                const [ipAddress, portStr] = assignDto.preferredIp.split(':');
                const port = parseInt(portStr);
                if (isNaN(port)) {
                    throw new common_1.BadRequestException(`Invalid port in preferred IP: ${assignDto.preferredIp}`);
                }
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
                let retries = 3;
                while (retries > 0 && !selectedIp) {
                    selectedIp = await this.proxyIpModel.findOne({
                        status: 'active',
                        isAssigned: false
                    }).lean();
                    if (!selectedIp) {
                        break;
                    }
                    const updateResult = await this.proxyIpModel.updateOne({
                        ipAddress: selectedIp.ipAddress,
                        port: selectedIp.port,
                        isAssigned: false
                    }, {
                        $set: {
                            isAssigned: true,
                            assignedToClient: clientId
                        }
                    });
                    if (updateResult.modifiedCount === 0) {
                        selectedIp = null;
                        retries--;
                        continue;
                    }
                    break;
                }
                if (!selectedIp) {
                    throw new common_1.NotFoundException('No available proxy IPs');
                }
            }
            const mappingDto = {
                mobile,
                ipAddress: `${selectedIp.ipAddress}:${selectedIp.port}`,
                clientId,
                status: 'active'
            };
            let newMapping;
            if (assignDto.preferredIp) {
                const [mapping] = await Promise.all([
                    this.ipMobileMappingModel.create(mappingDto),
                    this.proxyIpModel.updateOne({ ipAddress: selectedIp.ipAddress, port: selectedIp.port }, { $set: { isAssigned: true, assignedToClient: clientId } })
                ]);
                newMapping = mapping;
            }
            else {
                newMapping = await this.ipMobileMappingModel.create(mappingDto);
            }
            this.logger.log(`Assigned IP ${mappingDto.ipAddress} to mobile ${mobile}`);
            return newMapping.toObject ? newMapping.toObject() : newMapping;
        }
        catch (error) {
            this.logger.error(`Failed to assign IP to mobile ${mobile}: ${error.message}`);
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to assign IP to mobile: ${error.message}`);
        }
    }
    async bulkAssignIpsToMobiles(bulkDto) {
        if (!bulkDto.mobiles || bulkDto.mobiles.length === 0) {
            throw new common_1.BadRequestException('No mobiles provided for bulk assignment');
        }
        if (!bulkDto.clientId || bulkDto.clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required for bulk assignment');
        }
        this.logger.debug(`Bulk assigning IPs to ${bulkDto.mobiles.length} mobiles`);
        let assigned = 0;
        let failed = 0;
        const results = [];
        const batchSize = 5;
        for (let i = 0; i < bulkDto.mobiles.length; i += batchSize) {
            const batch = bulkDto.mobiles.slice(i, i + batchSize);
            for (const mobile of batch) {
                if (!mobile || mobile.trim() === '') {
                    failed++;
                    results.push({ mobile: mobile || 'undefined', error: 'Invalid mobile number' });
                    continue;
                }
                try {
                    const assignDto = {
                        mobile: mobile.trim(),
                        clientId: bulkDto.clientId.trim()
                    };
                    const mapping = await this.assignIpToMobile(assignDto);
                    assigned++;
                    results.push({ mobile: mobile.trim(), ipAddress: mapping.ipAddress });
                }
                catch (error) {
                    failed++;
                    results.push({ mobile: mobile.trim(), error: error.message });
                    this.logger.warn(`Failed to assign IP to mobile ${mobile}: ${error.message}`);
                }
            }
        }
        this.logger.log(`Bulk assignment completed: ${assigned} assigned, ${failed} failed`);
        return { assigned, failed, results };
    }
    async releaseIpFromMobile(releaseDto) {
        if (!releaseDto.mobile || releaseDto.mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        const mobile = releaseDto.mobile.trim();
        this.logger.debug(`Releasing IP from mobile: ${mobile}`);
        try {
            const mapping = await this.ipMobileMappingModel.findOne({
                mobile,
                status: 'active'
            });
            if (!mapping) {
                throw new common_1.NotFoundException(`No active IP mapping found for mobile: ${mobile}`);
            }
            const [ipAddress, portStr] = mapping.ipAddress.split(':');
            const port = parseInt(portStr);
            if (isNaN(port)) {
                this.logger.error(`Invalid port in IP address: ${mapping.ipAddress}`);
                throw new common_1.BadRequestException(`Invalid IP address format: ${mapping.ipAddress}`);
            }
            await Promise.all([
                this.ipMobileMappingModel.updateOne({ mobile, status: 'active' }, { $set: { status: 'inactive' } }),
                this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { isAssigned: false }, $unset: { assignedToClient: 1 } })
            ]);
            this.logger.log(`Released IP ${mapping.ipAddress} from mobile ${mobile}`);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to release IP from mobile: ${error.message}`);
        }
    }
    async getClientMobileMappings(clientId) {
        if (!clientId || clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required');
        }
        try {
            return this.ipMobileMappingModel.find({
                clientId: clientId.trim(),
                status: 'active'
            }).lean();
        }
        catch (error) {
            this.logger.error(`Error getting client mappings for ${clientId}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to get client mappings: ${error.message}`);
        }
    }
    async getStats() {
        try {
            const [total, available, assigned, inactive, totalMappings, activeMappings, inactiveMappings] = await Promise.all([
                this.proxyIpModel.countDocuments(),
                this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
                this.proxyIpModel.countDocuments({ isAssigned: true }),
                this.proxyIpModel.countDocuments({ status: 'inactive' }),
                this.ipMobileMappingModel.countDocuments(),
                this.ipMobileMappingModel.countDocuments({ status: 'active' }),
                this.ipMobileMappingModel.countDocuments({ status: 'inactive' })
            ]);
            return {
                total,
                available,
                assigned,
                inactive,
                mappings: {
                    total: totalMappings,
                    active: activeMappings,
                    inactive: inactiveMappings
                }
            };
        }
        catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to get statistics: ${error.message}`);
        }
    }
    async findProxyIpById(ipAddress, port) {
        if (!ipAddress || !port) {
            throw new common_1.BadRequestException('IP address and port are required');
        }
        try {
            const proxyIp = await this.proxyIpModel.findOne({ ipAddress, port }).lean();
            if (!proxyIp) {
                throw new common_1.NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
            }
            return proxyIp;
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            this.logger.error(`Error finding proxy IP ${ipAddress}:${port}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to find proxy IP: ${error.message}`);
        }
    }
    async getClientAssignedIps(clientId) {
        if (!clientId || clientId.trim() === '') {
            throw new common_1.BadRequestException('Client ID is required');
        }
        try {
            return this.proxyIpModel.find({
                assignedToClient: clientId.trim(),
                isAssigned: true
            }).lean();
        }
        catch (error) {
            this.logger.error(`Error getting assigned IPs for client ${clientId}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to get assigned IPs: ${error.message}`);
        }
    }
    async findMappingByMobile(mobile) {
        if (!mobile || mobile.trim() === '') {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        try {
            return this.ipMobileMappingModel.findOne({
                mobile: mobile.trim(),
                status: 'active'
            }).lean();
        }
        catch (error) {
            this.logger.error(`Error finding mapping for mobile ${mobile}: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to find mapping: ${error.message}`);
        }
    }
    async isIpAvailable(ipAddress, port) {
        if (!ipAddress || !port) {
            throw new common_1.BadRequestException('IP address and port are required');
        }
        try {
            const ip = await this.proxyIpModel.findOne({
                ipAddress,
                port,
                status: 'active',
                isAssigned: false
            }).lean();
            return ip !== null;
        }
        catch (error) {
            this.logger.error(`Error checking IP availability ${ipAddress}:${port}: ${error.message}`);
            return false;
        }
    }
    async getAvailableIpCount() {
        try {
            return this.proxyIpModel.countDocuments({
                status: 'active',
                isAssigned: false
            });
        }
        catch (error) {
            this.logger.error(`Error getting available IP count: ${error.message}`);
            return 0;
        }
    }
    async healthCheck() {
        try {
            const stats = await this.getStats();
            const issues = [];
            const utilizationRate = stats.total > 0 ? (stats.assigned / stats.total) * 100 : 0;
            let status = 'healthy';
            if (stats.available === 0) {
                status = 'critical';
                issues.push('No available IPs in pool');
            }
            else if (stats.available < 5) {
                status = 'warning';
                issues.push('Low IP availability (less than 5 IPs available)');
            }
            if (utilizationRate > 90) {
                status = utilizationRate > 95 ? 'critical' : 'warning';
                issues.push(`High utilization rate: ${utilizationRate.toFixed(1)}%`);
            }
            if (stats.inactive > stats.total * 0.2) {
                status = 'warning';
                issues.push('High number of inactive IPs');
            }
            return {
                status,
                availableIps: stats.available,
                totalActiveIps: stats.total - stats.inactive,
                utilizationRate: parseFloat(utilizationRate.toFixed(1)),
                issues
            };
        }
        catch (error) {
            this.logger.error(`Error during health check: ${error.message}`);
            return {
                status: 'critical',
                availableIps: 0,
                totalActiveIps: 0,
                utilizationRate: 0,
                issues: ['Health check failed']
            };
        }
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