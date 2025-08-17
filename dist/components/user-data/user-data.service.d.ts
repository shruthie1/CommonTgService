import { Model, FilterQuery, UpdateQuery } from 'mongoose';
import { UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
export declare class UserDataService {
    private readonly userDataModel;
    private callCounts;
    private logger;
    constructor(userDataModel: Model<UserDataDocument>);
    create(createUserDataDto: CreateUserDataDto): Promise<UserDataDocument>;
    findAll(limit?: number): Promise<UserDataDocument[]>;
    findOne(profile: string, chatId: string): Promise<UserDataDocument & {
        count?: number;
    }>;
    clearCount(chatId?: string): string;
    update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserDataDocument>;
    updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<import("mongoose").UpdateWriteOpResult>;
    remove(profile: string, chatId: string): Promise<UserDataDocument>;
    search(filter: any): Promise<UserDataDocument[]>;
    executeQuery(query: FilterQuery<UserDataDocument>, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<UserDataDocument[]>;
    resetPaidUsers(): Promise<import("mongoose").UpdateWriteOpResult>;
    incrementTotalCount(profile: string, chatId: string, amount?: number): Promise<UserDataDocument>;
    incrementPayAmount(profile: string, chatId: string, amount: number): Promise<UserDataDocument>;
    updateLastActive(profile: string, chatId: string): Promise<UserDataDocument>;
    findInactiveSince(date: Date): Promise<UserDataDocument[]>;
    findByPaymentRange(minAmount: number, maxAmount: number): Promise<UserDataDocument[]>;
    bulkUpdateUsers(filter: any, update: UpdateQuery<UserDataDocument>): Promise<import("mongoose").UpdateWriteOpResult>;
    findActiveUsers(threshold?: number): Promise<UserDataDocument[]>;
    removeOlderThanOneMonth(): Promise<{
        deletedCount: number;
    }>;
    resetUserCounts(profile: string, chatId: string): Promise<UserDataDocument>;
}
