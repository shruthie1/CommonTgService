import { TelegramService } from './../Telegram/Telegram.service';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
export declare class UsersService {
    private userModel;
    private telegramService;
    private clientsService;
    constructor(userModel: Model<UserDocument>, telegramService: TelegramService, clientsService: ClientService);
    create(user: CreateUserDto): Promise<User | undefined>;
    findAll(): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, user: UpdateUserDto): Promise<number>;
    updateByFilter(filter: any, user: UpdateUserDto): Promise<number>;
    delete(tgId: string): Promise<void>;
    deleteById(userId: string): Promise<void>;
    search(filter: SearchUserDto): Promise<User[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}> & User & Document & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    })[]>;
}
