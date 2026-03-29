import { OnModuleInit } from '@nestjs/common';
import { IpManagementService } from '../ip-management/ip-management.service';
import { WebshareProxy, WebshareSyncResult } from './interfaces/webshare-types';
export declare class WebshareProxyService implements OnModuleInit {
    private readonly ipManagementService;
    private readonly logger;
    private client;
    private configured;
    constructor(ipManagementService: IpManagementService);
    onModuleInit(): void;
    isConfigured(): boolean;
    fetchAllProxies(): Promise<WebshareProxy[]>;
    syncProxies(removeStale?: boolean): Promise<WebshareSyncResult>;
    replaceProxy(ipAddress: string, port: number, preferredCountry?: string): Promise<{
        success: boolean;
        message: string;
        replacementId?: string;
    }>;
    refreshAndSync(): Promise<WebshareSyncResult>;
    getStatus(): Promise<{
        configured: boolean;
        apiKeyValid: boolean;
        totalProxiesInWebshare: number;
        totalProxiesInDb: number;
        lastSyncAt: string | null;
        lastSyncError: string | null;
    }>;
    getProxyConfig(): Promise<any>;
    private ensureConfigured;
    private webshareToDto;
}
