import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient, BufferClientDocument } from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../activechannels/activechannels.service';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
export declare class BufferClientService {
    private bufferClientModel;
    private telegramService;
    private usersService;
    private activeChannelsService;
    private clientService;
    constructor(bufferClientModel: Model<BufferClientDocument>, telegramService: TelegramService, usersService: UsersService, activeChannelsService: ActiveChannelsService, clientService: ClientService);
    create(bufferClient: CreateBufferClientDto): Promise<BufferClient>;
    findAll(): Promise<BufferClient[]>;
    findOne(mobile: string): Promise<BufferClient>;
    update(mobile: string, user: UpdateBufferClientDto): Promise<BufferClient>;
    remove(mobile: string): Promise<void>;
    search(filter: any): Promise<BufferClient[]>;
    executeQuery(query: any): Promise<BufferClient[]>;
    joinchannelForBufferClients(): Promise<void>;
    setAsBufferClient(mobile: string, availableDate?: string): Promise<string>;
    checkBufferClients(): Promise<void>;
    addNewUserstoBufferClients(badIds: string[], goodIds: string[]): Promise<void>;
}
