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
exports.SendStickerDto = exports.StickerOptionsDto = exports.SendAnimationDto = exports.AnimationOptionsDto = exports.SendVoiceDto = exports.VoiceOptionsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const media_dto_1 = require("./media.dto");
class VoiceOptionsDto extends media_dto_1.MediaOptionsDto {
}
exports.VoiceOptionsDto = VoiceOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Duration of the voice message in seconds',
        required: false,
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], VoiceOptionsDto.prototype, "duration", void 0);
class SendVoiceDto {
}
exports.SendVoiceDto = SendVoiceDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Voice message URL or file ID',
        example: 'https://example.com/voice.ogg',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendVoiceDto.prototype, "voice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Voice sending options',
        required: false,
        type: () => VoiceOptionsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => VoiceOptionsDto),
    __metadata("design:type", VoiceOptionsDto)
], SendVoiceDto.prototype, "options", void 0);
class AnimationOptionsDto extends media_dto_1.MediaOptionsDto {
}
exports.AnimationOptionsDto = AnimationOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Duration of the animation in seconds', required: false }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AnimationOptionsDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Animation width', required: false }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AnimationOptionsDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Animation height', required: false }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], AnimationOptionsDto.prototype, "height", void 0);
class SendAnimationDto {
}
exports.SendAnimationDto = SendAnimationDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Animation (GIF/MP4) URL or file ID',
        example: 'https://example.com/animation.gif',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendAnimationDto.prototype, "animation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Animation sending options',
        required: false,
        type: () => AnimationOptionsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AnimationOptionsDto),
    __metadata("design:type", AnimationOptionsDto)
], SendAnimationDto.prototype, "options", void 0);
class StickerOptionsDto extends media_dto_1.MediaOptionsDto {
}
exports.StickerOptionsDto = StickerOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Emoji associated with the sticker',
        required: false,
        example: '😊',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], StickerOptionsDto.prototype, "emoji", void 0);
class SendStickerDto {
}
exports.SendStickerDto = SendStickerDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sticker URL or file ID',
        example: 'https://example.com/sticker.webp',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendStickerDto.prototype, "sticker", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Sticker sending options',
        required: false,
        type: () => StickerOptionsDto,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => StickerOptionsDto),
    __metadata("design:type", StickerOptionsDto)
], SendStickerDto.prototype, "options", void 0);
//# sourceMappingURL=media-extras.dto.js.map