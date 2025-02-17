/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/inferschematype" />
/// <reference types="mongoose/types/inferrawdoctype" />
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
export declare class PromoteClientService {
    private promoteClientModel;
    private telegramService;
    private usersService;
    private activeChannelsService;
    private clientService;
    private channelsService;
    private bufferClientService;
    private joinChannelMap;
    private joinChannelIntervalId;
    constructor(promoteClientModel: Model<PromoteClientDocument>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService, channelsService: ChannelsService, bufferClientService: BufferClientService);
    create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient>;
    findAll(): Promise<PromoteClient[]>;
    findOne(mobile: string, throwErr?: boolean): Promise<PromoteClient>;
    update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient>;
    createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient>;
    remove(mobile: string): Promise<void>;
    search(filter: any): Promise<PromoteClient[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<PromoteClient[]>;
    removeFromPromoteMap(key: string): void;
    clearPromoteMap(): void;
    joinchannelForPromoteClients(skipExisting?: boolean): Promise<string>;
    joinChannelQueue(): Promise<void>;
    clearJoinChannelInterval(): void;
    setAsPromoteClient(mobile: string, availableDate?: string): Promise<string>;
    checkPromoteClients(): Promise<void>;
    addNewUserstoPromoteClients(badIds: string[], goodIds: string[]): Promise<void>;
}
