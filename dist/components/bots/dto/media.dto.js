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
exports.SendDocumentDto = exports.SendAudioDto = exports.SendVideoDto = exports.SendPhotoDto = exports.DocumentOptionsDto = exports.AudioOptionsDto = exports.VideoOptionsDto = exports.MediaOptionsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class MediaOptionsDto {
}
exports.MediaOptionsDto = MediaOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Parse mode for the caption',
        enum: ['HTML', 'MarkdownV2', 'Markdown'],
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaOptionsDto.prototype, "parseMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Caption text',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MediaOptionsDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Disable notification',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaOptionsDto.prototype, "disableNotification", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Message ID to reply to',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], MediaOptionsDto.prototype, "replyToMessageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Allow sending without reply',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaOptionsDto.prototype, "allowSendingWithoutReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Protect content',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaOptionsDto.prototype, "protectContent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Apply spoiler animation',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], MediaOptionsDto.prototype, "hasSpoiler", void 0);
class VideoOptionsDto extends MediaOptionsDto {
}
exports.VideoOptionsDto = VideoOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Duration of the video in seconds',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], VideoOptionsDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Video width',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], VideoOptionsDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Video height',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], VideoOptionsDto.prototype, "height", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Pass True if the uploaded video is suitable for streaming',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], VideoOptionsDto.prototype, "supportsStreaming", void 0);
class AudioOptionsDto extends MediaOptionsDto {
}
exports.AudioOptionsDto = AudioOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Duration of the audio in seconds',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AudioOptionsDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Performer name',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AudioOptionsDto.prototype, "performer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Track title',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AudioOptionsDto.prototype, "title", void 0);
class DocumentOptionsDto extends MediaOptionsDto {
}
exports.DocumentOptionsDto = DocumentOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Disables automatic content type detection',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], DocumentOptionsDto.prototype, "disableContentTypeDetection", void 0);
class SendPhotoDto {
}
exports.SendPhotoDto = SendPhotoDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Photo URL or file ID',
        example: 'https://example.com/photo.jpg'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendPhotoDto.prototype, "photo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Photo sending options',
        required: false,
        type: () => MediaOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MediaOptionsDto),
    __metadata("design:type", MediaOptionsDto)
], SendPhotoDto.prototype, "options", void 0);
class SendVideoDto {
}
exports.SendVideoDto = SendVideoDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Video URL or file ID',
        example: 'https://example.com/video.mp4'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendVideoDto.prototype, "video", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Video sending options',
        required: false,
        type: () => VideoOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => VideoOptionsDto),
    __metadata("design:type", VideoOptionsDto)
], SendVideoDto.prototype, "options", void 0);
class SendAudioDto {
}
exports.SendAudioDto = SendAudioDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Audio URL or file ID',
        example: 'https://example.com/audio.mp3'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendAudioDto.prototype, "audio", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Audio sending options',
        required: false,
        type: () => AudioOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AudioOptionsDto),
    __metadata("design:type", AudioOptionsDto)
], SendAudioDto.prototype, "options", void 0);
class SendDocumentDto {
}
exports.SendDocumentDto = SendDocumentDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Document URL or file ID',
        example: 'https://example.com/document.pdf'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendDocumentDto.prototype, "document", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Document sending options',
        required: false,
        type: () => DocumentOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DocumentOptionsDto),
    __metadata("design:type", DocumentOptionsDto)
], SendDocumentDto.prototype, "options", void 0);
//# sourceMappingURL=media.dto.js.map