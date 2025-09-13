import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { IpMobileMapping, IpMobileMappingDocument } from './schemas/ip-mobile-mapping.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { AssignIpToMobileDto, BulkAssignIpDto, ReleaseIpFromMobileDto } from './dto/assign-ip.dto';
import { Logger } from '../../utils';

@Injectable()
export class IpManagementService {
    private readonly logger = new Logger(IpManagementService.name);

    constructor(
        @InjectModel(ProxyIp.name) private proxyIpModel: Model<ProxyIpDocument>,
        @InjectModel(IpMobileMapping.name) private ipMobileMappingModel: Model<IpMobileMappingDocument>
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

        // Check if IP is currently assigned to any mobile
        const mapping = await this.ipMobileMappingModel.findOne({
            ipAddress: `${ipAddress}:${port}`,
            status: 'active'
        });

        if (mapping) {
            throw new BadRequestException(`Cannot delete IP ${ipAddress}:${port} - it is currently assigned to mobile ${mapping.mobile}`);
        }

        const result = await this.proxyIpModel.deleteOne({ ipAddress, port });
        if (result.deletedCount === 0) {
            throw new NotFoundException(`Proxy IP ${ipAddress}:${port} not found`);
        }

        this.logger.log(`Deleted proxy IP: ${ipAddress}:${port}`);
    }

    // ==================== IP-MOBILE MAPPING MANAGEMENT ====================

    async getIpForMobile(mobile: string): Promise<string | null> {
        if (!mobile || mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        this.logger.debug(`Getting IP for mobile: ${mobile}`);

        try {
            const mapping = await this.ipMobileMappingModel.findOne({
                mobile: mobile.trim(),
                status: 'active'
            }).lean();

            return mapping ? mapping.ipAddress : null;
        } catch (error) {
            this.logger.error(`Error getting IP for mobile ${mobile}: ${error.message}`);
            throw new BadRequestException(`Failed to get IP for mobile: ${error.message}`);
        }
    }

    async assignIpToMobile(assignDto: AssignIpToMobileDto): Promise<IpMobileMapping> {
        // Input validation
        if (!assignDto.mobile || assignDto.mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }
        if (!assignDto.clientId || assignDto.clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        const mobile = assignDto.mobile.trim();
        const clientId = assignDto.clientId.trim();

        this.logger.debug(`Assigning IP to mobile: ${mobile}`);

        try {
            // Check if mobile already has IP assigned
            const existingMapping = await this.ipMobileMappingModel.findOne({
                mobile,
                status: 'active'
            });

            if (existingMapping) {
                this.logger.debug(`Mobile ${mobile} already has IP: ${existingMapping.ipAddress}`);
                return existingMapping;
            }

            let selectedIp: ProxyIp;

            if (assignDto.preferredIp) {
                // Use specific IP if provided
                const [ipAddress, portStr] = assignDto.preferredIp.split(':');
                const port = parseInt(portStr);

                if (isNaN(port)) {
                    throw new BadRequestException(`Invalid port in preferred IP: ${assignDto.preferredIp}`);
                }

                selectedIp = await this.proxyIpModel.findOne({
                    ipAddress,
                    port,
                    status: 'active',
                    isAssigned: false
                }).lean();

                if (!selectedIp) {
                    throw new NotFoundException(`Preferred IP ${assignDto.preferredIp} not available`);
                }
            } else {
                // Auto-assign available IP with retry logic to handle race conditions
                let retries = 3;
                while (retries > 0 && !selectedIp) {
                    selectedIp = await this.proxyIpModel.findOne({
                        status: 'active',
                        isAssigned: false
                    }).lean();

                    if (!selectedIp) {
                        break;
                    }

                    // Try to atomically assign this IP
                    const updateResult = await this.proxyIpModel.updateOne(
                        { 
                            ipAddress: selectedIp.ipAddress, 
                            port: selectedIp.port,
                            isAssigned: false 
                        },
                        { 
                            $set: { 
                                isAssigned: true, 
                                assignedToClient: clientId 
                            } 
                        }
                    );

                    if (updateResult.modifiedCount === 0) {
                        // Someone else took this IP, try again
                        selectedIp = null;
                        retries--;
                        continue;
                    }
                    break;
                }

                if (!selectedIp) {
                    throw new NotFoundException('No available proxy IPs');
                }
            }

            // Create mapping
            const mappingDto = {
                mobile,
                ipAddress: `${selectedIp.ipAddress}:${selectedIp.port}`,
                clientId,
                status: 'active'
            };

            let newMapping: IpMobileMappingDocument;

            if (assignDto.preferredIp) {
                // For preferred IP, we need to update both mapping and IP in transaction-like manner
                const [mapping] = await Promise.all([
                    this.ipMobileMappingModel.create(mappingDto),
                    this.proxyIpModel.updateOne(
                        { ipAddress: selectedIp.ipAddress, port: selectedIp.port },
                        { $set: { isAssigned: true, assignedToClient: clientId } }
                    )
                ]);
                newMapping = mapping;
            } else {
                // For auto-assign, IP is already updated, just create mapping
                newMapping = await this.ipMobileMappingModel.create(mappingDto);
            }

            this.logger.log(`Assigned IP ${mappingDto.ipAddress} to mobile ${mobile}`);
            return newMapping.toObject ? newMapping.toObject() : newMapping as IpMobileMapping;
        } catch (error) {
            this.logger.error(`Failed to assign IP to mobile ${mobile}: ${error.message}`);
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to assign IP to mobile: ${error.message}`);
        }
    }

    async bulkAssignIpsToMobiles(bulkDto: BulkAssignIpDto): Promise<{
        assigned: number;
        failed: number;
        results: Array<{ mobile: string; ipAddress?: string; error?: string }>
    }> {
        if (!bulkDto.mobiles || bulkDto.mobiles.length === 0) {
            throw new BadRequestException('No mobiles provided for bulk assignment');
        }
        if (!bulkDto.clientId || bulkDto.clientId.trim() === '') {
            throw new BadRequestException('Client ID is required for bulk assignment');
        }

        this.logger.debug(`Bulk assigning IPs to ${bulkDto.mobiles.length} mobiles`);

        let assigned = 0;
        let failed = 0;
        const results: Array<{ mobile: string; ipAddress?: string; error?: string }> = [];

        // Process in smaller batches to manage database load
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
                    const assignDto: AssignIpToMobileDto = {
                        mobile: mobile.trim(),
                        clientId: bulkDto.clientId.trim()
                    };

                    const mapping = await this.assignIpToMobile(assignDto);
                    assigned++;
                    results.push({ mobile: mobile.trim(), ipAddress: mapping.ipAddress });
                } catch (error) {
                    failed++;
                    results.push({ mobile: mobile.trim(), error: error.message });
                    this.logger.warn(`Failed to assign IP to mobile ${mobile}: ${error.message}`);
                }
            }
        }

        this.logger.log(`Bulk assignment completed: ${assigned} assigned, ${failed} failed`);
        return { assigned, failed, results };
    }

    async releaseIpFromMobile(releaseDto: ReleaseIpFromMobileDto): Promise<void> {
        if (!releaseDto.mobile || releaseDto.mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        const mobile = releaseDto.mobile.trim();
        this.logger.debug(`Releasing IP from mobile: ${mobile}`);

        try {
            const mapping = await this.ipMobileMappingModel.findOne({
                mobile,
                status: 'active'
            });

            if (!mapping) {
                throw new NotFoundException(`No active IP mapping found for mobile: ${mobile}`);
            }

            const [ipAddress, portStr] = mapping.ipAddress.split(':');
            const port = parseInt(portStr);

            if (isNaN(port)) {
                this.logger.error(`Invalid port in IP address: ${mapping.ipAddress}`);
                throw new BadRequestException(`Invalid IP address format: ${mapping.ipAddress}`);
            }

            // Release IP and update mapping atomically
            await Promise.all([
                this.ipMobileMappingModel.updateOne(
                    { mobile, status: 'active' },
                    { $set: { status: 'inactive' } }
                ),
                this.proxyIpModel.updateOne(
                    { ipAddress, port },
                    { $set: { isAssigned: false }, $unset: { assignedToClient: 1 } }
                )
            ]);

            this.logger.log(`Released IP ${mapping.ipAddress} from mobile ${mobile}`);
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`);
            throw new BadRequestException(`Failed to release IP from mobile: ${error.message}`);
        }
    }

    async getClientMobileMappings(clientId: string): Promise<IpMobileMapping[]> {
        if (!clientId || clientId.trim() === '') {
            throw new BadRequestException('Client ID is required');
        }

        try {
            return this.ipMobileMappingModel.find({
                clientId: clientId.trim(),
                status: 'active'
            }).lean();
        } catch (error) {
            this.logger.error(`Error getting client mappings for ${clientId}: ${error.message}`);
            throw new BadRequestException(`Failed to get client mappings: ${error.message}`);
        }
    }

    async getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        mappings: {
            total: number;
            active: number;
            inactive: number;
        };
    }> {
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
     * Find mobile mapping by mobile number
     */
    async findMappingByMobile(mobile: string): Promise<IpMobileMapping | null> {
        if (!mobile || mobile.trim() === '') {
            throw new BadRequestException('Mobile number is required');
        }

        try {
            return this.ipMobileMappingModel.findOne({
                mobile: mobile.trim(),
                status: 'active'
            }).lean();
        } catch (error) {
            this.logger.error(`Error finding mapping for mobile ${mobile}: ${error.message}`);
            throw new BadRequestException(`Failed to find mapping: ${error.message}`);
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
