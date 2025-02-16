/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/inferschematype" />
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
export declare class UserDataService {
    private userDataModel;
    private callCounts;
    constructor(userDataModel: Model<UserDataDocument>);
    create(createUserDataDto: CreateUserDataDto): Promise<UserData>;
    findAll(): Promise<UserData[]>;
    findOne(profile: string, chatId: string): Promise<UserData & {
        count?: number;
    }>;
    clearCount(chatId?: string): string;
    update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData>;
    updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<any>;
    remove(profile: string, chatId: string): Promise<UserData>;
    search(filter: any): Promise<UserData[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<UserData[]>;
    resetPaidUsers(): Promise<void>;
}
