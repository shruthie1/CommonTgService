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
exports.ChatCleanupDto = exports.AdminOperationDto = exports.GroupMemberOperationDto = exports.GroupSettingsDto = exports.AdminPermissionsDto = exports.AdminPermission = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var AdminPermission;
(function (AdminPermission) {
    AdminPermission["CHANGE_INFO"] = "changeInfo";
    AdminPermission["POST_MESSAGES"] = "postMessages";
    AdminPermission["EDIT_MESSAGES"] = "editMessages";
    AdminPermission["DELETE_MESSAGES"] = "deleteMessages";
    AdminPermission["BAN_USERS"] = "banUsers";
    AdminPermission["INVITE_USERS"] = "inviteUsers";
    AdminPermission["PIN_MESSAGES"] = "pinMessages";
    AdminPermission["ADD_ADMINS"] = "addAdmins";
    AdminPermission["ANONYMOUS"] = "anonymous";
    AdminPermission["MANAGE_CALL"] = "manageCall";
})(AdminPermission || (exports.AdminPermission = AdminPermission = {}));
class AdminPermissionsDto {
    constructor() {
        this.changeInfo = true;
        this.postMessages = true;
        this.editMessages = true;
        this.deleteMessages = true;
        this.banUsers = true;
        this.inviteUsers = true;
        this.pinMessages = true;
        this.addAdmins = false;
        this.anonymous = false;
        this.manageCall = true;
    }
}
exports.AdminPermissionsDto = AdminPermissionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to change group info', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "changeInfo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to post messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "postMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to edit messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "editMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to delete messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "deleteMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to ban users', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "banUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to invite users', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "inviteUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to pin messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "pinMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to add new admins', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "addAdmins", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to remain anonymous', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "anonymous", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to manage voice chats', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsEnum)(AdminPermission),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "manageCall", void 0);
class GroupSettingsDto {
    constructor() {
        this.megagroup = true;
        this.forImport = false;
    }
}
exports.GroupSettingsDto = GroupSettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group ID for updates', required: true }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group title', required: true }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group description', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Address or location of the group', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Slow mode delay in seconds', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], GroupSettingsDto.prototype, "slowMode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether the group is a megagroup', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GroupSettingsDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether the group is for import', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GroupSettingsDto.prototype, "forImport", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Member restrictions', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], GroupSettingsDto.prototype, "memberRestrictions", void 0);
class GroupMemberOperationDto {
}
exports.GroupMemberOperationDto = GroupMemberOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group ID' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], GroupMemberOperationDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of user IDs', type: [String] }),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GroupMemberOperationDto.prototype, "members", void 0);
class AdminOperationDto {
}
exports.AdminOperationDto = AdminOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group ID' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AdminOperationDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User ID to promote/demote' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AdminOperationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to promote or demote', required: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminOperationDto.prototype, "isPromote", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Admin permissions', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdminPermissionsDto),
    __metadata("design:type", AdminPermissionsDto)
], AdminOperationDto.prototype, "permissions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Custom admin rank/title', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminOperationDto.prototype, "rank", void 0);
class ChatCleanupDto {
}
exports.ChatCleanupDto = ChatCleanupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to clean up' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ChatCleanupDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Delete messages before this date', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value) : undefined),
    __metadata("design:type", Date)
], ChatCleanupDto.prototype, "beforeDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Only delete media messages', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCleanupDto.prototype, "onlyMedia", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude pinned messages', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCleanupDto.prototype, "excludePinned", void 0);
//# sourceMappingURL=group-operations.dto.js.map