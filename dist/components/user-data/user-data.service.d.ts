import { Model } from 'mongoose';
import { UserData, UserDataDocument } from './schemas/user-data.schema';
import { CreateUserDataDto } from './dto/create-user-data.dto';
export declare class UserDataService {
    private userDataModel;
    constructor(userDataModel: Model<UserDataDocument>);
    create(createUserDataDto: CreateUserDataDto): Promise<UserData>;
    findAll(): Promise<UserData[]>;
    findOne(chatId: string): Promise<UserData>;
    update(chatId: string, updateUserDataDto: Partial<UserData>): Promise<UserData>;
    remove(chatId: string): Promise<UserData>;
    search(filter: any): Promise<UserData[]>;
    executeQuery(query: any): Promise<any>;
}
