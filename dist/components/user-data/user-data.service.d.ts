import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
export declare class UserDataService {
    private userDataModel;
    constructor(userDataModel: Model<UserDataDocument>);
    create(createUserDataDto: CreateUserDataDto): Promise<UserData>;
    findAll(): Promise<UserData[]>;
    findOne(profile: string, chatId: string): Promise<UserData>;
    update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData>;
    updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData>;
    remove(profile: string, chatId: string): Promise<UserData>;
    search(filter: any): Promise<UserData[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<UserData[]>;
    resetPaidUsers(): Promise<void>;
}
