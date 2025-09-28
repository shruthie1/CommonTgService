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
exports.CreateChatFolderDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateChatFolderDto {
}
exports.CreateChatFolderDto = CreateChatFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name of the chat folder' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateChatFolderDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'List of chat IDs to include in the folder' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Array)
], CreateChatFolderDto.prototype, "includedChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'List of chat IDs to exclude from the folder', required: false }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateChatFolderDto.prototype, "excludedChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include contacts in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeContacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include non-contacts in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeNonContacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include groups in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeGroups", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include broadcast channels in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeBroadcasts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include bots in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeBots", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude muted chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeMuted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude read chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeRead", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude archived chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeArchived", void 0);
//# sourceMappingURL=create-chat-folder.dto.js.map