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
export declare class ClientService {
    private clientModel;
    private telegramService;
    private bufferClientService;
    private usersService;
    private archivedClientService;
    private clientsMap;
    constructor(clientModel: Model<ClientDocument>, telegramService: TelegramService, bufferClientService: BufferClientService, usersService: UsersService, archivedClientService: ArchivedClientService);
    create(createClientDto: CreateClientDto): Promise<Client>;
    findAll(): Promise<Client[]>;
    findAllMasked(query?: SearchClientDto): Promise<Client[]>;
    refreshMap(): Promise<void>;
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: UpdateClientDto): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<void>;
    updateClientSession(session: string, mobile: string, username: string, clientId: string): Promise<void>;
    updateClient(clientId: string): Promise<void>;
    updateClients(): Promise<void>;
    generateNewSession(phoneNumber: string, attempt?: number): Promise<void>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<Client[]>;
}
