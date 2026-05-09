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
exports.SearchPromoteClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const base_client_service_1 = require("../../shared/base-client.service");
const mobile_utils_1 = require("../../shared/mobile-utils");
class SearchPromoteClientDto {
}
exports.SearchPromoteClientDto = SearchPromoteClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Telegram account identifier.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Mobile number of the promote client.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? (0, mobile_utils_1.normalizeMobileInput)(value) : value),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(mobile_utils_1.CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' }),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Owning client ID to filter by.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Operational status filter.',
        enum: ['active', 'inactive']
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(base_client_service_1.ClientStatus),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Availability date filter.'
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Exact channel count filter.',
        type: Number
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === undefined ? value : Number(value)),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchPromoteClientDto.prototype, "channels", void 0);
//# sourceMappingURL=search-promote-client.dto.js.map