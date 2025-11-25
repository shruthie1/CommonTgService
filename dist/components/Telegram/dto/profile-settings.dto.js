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
exports.ProfilePhotoDto = exports.SecuritySettingsDto = exports.PrivacySettingsDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const telegram_1 = require("../../../interfaces/telegram");
class PrivacySettingsDto {
}
exports.PrivacySettingsDto = PrivacySettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Phone number visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "phoneNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last seen visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "lastSeen", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile photos visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "profilePhotos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message forwards visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "forwards", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Calls privacy', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "calls", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group chats privacy', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "groups", void 0);
class SecuritySettingsDto {
}
exports.SecuritySettingsDto = SecuritySettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Enable/disable two-factor authentication' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SecuritySettingsDto.prototype, "twoFactorAuth", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Active sessions limit', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)([1, 2, 3, 4, 5]),
    __metadata("design:type", Number)
], SecuritySettingsDto.prototype, "activeSessionsLimit", void 0);
class ProfilePhotoDto {
}
exports.ProfilePhotoDto = ProfilePhotoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name/identifier of the photo to set' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProfilePhotoDto.prototype, "name", void 0);
//# sourceMappingURL=profile-settings.dto.js.map