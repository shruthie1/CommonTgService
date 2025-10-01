import { IpManagementService } from './ip-management.service';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { ProxyIp } from './schemas/proxy-ip.schema';
export declare class IpManagementController {
    private readonly ipManagementService;
    constructor(ipManagementService: IpManagementService);
    createProxyIp(createProxyIpDto: CreateProxyIpDto): Promise<ProxyIp>;
    bulkCreateProxyIps(proxyIps: CreateProxyIpDto[]): Promise<{
        created: number;
        failed: number;
        errors: string[];
    }>;
    getAllProxyIps(): Promise<ProxyIp[]>;
    updateProxyIp(ipAddress: string, port: string, updateProxyIpDto: UpdateProxyIpDto): Promise<ProxyIp>;
    deleteProxyIp(ipAddress: string, port: string): Promise<{
        message: string;
    }>;
    getHealthStatus(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }>;
    getProxyIpById(ipAddress: string, port: string): Promise<ProxyIp>;
    getClientAssignedIps(clientId: string): Promise<ProxyIp[]>;
    getAvailableIpCount(): Promise<{
        count: number;
    }>;
}
