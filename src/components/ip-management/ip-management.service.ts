import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { GetNextIpDto } from './dto/get-next-ip.dto';
import { Logger } from '../../utils';
import { RedisClient } from '../../utils/redisClient';

const ROUND_ROBIN_KEY = 'ip-mgmt:round-robin:counter';

@Injectable()
export class IpManagementService {
    private readonly logger = new Logger(IpManagementService.name);

    constructor(
        @InjectModel(ProxyIp.name) private proxyIpModel: Model<ProxyIpDocument>,
    ) {}

    // ==================== PROXY IP CRUD ====================

    async createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        if (!createProxyIpDto.ipAddress || !createProxyIpDto.port) {
            throw new BadRequestException('IP address and port are required');
        }

        if (createProxyIpDto.port < 1 || createProxyIpDto.port > 65535) {
            throw new BadRequestException('Port must be between 1 and 65535');
        }

        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);

        try {
            const existingIp = await this.proxyIpModel.findOne({
                ipAddress: createProxyIpDto.ipAddress,
                port: createProxyIpDto.port
            });

            if (existingIp) {
                throw new ConflictException(`Proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port} already exists`);
            }

            const createdIp = new this.proxyIpModel(createProxyIpDto);
            const savedIp = await createdIp.save();

            this.logger.log(`Created proxy IP: ${savedIp.ipAddress}:${savedIp.port}`);
            return savedIp.toJSON();
        } catch (error) {
            if (error instanceof ConflictException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to create proxy IP ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}: ${error.message}`);
            throw new BadRequestException(`Failed to create proxy IP: ${error.message}`);
        }
    }

    async bulkCreateProxyIps(proxyIps: CreateProxyIpDto[]): Promise<{ created: number; failed: number; errors: string[] }> {
        if (!proxyIps || proxyIps.length === 0) {
            throw new BadRequestException('No proxy IPs provided for bulk creation');
        }

        this.logger.debug(`Bulk creating ${proxyIps.length} proxy IPs`);

        let created = 0;
        let failed = 0;
        const errors: string[] = [];

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
                } catch (error) {
                    failed++;
                    errors.push(`${ipDto.ipAddress}:${ipDto.port} - ${error.message}`);
                }
            }
        }

        this.logger.log(`Bulk creation completed: ${created} created, ${failed} failed`);
        return { created, failed, errors };
    }

    async findAllProxyIps(): Promise<ProxyIp[]> {
        return this.proxyIpModel.find().lean();
    }

    async getAvailableProxyIps(): Promise<ProxyIp[]> {
        return this.proxyIpModel.find({
            status: 'active',
            isAssigned: false
        }).lean();
    }

    async updateProxyIp(ipAddress: string, port: number, updateDto: UpdateProxyIpDto): Promise<ProxyIp> {
        this.logger.debug(`Updating proxy IP: ${ipAddress}:${port}`);

        const updatedIp = await this.proxyIpModel.findOneAndUpdate(
            { ipAddress, port },
            { $set: updateDto },
            { new: true }
        ).lean();

        if (!updatedIp) {
            throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }

        this.logger.log(`Updated proxy IP: ${ipAddress}:${port}`);
        return updatedIp;
    }

    async deleteProxyIp(ipAddress: string, port: number): Promise<void> {
        this.logger.debug(`Deleting proxy IP: ${ipAddress}:${port}`);

        const result = await this.proxyIpModel.deleteOne({ ipAddress, port });
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }

        this.logger.log(`Deleted proxy IP: ${ipAddress}:${port}`);
    }

    async findProxyIpById(ipAddress: string, port: number): Promise<ProxyIp> {
        if (!ipAddress || !port) {
            throw new BadRequestException('IP address and port are required');
        }

        try {
            const proxyIp = await this.proxyIpModel.findOne({ ipAddress, port }).lean();
            if (!proxyIp) {
                throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
            }
            return proxyIp;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error finding proxy IP ${ipAddress}:${port}: ${error.message}`);
            throw new BadRequestException(`Failed to find proxy IP: ${error.message}`);
        }
    }

    async getClientAssignedIps(clientId: string): Promise<ProxyIp[]> {
        if (!clientId || clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        try {
            return this.proxyIpModel.find({
                assignedToClient: clientId.trim(),
                isAssigned: true
            }).lean();
        } catch (error) {
            this.logger.error(`Error getting assigned IPs for client ${clientId}: ${error.message}`);
            throw new BadRequestException(`Failed to get assigned IPs: ${error.message}`);
        }
    }

    async isIpAvailable(ipAddress: string, port: number): Promise<boolean> {
        if (!ipAddress || !port) {
            throw new BadRequestException('IP address and port are required');
        }

        try {
            const ip = await this.proxyIpModel.findOne({
                ipAddress,
                port,
                status: 'active',
                isAssigned: false
            }).lean();

            return ip !== null;
        } catch (error) {
            this.logger.error(`Error checking IP availability ${ipAddress}:${port}: ${error.message}`);
            return false;
        }
    }

    async getAvailableIpCount(): Promise<number> {
        try {
            return this.proxyIpModel.countDocuments({
                status: 'active',
                isAssigned: false
            });
        } catch (error) {
            this.logger.error(`Error getting available IP count: ${error.message}`);
            return 0;
        }
    }

    // ==================== ROUND-ROBIN: getNextIp ====================

    /**
     * Serves the next available proxy IP in round-robin order.
     *
     * - Filters by status=active only.
     * - If clientId is provided, returns IPs assigned to that client.
     *   If no IPs found for that client, falls back to the full active pool.
     * - If no clientId, returns from the entire active pool.
     * - Optional countryCode and protocol filters.
     * - Uses Redis atomic counter for global round-robin index.
     * - Updates `lastUsed` timestamp on the served IP.
     */
    async getNextIp(filters?: GetNextIpDto): Promise<ProxyIp> {
        const query: Record<string, unknown> = { status: 'active' };

        if (filters?.countryCode) {
            query.countryCode = filters.countryCode;
        }
        if (filters?.protocol) {
            query.protocol = filters.protocol;
        }

        // If clientId provided, try client-specific IPs first
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

        // Full pool — all active IPs (regardless of assignment)
        const allIps = await this.proxyIpModel
            .find(query)
            .sort({ _id: 1 })
            .lean();

        if (allIps.length === 0) {
            throw new NotFoundException('No active proxy IPs available in the pool');
        }

        return this._pickAndMark(allIps);
    }

    /**
     * Picks the next IP from a sorted list using Redis atomic counter,
     * then updates lastUsed in the background.
     */
    private async _pickAndMark(ips: ProxyIp[]): Promise<ProxyIp> {
        let index = 0;
        try {
            const counter = await RedisClient.incr(ROUND_ROBIN_KEY);
            index = (counter - 1) % ips.length;
        } catch (err) {
            index = Date.now() % ips.length;
            this.logger.warn(`Redis unavailable for round-robin counter, using timestamp fallback`);
        }

        const selected = ips[index];

        // Fire-and-forget lastUsed update
        this.proxyIpModel.updateOne(
            { ipAddress: selected.ipAddress, port: selected.port },
            { $set: { lastUsed: new Date() } }
        ).exec().catch(err => {
            this.logger.warn(`Failed to update lastUsed for ${selected.ipAddress}:${selected.port}: ${err.message}`);
        });

        this.logger.debug(`Round-robin served: ${selected.ipAddress}:${selected.port} (index=${index}/${ips.length})`);
        return selected;
    }

    // ==================== EXTERNAL SYNC ====================

    /**
     * Upserts proxies from an external source (e.g., Webshare).
     * Matches on ipAddress+port. Updates existing, inserts new.
     * Optionally removes stale proxies from the same source that are no longer in the incoming list.
     */
    async syncFromExternal(
        source: string,
        proxies: CreateProxyIpDto[],
        removeStale: boolean = true
    ): Promise<{ created: number; updated: number; removed: number; errors: string[] }> {
        this.logger.log(`Sync from "${source}": ${proxies.length} proxies, removeStale=${removeStale}`);

        let created = 0;
        let updated = 0;
        let removed = 0;
        const errors: string[] = [];
        const incomingKeys = new Set<string>();

        // Use bulkWrite for performance — single DB round-trip for upserts
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
            } catch (error) {
                // bulkWrite with ordered:false continues on errors; partial results available
                if (error.result) {
                    created = error.result.upsertedCount || 0;
                    updated = error.result.modifiedCount || 0;
                }
                errors.push(`Bulk upsert errors: ${error.message}`);
                this.logger.warn(`Bulk upsert had errors: ${error.message}`);
            }
        }

        // Remove stale proxies from this source that weren't in the incoming list
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

    /**
     * Remove all proxies from a given source.
     */
    async removeBySource(source: string): Promise<number> {
        const result = await this.proxyIpModel.deleteMany({ source });
        this.logger.log(`Removed ${result.deletedCount} proxies from source "${source}"`);
        return result.deletedCount;
    }

    // ==================== HEALTH TRACKING ====================

    async markLastUsed(ipAddress: string, port: number): Promise<void> {
        await this.proxyIpModel.updateOne(
            { ipAddress, port },
            { $set: { lastUsed: new Date() } }
        );
    }

    async updateHealthStatus(
        ipAddress: string,
        port: number,
        healthy: boolean
    ): Promise<void> {
        if (healthy) {
            await this.proxyIpModel.updateOne(
                { ipAddress, port },
                { $set: { lastVerified: new Date(), consecutiveFails: 0 } }
            );
        } else {
            await this.proxyIpModel.updateOne(
                { ipAddress, port },
                { $set: { lastVerified: new Date() }, $inc: { consecutiveFails: 1 } }
            );
        }
    }

    async markInactive(ipAddress: string, port: number): Promise<void> {
        await this.proxyIpModel.updateOne(
            { ipAddress, port },
            { $set: { status: 'inactive' } }
        );
        this.logger.log(`Marked proxy inactive: ${ipAddress}:${port}`);
    }

    /**
     * Get proxies from a specific source.
     */
    async findBySource(source: string): Promise<ProxyIp[]> {
        return this.proxyIpModel.find({ source }).lean();
    }

    /**
     * Count proxies from a specific source (efficient — no document loading).
     */
    async countBySource(source: string): Promise<number> {
        return this.proxyIpModel.countDocuments({ source });
    }

    // ==================== STATS ====================

    async getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        bySource: Record<string, number>;
    }> {
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
            const bySource: Record<string, number> = {};
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
        } catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw new BadRequestException(`Failed to get statistics: ${error.message}`);
        }
    }

    // ==================== HEALTH CHECK ====================

    async healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }> {
        try {
            const stats = await this.getStats();
            const issues: string[] = [];

            const utilizationRate = stats.total > 0 ? (stats.assigned / stats.total) * 100 : 0;

            let status: 'healthy' | 'warning' | 'critical' = 'healthy';

            if (stats.available === 0) {
                status = 'critical';
                issues.push('No available IPs in pool');
            } else if (stats.available < 5) {
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
        } catch (error) {
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
}
