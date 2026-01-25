"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("./users.service");
const swagger_1 = require("@nestjs/swagger");
const search_user_dto_1 = require("./dto/search-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const create_user_dto_1 = require("./dto/create-user.dto");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async create(createUserDto) {
        console.log("creating new user");
        return this.usersService.create(createUserDto);
    }
    async search(queryParams) {
        return this.usersService.search(queryParams);
    }
    async getTopInteractionUsers(page, limit, minScore, minCalls, minPhotos, minVideos, excludeExpired, excludeTwoFA, gender) {
        const pageNum = page ? parseInt(page, 10) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        const minScoreNum = minScore ? parseFloat(minScore) : undefined;
        const minCallsNum = minCalls ? parseInt(minCalls, 10) : undefined;
        const minPhotosNum = minPhotos ? parseInt(minPhotos, 10) : undefined;
        const minVideosNum = minVideos ? parseInt(minVideos, 10) : undefined;
        if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
            throw new common_1.BadRequestException('Page must be a positive integer');
        }
        if (limitNum !== undefined && (isNaN(limitNum) || limitNum < 1 || limitNum > 100)) {
            throw new common_1.BadRequestException('Limit must be between 1 and 100');
        }
        if (minScoreNum !== undefined && (isNaN(minScoreNum) || minScoreNum < 0)) {
            throw new common_1.BadRequestException('minScore must be a non-negative number');
        }
        if (minCallsNum !== undefined && (isNaN(minCallsNum) || minCallsNum < 0)) {
            throw new common_1.BadRequestException('minCalls must be a non-negative integer');
        }
        if (minPhotosNum !== undefined && (isNaN(minPhotosNum) || minPhotosNum < 0)) {
            throw new common_1.BadRequestException('minPhotos must be a non-negative integer');
        }
        if (minVideosNum !== undefined && (isNaN(minVideosNum) || minVideosNum < 0)) {
            throw new common_1.BadRequestException('minVideos must be a non-negative integer');
        }
        const excludeExpiredBool = excludeExpired === 'false' ? false : (excludeExpired === 'true' ? true : undefined);
        const excludeTwoFABool = excludeTwoFA === 'true' ? true : (excludeTwoFA === 'false' ? false : undefined);
        return this.usersService.getTopInteractionUsers({
            page: pageNum,
            limit: limitNum,
            minScore: minScoreNum,
            minCalls: minCallsNum,
            minPhotos: minPhotosNum,
            minVideos: minVideosNum,
            excludeExpired: excludeExpiredBool,
            excludeTwoFA: excludeTwoFABool,
            gender
        });
    }
    async findAll(limit, skip) {
        const limitNum = limit ? parseInt(limit, 10) : 100;
        const skipNum = skip ? parseInt(skip, 10) : 0;
        if (isNaN(limitNum) || limitNum < 1) {
            throw new common_1.BadRequestException('Limit must be a positive integer');
        }
        if (isNaN(skipNum) || skipNum < 0) {
            throw new common_1.BadRequestException('Skip must be a non-negative integer');
        }
        return this.usersService.findAll(limitNum, skipNum);
    }
    async findOne(tgId) {
        return this.usersService.findOne(tgId);
    }
    async update(tgId, updateUserDto) {
        return this.usersService.update(tgId, updateUserDto);
    }
    async remove(tgId) {
        return this.usersService.delete(tgId);
    }
    async executeQuery(requestBody) {
        const { query, sort, limit, skip } = requestBody;
        try {
            return await this.usersService.executeQuery(query, sort, limit, skip);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new user' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('/search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search users based on various parameters' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_user_dto_1.SearchUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('top-interacted'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get users with top interaction scores',
        description: 'Retrieves users ranked by interaction score calculated from saved DB stats. ' +
            'Score is based on photos, videos, calls, and other interactions. ' +
            'Movie count has negative weightage as it indicates less genuine interaction. ' +
            'Supports filtering and pagination for efficient data retrieval.'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'page',
        required: false,
        type: Number,
        description: 'Page number (default: 1, minimum: 1)',
        example: 1,
        minimum: 1
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of results per page (default: 20, max: 100)',
        example: 20,
        minimum: 1,
        maximum: 100
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minScore',
        required: false,
        type: Number,
        description: 'Minimum interaction score to include (default: 0)',
        example: 100,
        minimum: 0
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minCalls',
        required: false,
        type: Number,
        description: 'Minimum total calls required (default: 0)',
        example: 5,
        minimum: 0
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minPhotos',
        required: false,
        type: Number,
        description: 'Minimum photos required (default: 0)',
        example: 10,
        minimum: 0
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minVideos',
        required: false,
        type: Number,
        description: 'Minimum videos required (default: 0)',
        example: 5,
        minimum: 0
    }),
    (0, swagger_1.ApiQuery)({
        name: 'excludeExpired',
        required: false,
        type: Boolean,
        description: 'Exclude expired users (default: true)',
        example: true
    }),
    (0, swagger_1.ApiQuery)({
        name: 'excludeTwoFA',
        required: false,
        type: Boolean,
        description: 'Exclude users with 2FA enabled (default: false)',
        example: false
    }),
    (0, swagger_1.ApiQuery)({
        name: 'gender',
        required: false,
        type: String,
        description: 'Filter by gender',
        example: 'male'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Users retrieved successfully with interaction scores',
        schema: {
            type: 'object',
            properties: {
                users: {
                    type: 'array',
                    description: 'List of users with interaction scores',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'User ID' },
                            mobile: { type: 'string' },
                            tgId: { type: 'string' },
                            firstName: { type: 'string' },
                            lastName: { type: 'string' },
                            username: { type: 'string' },
                            photoCount: { type: 'number' },
                            videoCount: { type: 'number' },
                            ownPhotoCount: { type: 'number' },
                            ownVideoCount: { type: 'number' },
                            otherPhotoCount: { type: 'number' },
                            otherVideoCount: { type: 'number' },
                            movieCount: { type: 'number', description: 'Has negative impact on score' },
                            calls: {
                                type: 'object',
                                properties: {
                                    outgoing: { type: 'number' },
                                    incoming: { type: 'number' },
                                    video: { type: 'number' },
                                    totalCalls: { type: 'number' }
                                }
                            },
                            interactionScore: {
                                type: 'number',
                                description: 'Calculated interaction score (higher = more active/engaged)'
                            }
                        }
                    }
                },
                total: { type: 'number', description: 'Total number of users matching filters' },
                page: { type: 'number', description: 'Current page number' },
                limit: { type: 'number', description: 'Results per page' },
                totalPages: { type: 'number', description: 'Total number of pages' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - invalid query parameters' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal Server Error' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('minScore')),
    __param(3, (0, common_1.Query)('minCalls')),
    __param(4, (0, common_1.Query)('minPhotos')),
    __param(5, (0, common_1.Query)('minVideos')),
    __param(6, (0, common_1.Query)('excludeExpired')),
    __param(7, (0, common_1.Query)('excludeTwoFA')),
    __param(8, (0, common_1.Query)('gender')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getTopInteractionUsers", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all users' }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of results to return (default: 100)',
        example: 100
    }),
    (0, swagger_1.ApiQuery)({
        name: 'skip',
        required: false,
        type: Number,
        description: 'Number of results to skip (default: 0)',
        example: 0
    }),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('skip')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "executeQuery", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Telegram Users'),
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map