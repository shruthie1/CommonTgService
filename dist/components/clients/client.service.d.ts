import { TelegramService } from './../Telegram/Telegram.service';
import { OnModuleDestroy } from '@nestjs/common';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { ArchivedClientService } from '../archived-clients/archived-client.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { SearchClientDto } from './dto/search-client.dto';
import { NpointService } from '../n-point/npoint.service';
import { SessionService } from '../session-manager';
import { IpManagementService } from '../ip-management/ip-management.service';
import { PromoteClientDocument } from '../promote-clients/schemas/promote-client.schema';
export declare class ClientService implements OnModuleDestroy {
    private clientModel;
    private promoteClientModel;
    private telegramService;
    private bufferClientService;
    private usersService;
    private archivedClientService;
    private sessionService;
    private ipManagementService;
    private npointSerive;
    private readonly logger;
    private clientsMap;
    private lastUpdateMap;
    private checkInterval;
    constructor(clientModel: Model<ClientDocument>, promoteClientModel: Model<PromoteClientDocument>, telegramService: TelegramService, bufferClientService: BufferClientService, usersService: UsersService, archivedClientService: ArchivedClientService, sessionService: SessionService, ipManagementService: IpManagementService, npointSerive: NpointService);
    onModuleDestroy(): Promise<void>;
    checkNpoint(): Promise<void>;
    create(createClientDto: CreateClientDto): Promise<Client>;
    findAll(): Promise<Client[]>;
    findAllMasked(): Promise<Partial<Client>[]>;
    findAllObject(): Promise<Record<string, Client>>;
    findAllMaskedObject(query?: SearchClientDto): Promise<{}>;
    refreshMap(): Promise<void>;
    findOne(clientId: string, throwErr?: boolean): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    searchClientsByPromoteMobile(mobileNumbers: string[]): Promise<Client[]>;
    enhancedSearch(filter: any): Promise<{
        clients: Client[];
        searchType: 'direct' | 'promoteMobile' | 'mixed';
        promoteMobileMatches?: Array<{
            clientId: string;
            mobile: string;
        }>;
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
