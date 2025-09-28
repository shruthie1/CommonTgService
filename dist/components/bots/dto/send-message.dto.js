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
exports.SendMessageDto = exports.SendMessageOptionsDto = exports.LinkPreviewOptionsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class LinkPreviewOptionsDto {
}
exports.LinkPreviewOptionsDto = LinkPreviewOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Disables link preview',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], LinkPreviewOptionsDto.prototype, "isDisabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'URL to use for the link preview',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], LinkPreviewOptionsDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Prefer small media',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], LinkPreviewOptionsDto.prototype, "preferSmallMedia", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Prefer large media',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], LinkPreviewOptionsDto.prototype, "preferLargeMedia", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Show preview above text',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], LinkPreviewOptionsDto.prototype, "showAboveText", void 0);
class SendMessageOptionsDto {
}
exports.SendMessageOptionsDto = SendMessageOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Parse mode for the message',
        enum: ['HTML', 'MarkdownV2', 'Markdown'],
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SendMessageOptionsDto.prototype, "parseMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Disable web page preview',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SendMessageOptionsDto.prototype, "disableWebPagePreview", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Disable notification',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SendMessageOptionsDto.prototype, "disableNotification", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Message ID to reply to',
        required: false
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SendMessageOptionsDto.prototype, "replyToMessageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Allow sending without reply',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SendMessageOptionsDto.prototype, "allowSendingWithoutReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Protect content',
        required: false
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SendMessageOptionsDto.prototype, "protectContent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Link preview options',
        required: false,
        type: () => LinkPreviewOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => LinkPreviewOptionsDto),
    __metadata("design:type", LinkPreviewOptionsDto)
], SendMessageOptionsDto.prototype, "linkPreviewOptions", void 0);
class SendMessageDto {
}
exports.SendMessageDto = SendMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Message text to send',
        example: 'Hello, this is a test message!'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Message sending options',
        required: false,
        type: () => SendMessageOptionsDto
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SendMessageOptionsDto),
    __metadata("design:type", SendMessageOptionsDto)
], SendMessageDto.prototype, "options", void 0);
//# sourceMappingURL=send-message.dto.js.map