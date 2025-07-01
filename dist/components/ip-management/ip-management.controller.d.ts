import { IpManagementService } from './ip-management.service';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { AssignIpToMobileDto, BulkAssignIpDto, ReleaseIpFromMobileDto } from './dto/assign-ip.dto';
import { ProxyIp } from './schemas/proxy-ip.schema';
import { IpMobileMapping } from './schemas/ip-mobile-mapping.schema';
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
    getIpForMobile(mobile: string): Promise<{
        mobile: string;
        ipAddress: string | null;
    }>;
    assignIpToMobile(assignDto: AssignIpToMobileDto): Promise<IpMobileMapping>;
    bulkAssignIps(bulkAssignDto: BulkAssignIpDto): Promise<{
        assigned: number;
        failed: number;
        results: Array<{
            mobile: string;
            ipAddress?: string;
            error?: string;
        }>;
    }>;
    releaseIpFromMobile(mobile: string, releaseDto: ReleaseIpFromMobileDto): Promise<{
        message: string;
    }>;
    getClientMappings(clientId: string): Promise<IpMobileMapping[]>;
    getStatistics(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
    }>;
}
