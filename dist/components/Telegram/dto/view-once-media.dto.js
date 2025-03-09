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
exports.ViewOnceMediaDto = exports.MediaSourceType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var MediaSourceType;
(function (MediaSourceType) {
    MediaSourceType["PATH"] = "path";
    MediaSourceType["BASE64"] = "base64";
    MediaSourceType["BINARY"] = "binary";
})(MediaSourceType || (exports.MediaSourceType = MediaSourceType = {}));
class ViewOnceMediaDto {
}
exports.ViewOnceMediaDto = ViewOnceMediaDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Chat ID to send the view once media to',
        example: '123456789'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Source type of the media: url, base64, or binary',
        enum: MediaSourceType,
        example: 'url'
    }),
    (0, class_validator_1.IsEnum)(MediaSourceType),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "sourceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'URL of the media file (when sourceType is url)',
        required: false,
        example: 'https://example.com/image.jpg'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.PATH),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "path", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Base64 encoded media data (when sourceType is base64)',
        required: false,
        example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.BASE64),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "base64Data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Binary media data (when sourceType is binary)',
        required: false,
        type: 'string',
        format: 'binary'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.BINARY),
    __metadata("design:type", Object)
], ViewOnceMediaDto.prototype, "binaryData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional caption for the media',
        required: false,
        example: 'Check this out! It will disappear after viewing'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional filename for the media',
        required: false,
        example: 'secret_image.jpg'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "filename", void 0);
//# sourceMappingURL=view-once-media.dto.js.map