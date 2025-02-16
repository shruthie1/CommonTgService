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
import { TelegramService } from './../Telegram/Telegram.service';
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
export declare class ClientService {
    private clientModel;
    private telegramService;
    private bufferClientService;
    private usersService;
    private archivedClientService;
    private npointSerive;
    private clientsMap;
    constructor(clientModel: Model<ClientDocument>, telegramService: TelegramService, bufferClientService: BufferClientService, usersService: UsersService, archivedClientService: ArchivedClientService, npointSerive: NpointService);
    checkNpoint(): Promise<void>;
    create(createClientDto: CreateClientDto): Promise<Client>;
    findAll(): Promise<Client[]>;
    findAllMasked(query?: SearchClientDto): Promise<{
        channelLink: string;
        dbcoll: string;
        link: string;
        name: string;
        repl: string;
        promoteRepl: string;
        username: string;
        clientId: string;
        deployKey: string;
        mainAccount: string;
        product: string;
    }[]>;
    refreshMap(): Promise<void>;
    findOne(clientId: string, throwErr?: boolean): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<void>;
    updateClientSession(newSession: string): Promise<void>;
    updateClient(clientId: string): Promise<void>;
    updateClients(): Promise<void>;
    generateNewSession(phoneNumber: string, attempt?: number): Promise<void>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<Client[]>;
    addPromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
    removePromoteMobile(clientId: string, mobileNumber: string): Promise<Client>;
}
