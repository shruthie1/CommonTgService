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
exports.TgSignupController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const TgSignup_service_1 = require("./TgSignup.service");
let TgSignupController = class TgSignupController {
    constructor() { }
    async sendCode(phone) {
        console.log(phone);
        const result = await (0, TgSignup_service_1.createClient)(phone);
        if (result?.isCodeViaApp) {
            console.log('OTP SENT!! - ', phone);
            return result;
        }
        else {
            throw new common_1.BadRequestException("Failed to send OTP");
        }
    }
    async verifyCode(phone, code, password) {
        const cli = await (0, TgSignup_service_1.getClient)(phone);
        if (cli) {
            console.log(cli?.phoneCodeHash, cli?.phoneNumber);
            const result = await cli?.login(code, password);
            if (result && result.status === 200) {
                return ({ mesaage: result.message });
            }
            else {
                throw new common_1.HttpException(result.message, result.status);
            }
        }
        else {
            throw new common_1.BadRequestException("Failed to Verify OTP");
        }
    }
};
exports.TgSignupController = TgSignupController;
__decorate([
    (0, common_1.Get)('login'),
    (0, swagger_1.ApiQuery)({ name: 'phone', required: true }),
    __param(0, (0, common_1.Query)('phone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Get)('otp'),
    (0, swagger_1.ApiQuery)({ name: 'phone', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'code', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'password' }),
    __param(0, (0, common_1.Query)('phone')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('password')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "verifyCode", null);
exports.TgSignupController = TgSignupController = __decorate([
    (0, common_1.Controller)('tgsignup'),
    (0, swagger_1.ApiTags)('tgsignup'),
    __metadata("design:paramtypes", [])
], TgSignupController);
//# sourceMappingURL=tgSignup.controller.js.map