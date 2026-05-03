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
const user_schema_1 = require("./schemas/user.schema");
const swagger_1 = require("@nestjs/swagger");
const search_user_dto_1 = require("./dto/search-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const create_user_dto_1 = require("./dto/create-user.dto");
const execute_user_query_dto_1 = require("./dto/execute-user-query.dto");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async create(createUserDto) {
        return this.usersService.create(createUserDto);
    }
    async search(queryParams) {
        return this.usersService.search(queryParams);
    }
    async topRelationships(page, limit, minScore, gender, excludeTwoFA) {
        return this.usersService.topRelationships({
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            minScore: minScore ? parseFloat(minScore) : undefined,
            gender,
            excludeTwoFA: excludeTwoFA === 'true'
        });
    }
    async getTopInteractionUsers(page, limit, minScore, minCalls, minPhotos, minVideos, excludeTwoFA, excludeAudited, gender, starred) {
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
        const excludeTwoFABool = excludeTwoFA === 'true' ? true : (excludeTwoFA === 'false' ? false : undefined);
        const excludeAuditedBool = excludeAudited === 'true';
        return this.usersService.top({
            page: pageNum,
            limit: limitNum,
            minScore: minScoreNum,
            minCalls: minCallsNum,
            minPhotos: minPhotosNum,
            minVideos: minVideosNum,
            excludeTwoFA: excludeTwoFABool,
            excludeAudited: excludeAuditedBool,
            gender,
            starred: starred === 'true' ? true : undefined
        });
    }
    async leaderboard(aspect, limit) {
        if (!aspect)
            throw new common_1.BadRequestException('aspect query parameter is required');
        return this.usersService.leaderboard({
            aspect,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }
    async summary() {
        return this.usersService.summary();
    }
    async paginated(page, limit, sortBy, sortOrder, search, filter) {
        return this.usersService.paginated({
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            sortBy: sortBy || undefined,
            sortOrder: (sortOrder === 'asc' ? 'asc' : 'desc'),
            search: search || undefined,
            filter: filter || undefined,
        });
    }
    async findAll(limit, skip, sortBy, sortOrder) {
        const limitNum = limit ? parseInt(limit, 10) : 100;
        const skipNum = skip ? parseInt(skip, 10) : 0;
        if (isNaN(limitNum) || limitNum < 1) {
            throw new common_1.BadRequestException('Limit must be a positive integer');
        }
        if (isNaN(skipNum) || skipNum < 0) {
            throw new common_1.BadRequestException('Skip must be a non-negative integer');
        }
        const sort = sortBy ? { [sortBy]: (sortOrder === 'asc' ? 1 : -1) } : undefined;
        return this.usersService.findAllSorted(limitNum, skipNum, sort);
    }
    async getUserRelationships(mobile) {
        return this.usersService.getUserRelationships(mobile);
    }
    async aggregateSort(field, sortOrder, limit, skip) {
        if (!field)
            throw new common_1.BadRequestException('field is required');
        const order = sortOrder === 'asc' ? 1 : -1;
        const limitNum = limit ? parseInt(limit, 10) : 20;
        const skipNum = skip ? parseInt(skip, 10) : 0;
        return this.usersService.aggregateSort(field, order, limitNum, skipNum);
    }
    async recomputeScore(mobile) {
        await this.usersService.computeRelationshipScore(mobile);
        return this.usersService.getUserRelationships(mobile);
    }
    async findOne(tgId) {
        return this.usersService.findOne(tgId);
    }
    async update(tgId, updateUserDto) {
        return this.usersService.update(tgId, updateUserDto);
    }
    async toggleStar(mobile) {
        return this.usersService.toggleStar(mobile);
    }
    async expire(tgId) {
        return this.usersService.delete(tgId);
    }
    async executeQuery(requestBody) {
        const { query, sort, limit, skip } = requestBody;
        return this.usersService.executeQuery(query, sort, limit, skip);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new user' }),
    (0, swagger_1.ApiBody)({ type: create_user_dto_1.CreateUserDto }),
    (0, swagger_1.ApiCreatedResponse)({ type: user_schema_1.User }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('/search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search users' }),
    (0, swagger_1.ApiQuery)({ name: 'tgId', required: false, description: 'Telegram ID' }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false, description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'twoFA', required: false, description: '2FA status', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'expired', required: false, description: 'Expiration status', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'session', required: false, description: 'Session string' }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', required: false, description: 'First name (partial match)' }),
    (0, swagger_1.ApiQuery)({ name: 'lastName', required: false, description: 'Last name' }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, description: 'Telegram username' }),
    (0, swagger_1.ApiQuery)({ name: 'gender', required: false, description: 'Gender' }),
    (0, swagger_1.ApiQuery)({ name: 'demoGiven', required: false, description: 'Demo given status', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'starred', required: false, description: 'Starred status', type: Boolean }),
    (0, swagger_1.ApiOkResponse)({ type: [user_schema_1.User] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_user_dto_1.SearchUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('top-relationships'),
    (0, swagger_1.ApiOperation)({ summary: 'Get users ranked by relationship quality' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minScore', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'gender', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'excludeTwoFA', required: false, type: Boolean }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { users: { type: 'array' }, total: { type: 'number' }, page: { type: 'number' }, limit: { type: 'number' }, totalPages: { type: 'number' } } } }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('minScore')),
    __param(3, (0, common_1.Query)('gender')),
    __param(4, (0, common_1.Query)('excludeTwoFA')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "topRelationships", null);
__decorate([
    (0, common_1.Get)('top-interacted'),
    (0, swagger_1.ApiOperation)({ summary: 'Get users ranked by interaction score' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minScore', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minCalls', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minPhotos', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minVideos', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'excludeTwoFA', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'excludeAudited', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'gender', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'starred', required: false, type: Boolean }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { users: { type: 'array' }, total: { type: 'number' }, page: { type: 'number' }, limit: { type: 'number' }, totalPages: { type: 'number' } } } }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('minScore')),
    __param(3, (0, common_1.Query)('minCalls')),
    __param(4, (0, common_1.Query)('minPhotos')),
    __param(5, (0, common_1.Query)('minVideos')),
    __param(6, (0, common_1.Query)('excludeTwoFA')),
    __param(7, (0, common_1.Query)('excludeAudited')),
    __param(8, (0, common_1.Query)('gender')),
    __param(9, (0, common_1.Query)('starred')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getTopInteractionUsers", null);
__decorate([
    (0, common_1.Get)('leaderboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Get ranked users for leaderboard by aspect' }),
    (0, swagger_1.ApiQuery)({ name: 'aspect', required: true, type: String, description: 'Aspect to rank by: msgs, totalChats, personalChats, channels, contacts, totalCalls, incomingCalls, outgoingCalls, videoCalls, totalMedia, otherPhotos, otherVideos, ownPhotos, ownVideos, movieCount, relationshipScore, relationshipBestScore, engagement, recency' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of top users to return (default: 25, max: 100)' }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                ranked: { type: 'array' },
                stats: {
                    type: 'object',
                    properties: {
                        highest: { type: 'number' },
                        average: { type: 'number' },
                        withValue: { type: 'number' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Query)('aspect')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "leaderboard", null);
__decorate([
    (0, common_1.Get)('summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Get aggregated user stats for dashboard' }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                total: { type: 'number' },
                active: { type: 'number' },
                starred: { type: 'number' },
                expired: { type: 'number' },
                withTwoFA: { type: 'number' },
                withCalls: { type: 'number' },
                withRelationship: { type: 'number' },
                avgMsgs: { type: 'number' },
                avgContacts: { type: 'number' },
                avgChats: { type: 'number' },
                totalMsgs: { type: 'number' },
                totalCalls: { type: 'number' },
                totalContacts: { type: 'number' },
                genderBreakdown: { type: 'object' },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('paginated'),
    (0, swagger_1.ApiOperation)({ summary: 'Get paginated users with search and filters' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50, max: 200)' }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false, type: String, description: 'Sort field (default: lastActive)' }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, type: String, description: 'asc or desc (default: desc)' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: 'Search by name, mobile, username, or tgId' }),
    (0, swagger_1.ApiQuery)({ name: 'filter', required: false, type: String, description: 'all | active | starred | expired | withCalls' }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                users: { type: 'array' },
                total: { type: 'number' },
                page: { type: 'number' },
                limit: { type: 'number' },
                totalPages: { type: 'number' },
            },
        },
    }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('sortBy')),
    __param(3, (0, common_1.Query)('sortOrder')),
    __param(4, (0, common_1.Query)('search')),
    __param(5, (0, common_1.Query)('filter')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "paginated", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all users with optional sorting' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'skip', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false, type: String, description: 'Field to sort by (e.g. msgs, totalChats, contacts, calls.totalCalls, score, lastActive, otherPhotoCount, otherVideoCount, relationships.score)' }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, type: String, description: 'Sort order: asc or desc (default: desc)' }),
    (0, swagger_1.ApiOkResponse)({ type: [user_schema_1.User] }),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('skip')),
    __param(2, (0, common_1.Query)('sortBy')),
    __param(3, (0, common_1.Query)('sortOrder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':mobile/relationships'),
    (0, swagger_1.ApiOperation)({ summary: 'Get relationship details for a specific user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: user_schema_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserRelationships", null);
__decorate([
    (0, common_1.Get)('aggregate-sort'),
    (0, swagger_1.ApiOperation)({ summary: 'Sort users by computed/nested fields (global)' }),
    (0, swagger_1.ApiQuery)({ name: 'field', required: true, type: String, description: 'Computed field: intimateTotal, privateMsgsTopContacts, privateMediaTopContacts, privateVoiceTotal, privateMsgsBestContact, relTopIntimate, relTopMedia, relTopVoice, relCommonChats, relTopCalls, relMeaningfulCalls, relMutualContacts, callPartners, totalCallDuration, longestCall, missedCalls, privateMsgsCallPartners' }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, type: String, description: 'asc or desc (default: desc)' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'skip', required: false, type: Number }),
    (0, swagger_1.ApiOkResponse)({ type: [user_schema_1.User] }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Unknown computed field.' }),
    __param(0, (0, common_1.Query)('field')),
    __param(1, (0, common_1.Query)('sortOrder')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('skip')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "aggregateSort", null);
__decorate([
    (0, common_1.Post)('recompute-score/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Recompute relationship score (live Telegram connection)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: user_schema_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "recomputeScore", null);
__decorate([
    (0, common_1.Get)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'Telegram user ID', type: String }),
    (0, swagger_1.ApiOkResponse)({ type: user_schema_1.User }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'Telegram user ID', type: String }),
    (0, swagger_1.ApiBody)({ type: update_user_dto_1.UpdateUserDto }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'number', description: 'Number of modified documents' } }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('tgId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':mobile/star'),
    (0, swagger_1.ApiOperation)({ summary: 'Toggle starred status for a user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiOkResponse)({ schema: { type: 'object', properties: { mobile: { type: 'string' }, starred: { type: 'boolean' } } } }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "toggleStar", null);
__decorate([
    (0, common_1.Patch)(':tgId/expire'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark user as expired (soft delete)' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'Telegram user ID', type: String }),
    (0, swagger_1.ApiOkResponse)({ description: 'User marked as expired.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'User not found.' }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "expire", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: execute_user_query_dto_1.ExecuteUserQueryDto }),
    (0, swagger_1.ApiOkResponse)({ type: [user_schema_1.User] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [execute_user_query_dto_1.ExecuteUserQueryDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "executeQuery", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Telegram Users'),
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map