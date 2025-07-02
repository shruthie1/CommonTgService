import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { IpMobileMapping, IpMobileMappingDocument } from './schemas/ip-mobile-mapping.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { AssignIpToMobileDto, BulkAssignIpDto, ReleaseIpFromMobileDto } from './dto/assign-ip.dto';

@Injectable()
export class IpManagementService {
    private readonly logger = new Logger(IpManagementService.name);

    constructor(
        @InjectModel(ProxyIp.name) private proxyIpModel: Model<ProxyIpDocument>,
        @InjectModel(IpMobileMapping.name) private ipMobileMappingModel: Model<IpMobileMappingDocument>
    ) {}

    // ==================== PROXY IP MANAGEMENT ====================

    async createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp> {
        this.logger.debug(`Creating new proxy IP: ${createProxyIpDto.ipAddress}:${createProxyIpDto.port}`);

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
    }

    async bulkCreateProxyIps(proxyIps: CreateProxyIpDto[]): Promise<{ created: number; failed: number; errors: string[] }> {
        this.logger.debug(`Bulk creating ${proxyIps.length} proxy IPs`);

        let created = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const ipDto of proxyIps) {
            try {
                await this.createProxyIp(ipDto);
                created++;
            } catch (error) {
                failed++;
                errors.push(`${ipDto.ipAddress}:${ipDto.port} - ${error.message}`);
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
        this.logger.debug(`Getting IP for mobile: ${mobile}`);

        const mapping = await this.ipMobileMappingModel.findOne({
            mobile,
            status: 'active'
        }).lean();

        return mapping ? mapping.ipAddress : null;
    }

    async assignIpToMobile(assignDto: AssignIpToMobileDto): Promise<IpMobileMapping> {
        this.logger.debug(`Assigning IP to mobile: ${assignDto.mobile}`);

        // Check if mobile already has IP assigned
        const existingMapping = await this.ipMobileMappingModel.findOne({
            mobile: assignDto.mobile,
            status: 'active'
        });

        if (existingMapping) {
            this.logger.debug(`Mobile ${assignDto.mobile} already has IP: ${existingMapping.ipAddress}`);
            return existingMapping;
        }

        let selectedIp: ProxyIp;

        if (assignDto.preferredIp) {
            // Use specific IP if provided
            const [ipAddress, portStr] = assignDto.preferredIp.split(':');
            const port = parseInt(portStr);

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
            // Auto-assign available IP
            selectedIp = await this.proxyIpModel.findOne({
                status: 'active',
                isAssigned: false
            }).lean();

            if (!selectedIp) {
                throw new NotFoundException('No available proxy IPs');
            }
        }

        // Create mapping
        const mappingDto = {
            mobile: assignDto.mobile,
            ipAddress: `${selectedIp.ipAddress}:${selectedIp.port}`,
            clientId: assignDto.clientId,
            status: 'active'
        };

        const [newMapping] = await Promise.all([
            this.ipMobileMappingModel.create(mappingDto),
            this.proxyIpModel.updateOne(
                { ipAddress: selectedIp.ipAddress, port: selectedIp.port },
                { $set: { isAssigned: true, assignedToClient: assignDto.clientId } }
            )
        ]);

        this.logger.log(`Assigned IP ${mappingDto.ipAddress} to mobile ${assignDto.mobile}`);
        return newMapping.toJSON();
    }

    async bulkAssignIpsToMobiles(bulkDto: BulkAssignIpDto): Promise<{
        assigned: number;
        failed: number;
        results: Array<{ mobile: string; ipAddress?: string; error?: string }>
    }> {
        this.logger.debug(`Bulk assigning IPs to ${bulkDto.mobiles.length} mobiles`);

        let assigned = 0;
        let failed = 0;
        const results: Array<{ mobile: string; ipAddress?: string; error?: string }> = [];

        for (const mobile of bulkDto.mobiles) {
            try {
                const assignDto: AssignIpToMobileDto = {
                    mobile,
                    clientId: bulkDto.clientId
                };

                const mapping = await this.assignIpToMobile(assignDto);
                assigned++;
                results.push({ mobile, ipAddress: mapping.ipAddress });
            } catch (error) {
                failed++;
                results.push({ mobile, error: error.message });
            }
        }

        this.logger.log(`Bulk assignment completed: ${assigned} assigned, ${failed} failed`);
        return { assigned, failed, results };
    }

    async releaseIpFromMobile(releaseDto: ReleaseIpFromMobileDto): Promise<void> {
        this.logger.debug(`Releasing IP from mobile: ${releaseDto.mobile}`);

        const mapping = await this.ipMobileMappingModel.findOne({
            mobile: releaseDto.mobile,
            status: 'active'
        });

        if (!mapping) {
            throw new NotFoundException(`No active IP mapping found for mobile: ${releaseDto.mobile}`);
        }

        const [ipAddress, portStr] = mapping.ipAddress.split(':');
        const port = parseInt(portStr);

        await Promise.all([
            this.ipMobileMappingModel.updateOne(
                { mobile: releaseDto.mobile },
                { $set: { status: 'inactive' } }
            ),
            this.proxyIpModel.updateOne(
                { ipAddress, port },
                { $set: { isAssigned: false }, $unset: { assignedToClient: 1 } }
            )
        ]);

        this.logger.log(`Released IP ${mapping.ipAddress} from mobile ${releaseDto.mobile}`);
    }

    async getClientMobileMappings(clientId: string): Promise<IpMobileMapping[]> {
        return this.ipMobileMappingModel.find({
            clientId,
            status: 'active'
        }).lean();
    }

    async getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
    }> {
        const [total, available, assigned, inactive] = await Promise.all([
            this.proxyIpModel.countDocuments(),
            this.proxyIpModel.countDocuments({ status: 'active', isAssigned: false }),
            this.proxyIpModel.countDocuments({ isAssigned: true }),
            this.proxyIpModel.countDocuments({ status: 'inactive' })
        ]);

        return { total, available, assigned, inactive };
    }
}
