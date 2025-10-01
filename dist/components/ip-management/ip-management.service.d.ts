import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
export declare class IpManagementService {
    private proxyIpModel;
    private readonly logger;
    constructor(proxyIpModel: Model<ProxyIpDocument>);
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
    getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
    }>;
    findProxyIpById(ipAddress: string, port: number): Promise<ProxyIp>;
    getClientAssignedIps(clientId: string): Promise<ProxyIp[]>;
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
