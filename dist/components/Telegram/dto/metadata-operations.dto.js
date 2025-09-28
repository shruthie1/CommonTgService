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
exports.BulkMessageOperationDto = exports.DialogsQueryDto = exports.MediaMetadataDto = exports.MetadataType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var MetadataType;
(function (MetadataType) {
    MetadataType["PHOTO"] = "photo";
    MetadataType["VIDEO"] = "video";
    MetadataType["DOCUMENT"] = "document";
})(MetadataType || (exports.MetadataType = MetadataType = {}));
class MediaMetadataDto {
    constructor() {
        this.limit = 50;
    }
}
exports.MediaMetadataDto = MediaMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to get metadata from' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaMetadataDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message offset', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Maximum number of items', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataDto.prototype, "limit", void 0);
class DialogsQueryDto {
    constructor() {
        this.limit = 100;
        this.offsetId = 0;
        this.archived = false;
    }
}
exports.DialogsQueryDto = DialogsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Number of dialogs to fetch', required: false, type: Number, minimum: 1, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], DialogsQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Dialog offset', required: false, type: Number, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], DialogsQueryDto.prototype, "offsetId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Include archived chats', required: false, type: Boolean }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        return value;
    }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DialogsQueryDto.prototype, "archived", void 0);
class BulkMessageOperationDto {
}
exports.BulkMessageOperationDto = BulkMessageOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID', type: String, minLength: 1, maxLength: 255 }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkMessageOperationDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID', type: String, minLength: 1, maxLength: 255 }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkMessageOperationDto.prototype, "toChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message IDs to operate on', type: [Number], minItems: 1, maxItems: 100 }),
    (0, class_transformer_1.Transform)(({ value }) => Array.isArray(value) ? value.map(Number) : value),
    __metadata("design:type", Array)
], BulkMessageOperationDto.prototype, "messageIds", void 0);
//# sourceMappingURL=metadata-operations.dto.js.map