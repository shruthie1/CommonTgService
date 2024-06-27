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
    findOne(chatId: string): Promise<UserData>;
    update(chatId: string, updateUserDataDto: UpdateUserDataDto): Promise<UserData>;
    remove(chatId: string): Promise<UserData>;
    executeQuery(requestBody: any): Promise<any>;
}
