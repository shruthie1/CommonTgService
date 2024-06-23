import { TelegramService } from './../Telegram/Telegram.service';
import { Model } from 'mongoose';
import { Client, ClientDocument } from './schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { SetupClientQueryDto } from './dto/setup-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { ArchivedClientService } from '../archived-clients/archived-client.service';
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
    findOne(clientId: string): Promise<Client>;
    update(clientId: string, updateClientDto: Partial<Client>): Promise<Client>;
    remove(clientId: string): Promise<Client>;
    search(filter: any): Promise<Client[]>;
    setupClient(clientId: string, setupClientQueryDto: SetupClientQueryDto): Promise<void>;
    updateClient(session: string, mobile: string, userName: string, clientId: string): Promise<void>;
    generateNewSession(phoneNumber: any): Promise<void>;
    executeQuery(query: any): Promise<any>;
}
