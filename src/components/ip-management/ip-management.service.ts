import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { Logger } from '../../utils';

@Injectable()
export class IpManagementService {
    private readonly logger = new Logger(IpManagementService.name);

    constructor(
        @InjectModel(ProxyIp.name) private proxyIpModel: Model<ProxyIpDocument>,
    ) {}

    // ==================== PROXY IP MANAGEMENT ====================

    async createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        // Input validation
        if (!createProxyIpDto.ipAddress || !createProxyIpDto.port) {
            throw new BadRequestException('IP address and port are required');
        }

        if (createProxyIpDto.port < 1 || createProxyIpDto.port > 65535) {
            throw new BadRequestException('Port must be between 1 and 65535');
        }

        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);

        try {
            // Check if IP:Port combination already exists
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

        // Process in batches to avoid overwhelming the database
        const batchSize = 10;
        for (let i = 0; i < proxyIps.length; i += batchSize) {
            const batch = proxyIps.slice(i, i + batchSize);
            
            for (const ipDto of batch) {
                try {
                    // Validate each IP before creating
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


    async getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
    }> {
        try {
            const [total, available, assigned, inactive] = await Promise.all([
                this.proxyIpModel.countDocuments(),
                this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
                this.proxyIpModel.countDocuments({ isAssigned: true }),
                this.proxyIpModel.countDocuments({ status: 'inactive' })
            ]);

            return { 
                total, 
                available, 
                assigned, 
                inactive
            };
        } catch (error) {
            this.logger.error(`Error getting statistics: ${error.message}`);
            throw new BadRequestException(`Failed to get statistics: ${error.message}`);
        }
    }

    // ==================== ADDITIONAL UTILITY METHODS ====================

    /**
     * Get specific proxy IP by address and port
     */
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

    /**
     * Get all IPs assigned to a specific client
     */
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

    /**
     * Check if an IP is available for assignment
     */
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

    /**
     * Get available IP count
     */
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

    /**
     * Health check method to validate IP pool status
     */
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
