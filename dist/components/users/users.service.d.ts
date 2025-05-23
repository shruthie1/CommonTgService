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
/// <reference types="mongoose/types/inferrawdoctype" />
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
    search(filter: SearchUserDto): Promise<User[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<User[]>;
}
