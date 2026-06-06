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
exports.CollectionAnalyticsQueryDto = exports.CollectionQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CollectionQueryDto {
}
exports.CollectionQueryDto = CollectionQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mongo filter object. Query-string callers may pass JSON.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionQueryDto.prototype, "filter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mongo projection object. Query-string callers may pass JSON.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionQueryDto.prototype, "projection", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mongo sort object. Query-string callers may pass JSON.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionQueryDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Single field to sort by when sort is not provided.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectionQueryDto.prototype, "sortBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Sort direction for sortBy.', enum: ['asc', 'desc'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['asc', 'desc']),
    __metadata("design:type", String)
], CollectionQueryDto.prototype, "sortOrder", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum documents to return. Capped server-side.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Documents to skip.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionQueryDto.prototype, "skip", void 0);
class CollectionAnalyticsQueryDto {
}
exports.CollectionAnalyticsQueryDto = CollectionAnalyticsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Sample size for field analytics. Capped server-side.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CollectionAnalyticsQueryDto.prototype, "sampleSize", void 0);
//# sourceMappingURL=collection-query.dto.js.map