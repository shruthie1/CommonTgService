import { TelegramService } from './../Telegram/Telegram.service';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { SearchClientDto } from './dto/search-client.dto';
import { NpointService } from '../n-point/npoint.service';
import { IpManagementService } from '../ip-management/ip-management.service';
import { PromoteClientDocument } from '../promote-clients/schemas/promote-client.schema';
interface SearchResult {
    clients: Client[];
    searchType: 'direct' | 'promoteMobile' | 'mixed';
    promoteMobileMatches?: Array<{
        clientId: string;
        mobile: string;
    }>;
}
export declare class ClientService implements OnModuleDestroy, OnModuleInit {
    private readonly clientModel;
    private readonly promoteClientModel;
    private readonly telegramService;
    private readonly bufferClientService;
    private readonly usersService;
    private readonly ipManagementService;
    private readonly npointService;
    private readonly logger;
    private lastUpdateMap;
    private clientsMap;
    private cacheMetadata;
    private checkInterval;
    private refreshInterval;
    private isInitialized;
    private isShuttingDown;
    private readonly REFRESH_INTERVAL;
    private readonly CACHE_TTL;
    private readonly MAX_RETRIES;
    private readonly RETRY_DELAY;
    private readonly CACHE_WARMUP_THRESHOLD;
    private refreshPromise;
    constructor(clientModel: Model<ClientDocument>, promoteClientModel: Model<PromoteClientDocument>, telegramService: TelegramService, bufferClientService: BufferClientService, usersService: UsersService, ipManagementService: IpManagementService, npointService: NpointService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private initializeService;
    private warmupCache;
    private startPeriodicTasks;
    private performPeriodicRefresh;
    private updateCacheMetadata;
    private refreshCacheFromDatabase;
    checkNpoint(): Promise<void>;
    create(createClientDto: CreateClientDto): Promise<Client>;
    findAll(): Promise<Client[]>;
    findAllMasked(): Promise<Partial<Client>[]>;
    findOneMasked(clientId: string): Promise<Partial<Client>>;
    findAllObject(): Promise<Record<string, Client>>;
    findAllMaskedObject(query?: SearchClientDto): Promise<Record<string, Partial<Client>>>;
    refreshMap(): Promise<void>;
    findOne(clientId: string, throwErr?: boolean): Promise<Client | null>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    searchClientsByPromoteMobile(mobileNumbers: string[]): Promise<Client[]>;
    enhancedSearch(filter: any): Promise<SearchResult>;
    private ensureInitialized;
    private cleanUpdateObject;
    private notifyClientUpdate;
    private performPostUpdateTasks;
    private refreshExternalMaps;
    private processPromoteMobileFilter;
    private processTextSearchFields;
    private escapeRegex;
    private executeWithRetry;
    private sleep;
    getServiceStatus(): {
        isInitialized: boolean;
        cacheSize: number;
        lastCacheUpdate: Date;
        isCacheStale: boolean;
        isShuttingDown: boolean;
    };
    getCacheStatistics(): Promise<{
        totalClients: number;
        cacheHitRate: number;
        lastRefresh: Date;
        memoryUsage: number;
    }>;
    setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<void>;
    updateClientSession(newSession: string): Promise<void>;
    updateClient(clientId: string, message?: string): Promise<void>;
    updateClients(): Promise<void>;
    generateNewSession(phoneNumber: string, attempt?: number): Promise<void>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<Client[]>;
    getPromoteMobiles(clientId: string): Promise<string[]>;
    getAllPromoteMobiles(): Promise<string[]>;
    isPromoteMobile(mobile: string): Promise<{
        isPromote: boolean;
        clientId?: string;
    }>;
    addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
    removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
    getIpForMobile(mobile: string, clientId?: string): Promise<string | null>;
    hasMobileAssignedIp(mobile: string): Promise<boolean>;
    getMobilesNeedingIpAssignment(clientId: string): Promise<{
        mainMobile?: string;
        promoteMobiles: string[];
    }>;
    autoAssignIpsToClient(clientId: string): Promise<{
        clientId: string;
        mainMobile: {
            mobile: string;
            ipAddress: string | null;
            status: string;
        };
        promoteMobiles: Array<{
            mobile: string;
            ipAddress: string | null;
            status: string;
        }>;
        summary: {
            totalMobiles: number;
            assigned: number;
            failed: number;
            errors: string[];
        };
    }>;
    getClientIpInfo(clientId: string): Promise<{
        clientId: string;
        clientName: string;
        mainMobile: {
            mobile: string;
            ipAddress: string | null;
            hasIp: boolean;
        };
        promoteMobiles: Array<{
            mobile: string;
            ipAddress: string | null;
            hasIp: boolean;
        }>;
        dedicatedIps: string[];
        summary: {
            totalMobiles: number;
            mobilesWithIp: number;
            mobilesWithoutIp: number;
        };
    }>;
    releaseIpFromMobile(mobile: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
