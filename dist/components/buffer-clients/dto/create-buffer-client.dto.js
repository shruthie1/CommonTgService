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
exports.CreateBufferClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const base_client_service_1 = require("../../shared/base-client.service");
const mobile_utils_1 = require("../../shared/mobile-utils");
class CreateBufferClientDto {
}
exports.CreateBufferClientDto = CreateBufferClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Telegram ID of the client'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mobile number of the client'
    }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? (0, mobile_utils_1.normalizeMobileInput)(value) : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(mobile_utils_1.CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' }),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Date when the client becomes available for assignment.'
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Session identifier'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Current joined channel count.',
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateBufferClientDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Client ID that this buffer client belongs to'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Operational status of the buffer client.',
        enum: ['active', 'inactive'],
        default: 'active'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(base_client_service_1.ClientStatus),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional operator note attached to the buffer client.',
        default: 'Account is functioning properly'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Timestamp when the client was last used in a live workflow.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], CreateBufferClientDto.prototype, "lastUsed", void 0);
//# sourceMappingURL=create-buffer-client.dto.js.map