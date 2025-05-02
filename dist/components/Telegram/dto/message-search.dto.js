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
exports.SearchMessagesResponseDto = exports.MessageTypeResult = exports.SearchMessagesDto = exports.SearchScope = exports.MessageMediaType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
var MessageMediaType;
(function (MessageMediaType) {
    MessageMediaType["ALL"] = "all";
    MessageMediaType["TEXT"] = "text";
    MessageMediaType["PHOTO"] = "photo";
    MessageMediaType["VIDEO"] = "video";
    MessageMediaType["VOICE"] = "voice";
    MessageMediaType["DOCUMENT"] = "document";
    MessageMediaType["ROUND_VIDEO"] = "roundVideo";
})(MessageMediaType || (exports.MessageMediaType = MessageMediaType = {}));
var SearchScope;
(function (SearchScope) {
    SearchScope["CHAT"] = "chat";
    SearchScope["GLOBAL"] = "global";
})(SearchScope || (exports.SearchScope = SearchScope = {}));
class SearchMessagesDto {
    constructor() {
        this.types = [MessageMediaType.ALL];
    }
}
exports.SearchMessagesDto = SearchMessagesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Chat ID to search in (required for chat-specific search)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SearchMessagesDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Search query string',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SearchMessagesDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Types of messages to search for',
        enum: MessageMediaType,
        isArray: true,
        required: false,
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MessageMediaType, { each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], SearchMessagesDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum message ID for filtering',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "minId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum message ID for filtering',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "maxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum number of messages to retrieve',
        minimum: 1,
        maximum: 500,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Offset ID for pagination',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "offsetId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Offset date as Unix timestamp',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "offsetDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Start date for filtering messages by date range',
    }),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Date)
], SearchMessagesDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'End date for filtering messages by date range',
    }),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Date)
], SearchMessagesDto.prototype, "endDate", void 0);
class MessageTypeResult {
}
exports.MessageTypeResult = MessageTypeResult;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Array of message IDs matching the search criteria',
        type: [Number],
        example: [1001, 1005, 1010]
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    __metadata("design:type", Array)
], MessageTypeResult.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Total count of messages matching the search criteria',
        example: 3
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], MessageTypeResult.prototype, "total", void 0);
class SearchMessagesResponseDto {
}
exports.SearchMessagesResponseDto = SearchMessagesResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'All message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "all", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Text message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Photo message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "photo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Video message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "video", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Voice message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "voice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Document message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "document", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Round video message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "roundVideo", void 0);
//# sourceMappingURL=message-search.dto.js.map