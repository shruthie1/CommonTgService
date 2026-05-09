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
exports.CreatePromoteClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const base_client_service_1 = require("../../shared/base-client.service");
const mobile_utils_1 = require("../../shared/mobile-utils");
class CreatePromoteClientDto {
}
exports.CreatePromoteClientDto = CreatePromoteClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Telegram ID of the client'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mobile number of the client'
    }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? (0, mobile_utils_1.normalizeMobileInput)(value) : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(mobile_utils_1.CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' }),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Date when the client becomes available for assignment.'
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'lastActive identifier'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Channel Count',
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreatePromoteClientDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Owning client ID for this promote mobile.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Operational status of the promote client.',
        default: 'active',
        enum: ['active', 'inactive']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(base_client_service_1.ClientStatus),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional operator note attached to the promote client.',
        default: 'Account is functioning properly'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Timestamp when the client was last used in a live workflow.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], CreatePromoteClientDto.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Session string for Telegram connection.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "session", void 0);
//# sourceMappingURL=create-promote-client.dto.js.map