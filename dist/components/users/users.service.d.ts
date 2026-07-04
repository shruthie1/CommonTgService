import { TelegramService } from '../Telegram/Telegram.service';
import { Model, QueryFilter } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { BotsService } from '../bots';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';
export declare class UsersService {
    private userModel;
    private telegramService;
    private clientsService;
    private readonly botsService;
    private bufferClientService;
    private promoteClientService;
    private readonly logger;
    constructor(userModel: Model<UserDocument>, telegramService: TelegramService, clientsService: ClientService, botsService: BotsService, bufferClientService: BufferClientService, promoteClientService: PromoteClientService);
    expireAccount(mobile: string, reason?: string): Promise<void>;
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
        starred?: boolean;
    }): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    leaderboard(options: {
        aspect: string;
        limit?: number;
    }): Promise<{
        ranked: any[];
        stats: {
            highest: number;
            average: number;
            withValue: number;
        };
    }>;
    findAll(limit?: number, skip?: number): Promise<User[]>;
    private hasQueryConstraint;
    private coerceDateOperands;
    private getDefaultUserListQuery;
    findAllSorted(limit?: number, skip?: number, sort?: Record<string, 1 | -1>): Promise<User[]>;
    summary(): Promise<Record<string, any>>;
    paginated(options: {
        page?: number;
        limit?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
        filter?: 'all' | 'active' | 'starred' | 'expired' | 'withCalls';
    }): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findOne(tgId: string): Promise<User>;
    findByMobileAnyStatus(mobile: string): Promise<User[]>;
    backfillFromPool(input: {
        mobile: string;
        tgId?: string | null;
        session?: string | null;
    }): Promise<User | null>;
    update(tgId: string, updateDto: UpdateUserDto): Promise<User>;
    updateByFilter(filter: QueryFilter<UserDocument>, updateDto: UpdateUserDto): Promise<number>;
    toggleStar(mobile: string): Promise<{
        mobile: string;
        starred: boolean;
    }>;
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
    private canonicalMobile;
    aggregateSort(computedField: string, sortOrder?: 1 | -1, limit?: number, skip?: number, query?: QueryFilter<UserDocument>): Promise<any[]>;
    private static readonly COMPOSITE_SIGNALS;
    compositeRank(signals: Array<{
        field: string;
        weight?: number;
    }>, limit?: number, skip?: number, query?: QueryFilter<UserDocument>): Promise<any[]>;
    executeQuery(query: QueryFilter<UserDocument>, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<User[]>;
}
