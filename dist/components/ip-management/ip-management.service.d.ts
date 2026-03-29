import { Model } from 'mongoose';
import { ProxyIp, ProxyIpDocument } from './schemas/proxy-ip.schema';
import { CreateProxyIpDto } from './dto/create-proxy-ip.dto';
import { UpdateProxyIpDto } from './dto/update-proxy-ip.dto';
import { GetNextIpDto } from './dto/get-next-ip.dto';
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
    findProxyIpById(ipAddress: string, port: number): Promise<ProxyIp>;
    getClientAssignedIps(clientId: string): Promise<ProxyIp[]>;
    isIpAvailable(ipAddress: string, port: number): Promise<boolean>;
    getAvailableIpCount(): Promise<number>;
    getNextIp(filters?: GetNextIpDto): Promise<ProxyIp>;
    private _pickAndMark;
    syncFromExternal(source: string, proxies: CreateProxyIpDto[], removeStale?: boolean): Promise<{
        created: number;
        updated: number;
        removed: number;
        errors: string[];
    }>;
    removeBySource(source: string): Promise<number>;
    markLastUsed(ipAddress: string, port: number): Promise<void>;
    updateHealthStatus(ipAddress: string, port: number, healthy: boolean): Promise<void>;
    markInactive(ipAddress: string, port: number): Promise<void>;
    findBySource(source: string): Promise<ProxyIp[]>;
    countBySource(source: string): Promise<number>;
    getStats(): Promise<{
        total: number;
        available: number;
        assigned: number;
        inactive: number;
        bySource: Record<string, number>;
    }>;
    healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        availableIps: number;
        totalActiveIps: number;
        utilizationRate: number;
        issues: string[];
    }>;
}
