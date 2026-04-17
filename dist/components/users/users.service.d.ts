import { TelegramService } from './../Telegram/Telegram.service';
import { Model, QueryFilter } from 'mongoose';
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
    private readonly logger;
    constructor(userModel: Model<UserDocument>, telegramService: TelegramService, clientsService: ClientService, botsService: BotsService);
    create(user: CreateUserDto): Promise<User | undefined>;
    top(options: {
        page?: number;
        limit?: number;
        minScore?: number;
        minCalls?: number;
        minPhotos?: number;
        minVideos?: number;
        excludeTwoFA?: boolean;
        excludeAudited?: boolean;
        gender?: string;
    }): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findAll(limit?: number, skip?: number): Promise<User[]>;
    findAllSorted(limit?: number, skip?: number, sort?: Record<string, 1 | -1>): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, updateDto: UpdateUserDto): Promise<number>;
    updateByFilter(filter: QueryFilter<UserDocument>, updateDto: UpdateUserDto): Promise<number>;
    delete(tgId: string): Promise<void>;
    search(filter: SearchUserDto): Promise<User[]>;
    computeRelationshipScore(mobile: string): Promise<void>;
    topRelationships(options: {
        page?: number;
        limit?: number;
        minScore?: number;
        gender?: string;
        excludeTwoFA?: boolean;
    }): Promise<{
        users: (User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
            _id: import("mongoose").Types.ObjectId;
        }> & {
            __v: number;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getUserRelationships(mobile: string): Promise<User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    aggregateSort(computedField: string, sortOrder?: 1 | -1, limit?: number, skip?: number): Promise<any[]>;
    executeQuery(query: QueryFilter<UserDocument>, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<User[]>;
}
