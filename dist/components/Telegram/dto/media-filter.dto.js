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
exports.MediaFilterDto = exports.MediaType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var MediaType;
(function (MediaType) {
    MediaType["PHOTO"] = "photo";
    MediaType["VIDEO"] = "video";
    MediaType["DOCUMENT"] = "document";
    MediaType["VOICE"] = "voice";
})(MediaType || (exports.MediaType = MediaType = {}));
class MediaFilterDto {
    constructor() {
        this.limit = 50;
    }
}
exports.MediaFilterDto = MediaFilterDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to filter media from' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Types of media to include', enum: MediaType, isArray: true, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MediaType, { each: true }),
    __metadata("design:type", Array)
], MediaFilterDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Start date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'End date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message offset for pagination', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaFilterDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of messages to fetch', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaFilterDto.prototype, "limit", void 0);
//# sourceMappingURL=media-filter.dto.js.map