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
exports.MessageSearchDto = exports.MessageType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var MessageType;
(function (MessageType) {
    MessageType["ALL"] = "all";
    MessageType["TEXT"] = "text";
    MessageType["PHOTO"] = "photo";
    MessageType["VIDEO"] = "video";
    MessageType["VOICE"] = "voice";
    MessageType["DOCUMENT"] = "document";
})(MessageType || (exports.MessageType = MessageType = {}));
class MessageSearchDto {
    constructor() {
        this.limit = 20;
    }
}
exports.MessageSearchDto = MessageSearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to search in' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MessageSearchDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Text to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MessageSearchDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Types of messages to include', enum: MessageType, isArray: true, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MessageType, { each: true }),
    __metadata("design:type", Array)
], MessageSearchDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Offset for pagination', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MessageSearchDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Limit for pagination', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MessageSearchDto.prototype, "limit", void 0);
//# sourceMappingURL=message-search.dto.js.map