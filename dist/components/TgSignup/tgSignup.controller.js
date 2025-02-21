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
var TgSignupController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TgSignupController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const TgSignup_service_1 = require("./TgSignup.service");
const tg_signup_dto_1 = require("./dto/tg-signup.dto");
let TgSignupController = TgSignupController_1 = class TgSignupController {
    constructor(tgSignupService) {
        this.tgSignupService = tgSignupService;
        this.logger = new common_1.Logger(TgSignupController_1.name);
    }
    async sendCode(sendCodeDto) {
        try {
            this.logger.debug(`[SEND_CODE] Request received for phone: ${sendCodeDto.phone}`);
            const result = await this.tgSignupService.sendCode(sendCodeDto.phone);
            return {
                status: common_1.HttpStatus.CREATED,
                message: 'Code sent to your Telegram app',
                phoneCodeHash: result.phoneCodeHash,
                isCodeViaApp: result.isCodeViaApp
            };
        }
        catch (error) {
            this.logger.error(`[SEND_CODE] Error for phone: ${sendCodeDto.phone}`, {
                error,
                stack: error.stack
            });
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.BadRequestException(error.message || 'Unable to send verification code');
        }
    }
    async verifyCode(verifyCodeDto) {
        try {
            this.logger.debug(`[VERIFY_CODE] Request received for phone: ${verifyCodeDto.phone}`);
            const result = await this.tgSignupService.verifyCode(verifyCodeDto.phone, verifyCodeDto.code, verifyCodeDto.password);
            return {
                status: result.requires2FA ? common_1.HttpStatus.BAD_REQUEST : common_1.HttpStatus.OK,
                message: result.message || 'Successfully logged in',
                session: result.session,
                requires2FA: result.requires2FA
            };
        }
        catch (error) {
            this.logger.error(`[VERIFY_CODE] Error for phone: ${verifyCodeDto.phone}`, {
                error,
                stack: error.stack
            });
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.BadRequestException(error.message || 'Verification failed');
        }
    }
};
exports.TgSignupController = TgSignupController;
__decorate([
    (0, common_1.Post)('send-code'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send verification code to phone number',
        description: 'Initiates the signup process by sending a verification code via Telegram'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.CREATED,
        type: tg_signup_dto_1.TgSignupResponse,
        description: 'Code sent successfully'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid phone number or failed to send code',
        schema: {
            type: 'object',
            properties: {
                statusCode: { type: 'number', example: 400 },
                message: { type: 'string', example: 'Invalid phone number format' },
                error: { type: 'string', example: 'Bad Request' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tg_signup_dto_1.SendCodeDto]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify code and complete signup/login',
        description: 'Verifies the code sent to phone and completes the signup/login process'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        type: tg_signup_dto_1.TgSignupResponse,
        description: 'Verification successful'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid code or verification failed'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tg_signup_dto_1.VerifyCodeDto]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "verifyCode", null);
exports.TgSignupController = TgSignupController = TgSignupController_1 = __decorate([
    (0, common_1.Controller)('tgsignup'),
    (0, swagger_1.ApiTags)('tgsignup'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true }
    })),
    (0, swagger_1.ApiExtraModels)(tg_signup_dto_1.SendCodeDto, tg_signup_dto_1.VerifyCodeDto, tg_signup_dto_1.TgSignupResponse),
    __metadata("design:paramtypes", [TgSignup_service_1.TgSignupService])
], TgSignupController);
//# sourceMappingURL=tgSignup.controller.js.map