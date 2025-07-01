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
exports.SessionController = exports.SearchAuditDto = exports.CreateSessionDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const session_service_1 = require("./session.service");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class CreateSessionDto {
}
exports.CreateSessionDto = CreateSessionDto;
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Phone number with country code (optional if session provided)',
        example: '+1234567890'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Existing session string to use',
        example: '1BVtsOHIBu2iBJgvn6U6SfJTgN6zPg2CwJjFBw5wHkJfFpBVts...'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "session", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Force creation of new session even if active session exists',
        default: false
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateSessionDto.prototype, "forceNew", void 0);
class SearchAuditDto {
}
exports.SearchAuditDto = SearchAuditDto;
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Phone number to search for',
        example: '+1234567890'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchAuditDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Session status to filter by',
        enum: ['created', 'active', 'expired', 'revoked', 'failed']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchAuditDto.prototype, "status", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Number of records to return',
        default: 10,
        minimum: 1
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SearchAuditDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({
        description: 'Number of records to skip',
        default: 0,
        minimum: 0
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], SearchAuditDto.prototype, "offset", void 0);
let SessionController = class SessionController {
    constructor(sessionService) {
        this.sessionService = sessionService;
    }
    async createSession(body) {
        try {
            if (!body.mobile && !body.session) {
                throw new common_1.HttpException({
                    success: false,
                    message: 'Either mobile number or session string is required'
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            if (!body.forceNew && body.mobile) {
                const validSessionResult = await this.sessionService.findRecentValidSession(body.mobile);
                if (validSessionResult.success && validSessionResult.session) {
                    if (validSessionResult.session.usageCount < 30) {
                        try {
                            await this.sessionService.updateSessionLastUsed(body.mobile, validSessionResult.session.sessionString);
                        }
                        catch (updateError) {
                            console.log('Warning: Failed to update session last used timestamp:', updateError.message);
                        }
                        return {
                            success: true,
                            message: 'Valid session found from this month',
                            session: validSessionResult.session.sessionString,
                            isNew: false
                        };
                    }
                    else {
                        console.log('Valid session found but usage count exceeded, Proceeding with new session creation');
                    }
                }
                else {
                    console.log('No valid session found from this month');
                }
            }
            const options = {
                mobile: body.mobile,
                oldSession: body.session
            };
            const result = await this.sessionService.createSession(options);
            if (result.success) {
                return {
                    success: true,
                    message: 'Session created successfully',
                    session: result.session,
                    isNew: true
                };
            }
            else {
                throw new common_1.HttpException({
                    success: false,
                    message: result.error,
                    retryable: result.retryable
                }, result.retryable ? common_1.HttpStatus.TOO_MANY_REQUESTS : common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                message: error.message || 'Failed to create/retrieve session'
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchAudit(mobile, status, limit, offset) {
        try {
            const safeLimit = limit && !isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
            const safeOffset = offset && !isNaN(Number(offset)) && Number(offset) >= 0 ? Number(offset) : 0;
            const options = {
                limit: safeLimit,
                offset: safeOffset
            };
            let result;
            if (mobile) {
                result = await this.sessionService.getSessionAuditHistory(mobile, {
                    ...options,
                    status: status
                });
            }
            else {
                throw new common_1.HttpException({
                    success: false,
                    message: 'Mobile number is required for search'
                }, common_1.HttpStatus.BAD_REQUEST);
            }
            if (result.success) {
                return {
                    success: true,
                    data: result.data || [],
                    total: result.total || 0,
                    message: `Retrieved ${result.data?.length || 0} audit records`
                };
            }
            else {
                throw new common_1.HttpException({
                    success: false,
                    message: result.error || 'Failed to retrieve audit records'
                }, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException({
                success: false,
                message: error.message || 'Failed to search audit records'
            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.SessionController = SessionController;
__decorate([
    (0, common_1.Post)('create'),
    (0, swagger_1.ApiOperation)({
        summary: 'Master session creation endpoint',
        description: 'Creates or retrieves a session based on provided parameters. If forceNew is true, always creates a new session. If forceNew is false, returns active session if exists and was used this month, otherwise creates new.'
    }),
    (0, swagger_1.ApiBody)({ type: CreateSessionDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Session created or retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Session created successfully' },
                session: { type: 'string', example: '1BVtsOHIBu2iBJgvn6U6SfJTgN6z...' },
                isNew: { type: 'boolean', example: true }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Bad request - validation failed or session creation failed'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateSessionDto]),
    __metadata("design:returntype", Promise)
], SessionController.prototype, "createSession", null);
__decorate([
    (0, common_1.Get)('audit/search'),
    (0, swagger_1.ApiOperation)({
        summary: 'Search existing audit sessions',
        description: 'Search and retrieve session audit records based on various criteria'
    }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false, type: String, description: 'Phone number to search for' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['created', 'active', 'expired', 'revoked', 'failed'], description: 'Filter by session status' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of records to return (default: 10)' }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default: 0)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Audit records retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            mobile: { type: 'string', example: '916265240911' },
                            sessionString: { type: 'string', example: '1BQANOTEuM==...' },
                            status: { type: 'string', example: 'active' },
                            creationMethod: { type: 'string', example: 'old_session' },
                            createdAt: { type: 'string', example: '2023-12-01T10:00:00Z' },
                            lastUsedAt: { type: 'string', example: '2023-12-01T15:30:00Z' },
                            usageCount: { type: 'number', example: 5 }
                        }
                    }
                },
                total: { type: 'number', example: 25 },
                message: { type: 'string', example: 'Audit records retrieved successfully' }
            }
        }
    }),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], SessionController.prototype, "searchAudit", null);
exports.SessionController = SessionController = __decorate([
    (0, swagger_1.ApiTags)('Telegram Session Management'),
    (0, common_1.Controller)('telegram/session'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    __metadata("design:paramtypes", [session_service_1.SessionService])
], SessionController);
//# sourceMappingURL=session.controller.js.map