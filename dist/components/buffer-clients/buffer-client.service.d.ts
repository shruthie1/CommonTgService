import { ChannelsService } from './../channels/channels.service';
import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient, BufferClientDocument } from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { SessionService } from '../session-manager';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { Client } from '../clients';
import { BotsService } from '../bots';
import { BaseClientUpdate, BaseClientService, ClientStatusType, ClientConfig } from '../shared/base-client.service';
export declare class BufferClientService extends BaseClientService<BufferClientDocument> {
    private bufferClientModel;
    private readonly MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT;
    private promoteClientService;
    constructor(bufferClientModel: Model<BufferClientDocument>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService, channelsService: ChannelsService, promoteClientServiceRef: PromoteClientService, sessionService: SessionService, botsService: BotsService);
    private getPrimaryClientMobiles;
    private isPrimaryClientMobile;
    private isHealthyBufferClientForCap;
    get model(): Model<BufferClientDocument>;
    get clientType(): 'buffer';
    get config(): ClientConfig;
    updateNameAndBio(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number>;
    updateUsername(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number>;
    create(bufferClient: CreateBufferClientDto): Promise<BufferClientDocument>;
    findAll(status?: ClientStatusType): Promise<BufferClientDocument[]>;
    findOne(mobile: string, throwErr?: boolean): Promise<BufferClientDocument>;
    update(mobile: string, updateClientDto: BaseClientUpdate): Promise<BufferClientDocument>;
    createOrUpdate(mobile: string, createorUpdateBufferClientDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClientDocument>;
    remove(mobile: string, message?: string): Promise<void>;
    search(filter: SearchBufferClientDto): Promise<BufferClientDocument[]>;
    executeQuery(query: Record<string, any>, sort?: Record<string, any>, limit?: number, skip?: number): Promise<BufferClientDocument[]>;
    updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<BufferClientDocument>;
    setPrimaryInUse(clientId: string, mobile: string): Promise<BufferClientDocument>;
    refillJoinQueue(clientId?: string | null): Promise<number>;
    private fetchJoinableChannels;
    markAsActive(mobile: string, message?: string): Promise<BufferClientDocument>;
    markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument | null>;
    setAsBufferClient(mobile: string, clientId: string, availableDate?: string): Promise<string>;
    diagnoseEnrollmentDecision(): Promise<any>;
    diagnoseWarmupPipeline(): Promise<any>;
    checkBufferClients(): Promise<void>;
    updateInfo(): Promise<void>;
    joinchannelForBufferClients(skipExisting?: boolean, clientId?: string): Promise<string>;
    private createBufferClientFromUser;
    addNewUserstoBufferClients(badIds: string[], goodIds: string[], clientsNeedingBufferClients?: string[], bufferClientsPerClient?: Map<string, number>): Promise<void>;
    addNewUserstoBufferClientsDynamic(badIds: string[], goodIds: string[], clientsNeedingBufferClients: Array<{
        clientId: string;
        totalNeeded: number;
        windowNeeds: Array<{
            window: string;
            available: number;
            needed: number;
            targetDate: string;
            minRequired: number;
        }>;
        totalActive: number;
        totalNeededForCount: number;
        calculationReason: string;
        priority: number;
    }>, bufferClientsPerClient?: Map<string, number>): Promise<{
        createdCount: number;
        attemptedCount: number;
        createdEntries: string[];
    }>;
    updateAllClientSessions(): Promise<void>;
    getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClientDocument[]>;
    getBufferClientDistribution(): Promise<{
        totalBufferClients: number;
        unassignedBufferClients: number;
        activeBufferClients: number;
        inactiveBufferClients: number;
        distributionPerClient: Array<{
            clientId: string;
            assignedCount: number;
            activeCount: number;
            inactiveCount: number;
            needed: number;
            status: 'sufficient' | 'needs_more';
            neverUsed: number;
            usedInLast24Hours: number;
        }>;
        summary: {
            clientsWithSufficientBufferClients: number;
            clientsNeedingBufferClients: number;
            totalBufferClientsNeeded: number;
            maxBufferClientsPerTrigger: number;
            triggersNeededToSatisfyAll: number;
        };
    }>;
    getBufferClientsByStatus(status: ClientStatusType): Promise<BufferClient[]>;
    getBufferClientsWithMessages(): Promise<(import("mongoose").Document<unknown, {}, BufferClientDocument, {}, import("mongoose").DefaultSchemaOptions> & BufferClient & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    getLeastRecentlyUsedBufferClients(clientId: string, limit?: number): Promise<BufferClient[]>;
    getNextAvailableBufferClient(clientId: string): Promise<BufferClientDocument | null>;
    getUnusedBufferClients(hoursAgo?: number, clientId?: string): Promise<BufferClientDocument[]>;
    private sendBufferCheckSummaryNotification;
}
