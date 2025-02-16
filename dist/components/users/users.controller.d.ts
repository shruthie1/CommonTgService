import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(createUserDto: CreateUserDto): Promise<User>;
    search(queryParams: SearchUserDto): Promise<User[]>;
    findAll(): Promise<User[]>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, updateUserDto: UpdateUserDto): Promise<number>;
    remove(tgId: string): Promise<void>;
    executeQuery(requestBody: any): Promise<any>;
}
