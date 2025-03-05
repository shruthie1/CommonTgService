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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TgSignupResponse = exports.VerifyCodeDto = exports.SendCodeDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class SendCodeDto {
}
exports.SendCodeDto = SendCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone number to send the verification code to (international format)',
        example: '+919876543210'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\+\d{8,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], SendCodeDto.prototype, "phone", void 0);
class VerifyCodeDto {
}
exports.VerifyCodeDto = VerifyCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone number used for verification (international format)',
        example: '919876543210'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\+\d{8,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Verification code received',
        example: '12345'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\d{5}$/, { message: 'Code must be exactly 5 digits' }),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Two-factor authentication password if required',
        example: 'yourSecurePassword123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === '' ? undefined : value),
    __metadata("design:type", Object)
], VerifyCodeDto.prototype, "password", void 0);
class TgSignupResponse {
}
exports.TgSignupResponse = TgSignupResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Operation status code',
        example: 200
    }),
    __metadata("design:type", Number)
], TgSignupResponse.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Response message',
        example: 'Login successful'
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone code hash for verification',
        example: 'abc123xyz',
        required: false
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "phoneCodeHash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the code was sent via app',
        example: true,
        required: false
    }),
    __metadata("design:type", Boolean)
], TgSignupResponse.prototype, "isCodeViaApp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Session string for authenticated client',
        required: false
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether 2FA is required',
        example: false,
        required: false
    }),
    __metadata("design:type", Boolean)
], TgSignupResponse.prototype, "requires2FA", void 0);
//# sourceMappingURL=tg-signup.dto.js.map