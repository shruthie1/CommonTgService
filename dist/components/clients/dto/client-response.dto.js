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
exports.EnhancedClientSearchResponseDto = exports.PromoteMobileSearchResponseDto = exports.PromoteMobileMatchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const client_schema_1 = require("../schemas/client.schema");
class PromoteMobileMatchDto {
}
exports.PromoteMobileMatchDto = PromoteMobileMatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client-a' }),
    __metadata("design:type", String)
], PromoteMobileMatchDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911' }),
    __metadata("design:type", String)
], PromoteMobileMatchDto.prototype, "mobile", void 0);
class PromoteMobileSearchResponseDto {
}
exports.PromoteMobileSearchResponseDto = PromoteMobileSearchResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [client_schema_1.Client] }),
    __metadata("design:type", Array)
], PromoteMobileSearchResponseDto.prototype, "clients", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [PromoteMobileMatchDto] }),
    __metadata("design:type", Array)
], PromoteMobileSearchResponseDto.prototype, "matches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911' }),
    __metadata("design:type", String)
], PromoteMobileSearchResponseDto.prototype, "searchedMobile", void 0);
class EnhancedClientSearchResponseDto {
}
exports.EnhancedClientSearchResponseDto = EnhancedClientSearchResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [client_schema_1.Client] }),
    __metadata("design:type", Array)
], EnhancedClientSearchResponseDto.prototype, "clients", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['direct', 'promoteMobile', 'mixed'], example: 'promoteMobile' }),
    __metadata("design:type", String)
], EnhancedClientSearchResponseDto.prototype, "searchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [PromoteMobileMatchDto] }),
    __metadata("design:type", Array)
], EnhancedClientSearchResponseDto.prototype, "promoteMobileMatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 4 }),
    __metadata("design:type", Number)
], EnhancedClientSearchResponseDto.prototype, "totalResults", void 0);
//# sourceMappingURL=client-response.dto.js.map