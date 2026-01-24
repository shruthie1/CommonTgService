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
exports.MediaMetadataQueryDto = exports.PaginatedMediaResponseDto = exports.MediaGroupDto = exports.MediaFiltersDto = exports.PaginationDto = exports.MediaItemDto = exports.MediaType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var MediaType;
(function (MediaType) {
    MediaType["PHOTO"] = "photo";
    MediaType["VIDEO"] = "video";
    MediaType["DOCUMENT"] = "document";
    MediaType["VOICE"] = "voice";
    MediaType["ALL"] = "all";
})(MediaType || (exports.MediaType = MediaType = {}));
class MediaItemDto {
}
exports.MediaItemDto = MediaItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID', example: 12345 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID', example: 'me' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media type', enum: MediaType, example: 'photo' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message date (Unix timestamp)', example: 1704067200 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Caption text', example: 'Beautiful sunset' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'File size in bytes', example: 1024000 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "fileSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'MIME type', example: 'image/jpeg' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "mimeType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filename', example: 'photo.jpg' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Thumbnail (base64 encoded)', example: 'data:image/jpeg;base64,...' }),
    __metadata("design:type", String)
], MediaItemDto.prototype, "thumbnail", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Width in pixels (for images/videos)', example: 1920 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Height in pixels (for images/videos)', example: 1080 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "height", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Duration in seconds (for video/voice)', example: 120 }),
    __metadata("design:type", Number)
], MediaItemDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Additional media details' }),
    __metadata("design:type", Object)
], MediaItemDto.prototype, "mediaDetails", void 0);
class PaginationDto {
}
exports.PaginationDto = PaginationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current page number (1-indexed)', example: 1 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Items per page', example: 50 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of items in current page', example: 50 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of pages (if known, -1 for unknown)', example: 5 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "totalPages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether there are more items available', example: true }),
    __metadata("design:type", Boolean)
], PaginationDto.prototype, "hasMore", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Message ID to use as maxId for next page (get messages with ID less than this)', example: 12345 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "nextMaxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Message ID to use as maxId for previous page', example: 12000 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "prevMaxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'First message ID in current page', example: 12345 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "firstMessageId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last message ID in current page', example: 12300 }),
    __metadata("design:type", Number)
], PaginationDto.prototype, "lastMessageId", void 0);
class MediaFiltersDto {
}
exports.MediaFiltersDto = MediaFiltersDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID', example: 'me' }),
    __metadata("design:type", String)
], MediaFiltersDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Media types filter', type: [String], enum: MediaType, example: ['photo', 'video'] }),
    __metadata("design:type", Array)
], MediaFiltersDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Start date filter (ISO 8601)', example: '2024-01-01' }),
    __metadata("design:type", String)
], MediaFiltersDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'End date filter (ISO 8601)', example: '2024-12-31' }),
    __metadata("design:type", String)
], MediaFiltersDto.prototype, "endDate", void 0);
class MediaGroupDto {
}
exports.MediaGroupDto = MediaGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media type', enum: MediaType, example: 'photo' }),
    __metadata("design:type", String)
], MediaGroupDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of items of this type', example: 25 }),
    __metadata("design:type", Number)
], MediaGroupDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media items of this type', type: [MediaItemDto] }),
    __metadata("design:type", Array)
], MediaGroupDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pagination information for this type', type: PaginationDto }),
    __metadata("design:type", PaginationDto)
], MediaGroupDto.prototype, "pagination", void 0);
class PaginatedMediaResponseDto {
}
exports.PaginatedMediaResponseDto = PaginatedMediaResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of media items (when single type or multiple types without grouping)', type: [MediaItemDto] }),
    __metadata("design:type", Array)
], PaginatedMediaResponseDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media grouped by type (when "all" is in types)', type: [MediaGroupDto] }),
    __metadata("design:type", Array)
], PaginatedMediaResponseDto.prototype, "groups", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pagination information (for single type or overall)', type: PaginationDto }),
    __metadata("design:type", PaginationDto)
], PaginatedMediaResponseDto.prototype, "pagination", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Applied filters', type: MediaFiltersDto }),
    __metadata("design:type", MediaFiltersDto)
], PaginatedMediaResponseDto.prototype, "filters", void 0);
class MediaMetadataQueryDto {
}
exports.MediaMetadataQueryDto = MediaMetadataQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID or username', example: 'me' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaMetadataQueryDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Media types to filter. Use "all" to get all types grouped by type', enum: MediaType, isArray: true, example: ['photo', 'video'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MediaType, { each: true }),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(v => v.trim());
        }
        return Array.isArray(value) ? value : [value];
    }),
    __metadata("design:type", Array)
], MediaMetadataQueryDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Start date (ISO 8601)', example: '2024-01-01' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaMetadataQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'End date (ISO 8601)', example: '2024-12-31' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaMetadataQueryDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum number of items (1-1000)', example: 50, minimum: 1, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], MediaMetadataQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum message ID to include (use for pagination - get messages with ID less than this)', example: 12345 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataQueryDto.prototype, "maxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Minimum message ID to include', example: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataQueryDto.prototype, "minId", void 0);
//# sourceMappingURL=media-pagination.dto.js.map