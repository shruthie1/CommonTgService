import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { IpMobileMapping, IpMobileMappingDocument } from './schemas/ip-mobile-mapping.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { AssignIpToMobileDto, BulkAssignIpDto, ReleaseIpFromMobileDto } from './dto/assign-ip.dto';
export declare class IpManagementService {
    private proxyIpModel;
    private ipMobileMappingModel;
    private readonly logger;
    constructor(proxyIpModel: Model<ProxyIpDocument>, ipMobileMappingModel: Model<IpMobileMappingDocument>);
    createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp>;
    bulkCreateProxyIps(proxyIps: CreateProxyIpDto[]): Promise<{
        created: number;
        failed: number;
        errors: string[];
    }>;
    findAllProxyIps(): Promise<ProxyIp[]>;
    getAvailableProxyIps(): Promise<ProxyIp[]>;
    updateProxyIp(ipAddress: string, port: number, updateDto: UpdateProxyIpDto): Promise<ProxyIp>;
    deleteProxyIp(ipAddress: string, port: number): Promise<void>;
    getIpForMobile(mobile: string): Promise<string | null>;
    assignIpToMobile(assignDto: AssignIpToMobileDto): Promise<IpMobileMapping>;
    bulkAssignIpsToMobiles(bulkDto: BulkAssignIpDto): Promise<{
        assigned: number;
        failed: number;
        results: Array<{
            mobile: string;
            ipAddress?: string;
            error?: string;
        }>;
    }>;
    releaseIpFromMobile(releaseDto: ReleaseIpFromMobileDto): Promise<void>;
    getClientMobileMappings(clientId: string): Promise<IpMobileMapping[]>;
    getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        mappings: {
            total: number;
            active: number;
            inactive: number;
        };
    }>;
    findProxyIpById(ipAddress: string, port: number): Promise<ProxyIp>;
    getClientAssignedIps(clientId: string): Promise<ProxyIp[]>;
    findMappingByMobile(mobile: string): Promise<IpMobileMapping | null>;
    isIpAvailable(ipAddress: string, port: number): Promise<boolean>;
    getAvailableIpCount(): Promise<number>;
    healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }>;
}
