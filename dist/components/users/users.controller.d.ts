import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ExecuteUserQueryDto } from './dto/execute-user-query.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(createUserDto: CreateUserDto): Promise<User>;
    search(queryParams: SearchUserDto): Promise<User[]>;
    topRelationships(page?: string, limit?: string, minScore?: string, gender?: string, excludeTwoFA?: string): Promise<{
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
    getTopInteractionUsers(page?: string, limit?: string, minScore?: string, minCalls?: string, minPhotos?: string, minVideos?: string, excludeTwoFA?: string, excludeAudited?: string, gender?: string, starred?: string): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findAll(limit?: string, skip?: string, sortBy?: string, sortOrder?: string): Promise<User[]>;
    getUserRelationships(mobile: string): Promise<User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    aggregateSort(field: string, sortOrder?: string, limit?: string, skip?: string): Promise<any[]>;
    recomputeScore(mobile: string): Promise<User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    }>;
    findOne(tgId: string): Promise<User>;
    update(tgId: string, updateUserDto: UpdateUserDto): Promise<User>;
    toggleStar(mobile: string): Promise<{
        mobile: string;
        starred: boolean;
    }>;
    expire(tgId: string): Promise<void>;
    executeQuery(requestBody: ExecuteUserQueryDto): Promise<any>;
}
