import { TelegramService } from './../Telegram/Telegram.service';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { BotsService } from '../bots';
export declare class UsersService {
    private userModel;
    private telegramService;
    private clientsService;
    private readonly botsService;
    constructor(userModel: Model<UserDocument>, telegramService: TelegramService, clientsService: ClientService, botsService: BotsService);
    create(user: CreateUserDto): Promise<User | undefined>;
    findAll(): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, user: UpdateUserDto): Promise<number>;
    updateByFilter(filter: any, user: UpdateUserDto): Promise<number>;
    delete(tgId: string): Promise<void>;
    deleteById(userId: string): Promise<void>;
    search(filter: SearchUserDto): Promise<User[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>, {}> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    })[]>;
    getTopInteractionUsers(options: {
        page?: number;
        limit?: number;
        minScore?: number;
        minCalls?: number;
        minPhotos?: number;
        minVideos?: number;
        excludeExpired?: boolean;
        excludeTwoFA?: boolean;
        gender?: string;
    }): Promise<{
        users: Array<User & {
            interactionScore: number;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}
