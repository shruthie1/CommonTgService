import { ChannelsService } from '../channels/channels.service';
import { Model } from 'mongoose';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { PromoteClient, PromoteClientDocument } from './schemas/promote-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { SessionService } from '../session-manager';
import { Client } from '../clients/schemas/client.schema';
import { BotsService } from '../bots';
import { BaseClientUpdate, BaseClientService, ClientStatusType, ClientConfig } from '../shared/base-client.service';
export declare class PromoteClientService extends BaseClientService<PromoteClientDocument> {
    private promoteClientModel;
    private bufferClientService;
    constructor(promoteClientModel: Model<PromoteClientDocument>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService, channelsService: ChannelsService, bufferClientServiceRef: BufferClientService, sessionService: SessionService, botsService: BotsService);
    get model(): Model<PromoteClientDocument>;
    get clientType(): 'promote';
    get config(): ClientConfig;
    updateNameAndBio(doc: PromoteClientDocument, client: Client, failedAttempts: number): Promise<number>;
    updateUsername(doc: PromoteClientDocument, client: Client, failedAttempts: number): Promise<number>;
    create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient>;
    findAll(statusFilter?: ClientStatusType): Promise<PromoteClient[]>;
    findOne(mobile: string, throwErr?: boolean): Promise<PromoteClientDocument>;
    update(mobile: string, updateClientDto: BaseClientUpdate): Promise<PromoteClientDocument>;
    updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<PromoteClientDocument>;
    refillJoinQueue(clientId?: string | null): Promise<number>;
    private fetchJoinableChannels;
    updateLastUsed(mobile: string): Promise<PromoteClient>;
    markAsInactive(mobile: string, reason: string): Promise<PromoteClientDocument | null>;
    markAsActive(mobile: string, message?: string): Promise<PromoteClient>;
    createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient>;
    remove(mobile: string, message?: string): Promise<void>;
    search(filter: Partial<PromoteClient>): Promise<PromoteClient[]>;
    executeQuery(query: Record<string, any>, sort?: Record<string, any>, limit?: number, skip?: number): Promise<PromoteClientDocument[]>;
    setAsPromoteClient(mobile: string, clientId?: string, availableDate?: string): Promise<string>;
    updateInfo(): Promise<void>;
    joinchannelForPromoteClients(skipExisting?: boolean): Promise<string>;
    checkPromoteClients(): Promise<void>;
    private createPromoteClientFromUser;
    addNewUserstoPromoteClients(badIds: string[], goodIds: string[], clientsNeedingPromoteClients?: string[], promoteClientsPerClient?: Map<string, number>): Promise<void>;
    addNewUserstoPromoteClientsDynamic(badIds: string[], goodIds: string[], clientsNeedingPromoteClients: Array<{
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
    }>, promoteClientsPerClient?: Map<string, number>): Promise<void>;
    getPromoteClientDistribution(): Promise<{
        totalPromoteClients: number;
        unassignedPromoteClients: number;
        activePromoteClients: number;
        inactivePromoteClients: number;
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
            clientsWithSufficientPromoteClients: number;
            clientsNeedingPromoteClients: number;
            totalPromoteClientsNeeded: number;
            maxPromoteClientsPerTrigger: number;
            triggersNeededToSatisfyAll: number;
        };
    }>;
    getPromoteClientsByStatus(status: ClientStatusType): Promise<PromoteClient[]>;
    getPromoteClientsWithMessages(): Promise<(import("mongoose").Document<unknown, {}, PromoteClientDocument, {}, import("mongoose").DefaultSchemaOptions> & PromoteClient & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    getLeastRecentlyUsedPromoteClients(clientId: string, limit?: number): Promise<PromoteClient[]>;
    getNextAvailablePromoteClient(clientId: string): Promise<PromoteClient | null>;
    getUnusedPromoteClients(hoursAgo?: number, clientId?: string): Promise<PromoteClientDocument[]>;
    removeFromPromoteMap(key: string): void;
    clearPromoteMap(): void;
}
