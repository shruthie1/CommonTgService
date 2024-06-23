import { TelegramService } from './../Telegram/Telegram.service';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
export declare class UsersService {
    private userModel;
    private telegramService;
    private clientsService;
    constructor(userModel: Model<User>, telegramService: TelegramService, clientsService: ClientService);
    create(user: User): Promise<User>;
    findAll(): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, user: Partial<User>): Promise<User>;
    delete(tgId: string): Promise<void>;
    search(filter: SearchUserDto): Promise<User[]>;
    executeQuery(query: any, sort?: any, limit?: number): Promise<User[]>;
}
