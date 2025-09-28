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
exports.SendMediaGroupDto = exports.MediaGroupItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const media_dto_1 = require("./media.dto");
class MediaGroupItemDto {
}
exports.MediaGroupItemDto = MediaGroupItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Type of media',
        enum: ['photo', 'video', 'audio', 'document'],
        example: 'photo'
    }),
    (0, class_validator_1.IsEnum)(['photo', 'video', 'audio', 'document']),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Media URL or file ID',
        example: 'https://example.com/media.jpg'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "media", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Caption for the media',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Parse mode for caption',
        enum: ['HTML', 'Markdown', 'MarkdownV2'],
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "parseMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Apply spoiler animation to media',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaGroupItemDto.prototype, "hasSpoiler", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'File extension when sending as buffer',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "extension", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Duration for video/audio in seconds',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], MediaGroupItemDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Width for video',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], MediaGroupItemDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Height for video',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], MediaGroupItemDto.prototype, "height", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether video supports streaming',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaGroupItemDto.prototype, "supportsStreaming", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Performer name for audio',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "performer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Title for audio',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaGroupItemDto.prototype, "title", void 0);
class SendMediaGroupDto {
}
exports.SendMediaGroupDto = SendMediaGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Array of media items to send',
        type: [MediaGroupItemDto]
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => MediaGroupItemDto),
    __metadata("design:type", Array)
], SendMediaGroupDto.prototype, "media", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Media group sending options',
        required: false,
        type: () => media_dto_1.MediaOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => media_dto_1.MediaOptionsDto),
    __metadata("design:type", media_dto_1.MediaOptionsDto)
], SendMediaGroupDto.prototype, "options", void 0);
//# sourceMappingURL=media-group.dto.js.map