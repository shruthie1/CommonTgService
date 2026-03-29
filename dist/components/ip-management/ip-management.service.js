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
const utils_1 = require("../../utils");
const redisClient_1 = require("../../utils/redisClient");
const ROUND_ROBIN_KEY = 'ip-mgmt:round-robin:counter';
let IpManagementService = IpManagementService_1 = class IpManagementService {
    constructor(proxyIpModel) {
        this.proxyIpModel = proxyIpModel;
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
        const result = await this.proxyIpModel.deleteOne({ ipAddress, port });
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }
        this.logger.log(`Deleted proxy IP: ${ipAddress}:${port}`);
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
    async getNextIp(filters) {
        const query = { status: 'active' };
        if (filters?.countryCode) {
            query.countryCode = filters.countryCode;
        }
        if (filters?.protocol) {
            query.protocol = filters.protocol;
        }
        if (filters?.clientId) {
            const clientQuery = {
                ...query,
                assignedToClient: filters.clientId,
                isAssigned: true,
            };
            const clientIps = await this.proxyIpModel
                .find(clientQuery)
                .sort({ _id: 1 })
                .lean();
            if (clientIps.length > 0) {
                return this._pickAndMark(clientIps);
            }
            this.logger.debug(`No IPs found for client ${filters.clientId}, falling back to full pool`);
        }
        const allIps = await this.proxyIpModel
            .find(query)
            .sort({ _id: 1 })
            .lean();
        if (allIps.length === 0) {
            throw new common_1.NotFoundException('No active proxy IPs available in the pool');
        }
        return this._pickAndMark(allIps);
    }
    async _pickAndMark(ips) {
        let index = 0;
        try {
            const counter = await redisClient_1.RedisClient.incr(ROUND_ROBIN_KEY);
            index = (counter - 1) % ips.length;
        }
        catch (err) {
            index = Date.now() % ips.length;
            this.logger.warn(`Redis unavailable for round-robin counter, using timestamp fallback`);
        }
        const selected = ips[index];
        this.proxyIpModel.updateOne({ ipAddress: selected.ipAddress, port: selected.port }, { $set: { lastUsed: new Date() } }).exec().catch(err => {
            this.logger.warn(`Failed to update lastUsed for ${selected.ipAddress}:${selected.port}: ${err.message}`);
        });
        this.logger.debug(`Round-robin served: ${selected.ipAddress}:${selected.port} (index=${index}/${ips.length})`);
        return selected;
    }
    async syncFromExternal(source, proxies, removeStale = true) {
        this.logger.log(`Sync from "${source}": ${proxies.length} proxies, removeStale=${removeStale}`);
        let created = 0;
        let updated = 0;
        let removed = 0;
        const errors = [];
        const incomingKeys = new Set();
        const bulkOps = proxies.map(proxy => {
            const key = `${proxy.ipAddress}:${proxy.port}`;
            incomingKeys.add(key);
            return {
                updateOne: {
                    filter: { ipAddress: proxy.ipAddress, port: proxy.port },
                    update: {
                        $set: {
                            protocol: proxy.protocol,
                            username: proxy.username,
                            password: proxy.password,
                            status: proxy.status || 'active',
                            source,
                            webshareId: proxy.webshareId,
                            countryCode: proxy.countryCode,
                            cityName: proxy.cityName,
                            consecutiveFails: 0,
                        },
                        $setOnInsert: {
                            isAssigned: proxy.isAssigned || false,
                            roundRobinIndex: 0,
                        },
                    },
                    upsert: true,
                },
            };
        });
        if (bulkOps.length > 0) {
            try {
                const result = await this.proxyIpModel.bulkWrite(bulkOps, { ordered: false });
                created = result.upsertedCount;
                updated = result.modifiedCount;
            }
            catch (error) {
                if (error.result) {
                    created = error.result.upsertedCount || 0;
                    updated = error.result.modifiedCount || 0;
                }
                errors.push(`Bulk upsert errors: ${error.message}`);
                this.logger.warn(`Bulk upsert had errors: ${error.message}`);
            }
        }
        if (removeStale) {
            const result = await this.proxyIpModel.deleteMany({
                source,
                $nor: proxies.map(p => ({ ipAddress: p.ipAddress, port: p.port })),
            });
            removed = result.deletedCount;
            if (removed > 0) {
                this.logger.debug(`Removed ${removed} stale ${source} proxies`);
            }
        }
        this.logger.log(`Sync "${source}" complete: created=${created}, updated=${updated}, removed=${removed}, errors=${errors.length}`);
        return { created, updated, removed, errors };
    }
    async removeBySource(source) {
        const result = await this.proxyIpModel.deleteMany({ source });
        this.logger.log(`Removed ${result.deletedCount} proxies from source "${source}"`);
        return result.deletedCount;
    }
    async markLastUsed(ipAddress, port) {
        await this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { lastUsed: new Date() } });
    }
    async updateHealthStatus(ipAddress, port, healthy) {
        if (healthy) {
            await this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { lastVerified: new Date(), consecutiveFails: 0 } });
        }
        else {
            await this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { lastVerified: new Date() }, $inc: { consecutiveFails: 1 } });
        }
    }
    async markInactive(ipAddress, port) {
        await this.proxyIpModel.updateOne({ ipAddress, port }, { $set: { status: 'inactive' } });
        this.logger.log(`Marked proxy inactive: ${ipAddress}:${port}`);
    }
    async findBySource(source) {
        return this.proxyIpModel.find({ source }).lean();
    }
    async countBySource(source) {
        return this.proxyIpModel.countDocuments({ source });
    }
    async getStats() {
        try {
            const [total, available, assigned, inactive] = await Promise.all([
                this.proxyIpModel.countDocuments(),
                this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
                this.proxyIpModel.countDocuments({ isAssigned: true }),
                this.proxyIpModel.countDocuments({ status: 'inactive' })
            ]);
            const sourceAgg = await this.proxyIpModel.aggregate([
                { $group: { _id: '$source', count: { $sum: 1 } } }
            ]);
            const bySource = {};
            for (const entry of sourceAgg) {
                bySource[entry._id || 'manual'] = entry.count;
            }
            return {
                total,
                available,
                assigned,
                inactive,
                bySource,
            };
        }
        catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw new common_1.BadRequestException(`Failed to get statistics: ${error.message}`);
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
    __metadata("design:paramtypes", [mongoose_2.Model])
], IpManagementService);
//# sourceMappingURL=ip-management.service.js.map