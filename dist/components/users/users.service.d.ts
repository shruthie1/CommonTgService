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
    constructor(userModel: Model<UserDocument>, telegramService: TelegramService, clientsService: ClientService, botsService: BotsService);
    create(user: CreateUserDto): Promise<User | undefined>;
    findAll(limit?: number, skip?: number): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, updateDto: UpdateUserDto): Promise<number>;
    updateByFilter(filter: QueryFilter<UserDocument>, updateDto: UpdateUserDto): Promise<number>;
    delete(tgId: string): Promise<void>;
    deleteById(userId: string): Promise<void>;
    search(filter: SearchUserDto): Promise<User[]>;
    executeQuery(query: QueryFilter<UserDocument>, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<User[]>;
    getTopInteractionUsers(options: {
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
        users: Array<User & {
            interactionScore: number;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}
