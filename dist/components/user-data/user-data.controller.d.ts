import { UserDataService } from './user-data.service';
import { CreateUserDataDto } from './dto/create-user-data.dto';
import { UserData } from './schemas/user-data.schema';
import { SearchDto } from './dto/search-user-data.dto';
import { UpdateUserDataDto } from './dto/update-user-data.dto';
export declare class UserDataController {
    private readonly userDataService;
    constructor(userDataService: UserDataService);
    create(createUserDataDto: CreateUserDataDto): Promise<UserData>;
    search(query: SearchDto): Promise<UserData[]>;
    findAll(): Promise<UserData[]>;
    updateAll(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<any>;
    findOne(profile: string, chatId: string): Promise<UserData>;
    update(profile: string, chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData>;
    remove(profile: string, chatId: string): Promise<UserData>;
    clearCount(chatId?: string): string;
    executeQuery(requestBody: any): Promise<any>;
}
