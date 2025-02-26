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
exports.MediaDownloadDto = exports.VoiceMessageDto = exports.SendMediaAlbumDto = exports.MediaAlbumItemDto = exports.SendMediaDto = exports.MediaFilterDto = exports.MediaSearchDto = exports.BaseMediaOperationDto = exports.MediaType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var MediaType;
(function (MediaType) {
    MediaType["PHOTO"] = "photo";
    MediaType["VIDEO"] = "video";
    MediaType["DOCUMENT"] = "document";
    MediaType["VOICE"] = "voice";
    MediaType["AUDIO"] = "audio";
})(MediaType || (exports.MediaType = MediaType = {}));
class BaseMediaOperationDto {
}
exports.BaseMediaOperationDto = BaseMediaOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID for media operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BaseMediaOperationDto.prototype, "chatId", void 0);
class MediaSearchDto extends BaseMediaOperationDto {
    constructor() {
        super(...arguments);
        this.limit = 50;
    }
}
exports.MediaSearchDto = MediaSearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media types to include', enum: MediaType, isArray: true }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MediaType, { each: true }),
    __metadata("design:type", Array)
], MediaSearchDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message offset', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], MediaSearchDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Items per page', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], MediaSearchDto.prototype, "limit", void 0);
class MediaFilterDto extends MediaSearchDto {
}
exports.MediaFilterDto = MediaFilterDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Start date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value).toISOString() : undefined),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'End date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value).toISOString() : undefined),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "endDate", void 0);
class SendMediaDto extends BaseMediaOperationDto {
}
exports.SendMediaDto = SendMediaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the media file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the media', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Filename for the media' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Type of media', enum: MediaType }),
    (0, class_validator_1.IsEnum)(MediaType),
    __metadata("design:type", String)
], SendMediaDto.prototype, "type", void 0);
class MediaAlbumItemDto {
}
exports.MediaAlbumItemDto = MediaAlbumItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the media file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Type of media', enum: MediaType }),
    (0, class_validator_1.IsEnum)(MediaType),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the media item', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "caption", void 0);
class SendMediaAlbumDto extends BaseMediaOperationDto {
}
exports.SendMediaAlbumDto = SendMediaAlbumDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of media items', type: [MediaAlbumItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => MediaAlbumItemDto),
    __metadata("design:type", Array)
], SendMediaAlbumDto.prototype, "media", void 0);
class VoiceMessageDto extends BaseMediaOperationDto {
}
exports.VoiceMessageDto = VoiceMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the voice message file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], VoiceMessageDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Duration of voice message in seconds', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], VoiceMessageDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the voice message', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VoiceMessageDto.prototype, "caption", void 0);
class MediaDownloadDto extends BaseMediaOperationDto {
}
exports.MediaDownloadDto = MediaDownloadDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID of the message containing the media' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaDownloadDto.prototype, "messageId", void 0);
//# sourceMappingURL=media-operations.dto.js.map