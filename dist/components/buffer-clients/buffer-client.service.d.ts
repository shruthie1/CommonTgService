import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient } from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../activechannels/activechannels.service';
import { ClientService } from '../clients/client.service';
export declare class BufferClientService {
    private bufferClientModel;
    private telegramService;
    private usersService;
    private activeChannelsService;
    private clientService;
    constructor(bufferClientModel: Model<BufferClient>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService);
    create(bufferClient: CreateBufferClientDto): Promise<BufferClient>;
    findAll(): Promise<BufferClient[]>;
    findOne(mobile: string): Promise<BufferClient>;
    updatedocs(): Promise<void>;
    update(mobile: string, user: Partial<BufferClient>): Promise<BufferClient>;
    remove(mobile: string): Promise<void>;
    search(filter: any): Promise<BufferClient[]>;
    executeQuery(query: any): Promise<BufferClient[]>;
    joinchannelForBufferClients(): Promise<void>;
    setAsBufferClient(mobile: string, availableDate?: string): Promise<string>;
    checkBufferClients(): Promise<void>;
    addNewUserstoBufferClients(badIds: string[], goodIds: string[]): Promise<void>;
}
