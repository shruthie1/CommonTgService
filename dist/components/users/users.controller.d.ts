import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(createUserDto: User): Promise<User>;
    search(queryParams: SearchUserDto): Promise<User[]>;
    findAll(): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, updateUserDto: Partial<User>): Promise<User>;
    remove(tgId: string): Promise<void>;
    executeQuery(query: any): Promise<any>;
}
