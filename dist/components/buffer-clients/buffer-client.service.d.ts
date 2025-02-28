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
export declare class BufferClientService {
    private bufferClientModel;
    private telegramService;
    private usersService;
    private activeChannelsService;
    private clientService;
    private channelsService;
    private promoteClientService;
    private joinChannelMap;
    private joinChannelIntervalId;
    private leaveChannelMap;
    private leaveChannelIntervalId;
    constructor(bufferClientModel: Model<BufferClientDocument>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService, channelsService: ChannelsService, promoteClientService: PromoteClientService);
    create(bufferClient: CreateBufferClientDto): Promise<BufferClient>;
    findAll(): Promise<BufferClient[]>;
    findOne(mobile: string, throwErr?: boolean): Promise<BufferClient>;
    update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient>;
    createOrUpdate(mobile: string, createOrUpdateUserDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClient>;
    remove(mobile: string): Promise<void>;
    search(filter: any): Promise<BufferClient[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<BufferClient[]>;
    removeFromBufferMap(key: string): void;
    clearBufferMap(): void;
    joinchannelForBufferClients(skipExisting?: boolean): Promise<string>;
    joinChannelQueue(): Promise<void>;
    clearJoinChannelInterval(): void;
    removeFromLeaveMap(key: string): void;
    clearLeaveMap(): void;
    leaveChannelQueue(): Promise<void>;
    clearLeaveChannelInterval(): void;
    setAsBufferClient(mobile: string, availableDate?: string): Promise<string>;
    checkBufferClients(): Promise<void>;
    addNewUserstoBufferClients(badIds: string[], goodIds: string[]): Promise<void>;
}
