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
exports.UserDataController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const user_data_service_1 = require("./user-data.service");
const create_user_data_dto_1 = require("./dto/create-user-data.dto");
const user_data_schema_1 = require("./schemas/user-data.schema");
const search_user_data_dto_1 = require("./dto/search-user-data.dto");
const update_user_data_dto_1 = require("./dto/update-user-data.dto");
const decorators_1 = require("../../decorators");
const interceptors_1 = require("../../interceptors");
let UserDataController = class UserDataController {
    constructor(userDataService) {
        this.userDataService = userDataService;
    }
    async create(createUserDataDto) {
        return this.userDataService.create(createUserDataDto);
    }
    async search(query) {
        return this.userDataService.search(query);
    }
    async findAll() {
        return this.userDataService.findAll();
    }
    async updateAll(chatId, updateUserDataDto) {
        return this.userDataService.updateAll(chatId, updateUserDataDto);
    }
    async findOne(profile, chatId) {
        return this.userDataService.findOne(profile, chatId);
    }
    async update(profile, chatId, updateUserDataDto) {
        return this.userDataService.update(profile, chatId, updateUserDataDto);
    }
    async remove(profile, chatId) {
        return this.userDataService.remove(profile, chatId);
    }
    clearCount(chatId) {
        return this.userDataService.clearCount(chatId);
    }
    async executeQuery(requestBody) {
        try {
            const { query, sort, limit, skip } = requestBody;
            return await this.userDataService.executeQuery(query, sort, limit, skip);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.UserDataController = UserDataController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data', description: 'Creates a new user data entry in the database.' }),
    (0, swagger_1.ApiBody)({ type: create_user_data_dto_1.CreateUserDataDto, description: 'User data to create' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'User data successfully created.', type: user_data_schema_1.UserData }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input data.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_data_dto_1.CreateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data', description: 'Searches user data based on provided query parameters.' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', required: false, description: 'User profile identifier', type: String, example: 'user123' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: false, description: 'Chat ID associated with the user', type: String, example: 'chat456' }),
    (0, swagger_1.ApiQuery)({ name: 'isTesting', required: false, description: 'Filter for testing users', type: Boolean, example: true }),
    (0, swagger_1.ApiQuery)({ name: 'banned', required: false, description: 'Filter for banned users', type: Boolean, example: false }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of matching user data.', type: [user_data_schema_1.UserData] }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid query parameters.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_user_data_dto_1.SearchDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data', description: 'Retrieves all user data entries from the database.' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of all user data.', type: [user_data_schema_1.UserData] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)('updateAll/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update all user data by chat ID', description: 'Updates all user data entries associated with a specific chat ID.' }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'Chat ID to update user data for', type: String, example: 'chat456' }),
    (0, swagger_1.ApiBody)({ type: update_user_data_dto_1.UpdateUserDataDto, description: 'User data fields to update' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User data successfully updated.', type: Object }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input data.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'No user data found for the given chat ID.' }),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_data_dto_1.UpdateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "updateAll", null);
__decorate([
    (0, common_1.Get)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by profile and chat ID', description: 'Retrieves a specific user data entry by profile and chat ID.' }),
    (0, swagger_1.ApiParam)({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User data found.', type: user_data_schema_1.UserData }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by profile and chat ID', description: 'Updates a specific user data entry identified by profile and chat ID.' }),
    (0, swagger_1.ApiParam)({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' }),
    (0, swagger_1.ApiBody)({ type: update_user_data_dto_1.UpdateUserDataDto, description: 'User data fields to update' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User data successfully updated.', type: user_data_schema_1.UserData }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input data.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_user_data_dto_1.UpdateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by profile and chat ID', description: 'Deletes a specific user data entry identified by profile and chat ID.' }),
    (0, swagger_1.ApiParam)({ name: 'profile', description: 'User profile identifier', type: String, example: 'user123' }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'Chat ID associated with the user', type: String, example: 'chat456' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User data successfully deleted.', type: user_data_schema_1.UserData }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('clear-count'),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Clear count for user data', description: 'Clears the count for user data, optionally filtered by chat ID.' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: false, description: 'Chat ID to clear count for', type: String, example: 'chat456' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Count cleared successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid chat ID.' }),
    __param(0, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserDataController.prototype, "clearCount", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query', description: 'Executes a custom MongoDB query with optional sorting, limiting, and skipping.' }),
    (0, swagger_1.ApiBody)({
        description: 'MongoDB query parameters',
        schema: {
            type: 'object',
            properties: {
                query: { type: 'object', description: 'MongoDB query object', example: { profile: 'user123' } },
                sort: { type: 'object', description: 'Sort criteria', example: { createdAt: -1 } },
                limit: { type: 'number', description: 'Maximum number of results', example: 10 },
                skip: { type: 'number', description: 'Number of results to skip', example: 0 }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Query executed successfully.', type: Object }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid query parameters.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "executeQuery", null);
exports.UserDataController = UserDataController = __decorate([
    (0, swagger_1.ApiTags)('UserData of TG clients'),
    (0, common_1.Controller)('userData'),
    __metadata("design:paramtypes", [user_data_service_1.UserDataService])
], UserDataController);
//# sourceMappingURL=user-data.controller.js.map