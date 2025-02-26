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
exports.ChatNotificationSettingsDto = exports.NotificationSettingsDto = exports.NotificationSound = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var NotificationSound;
(function (NotificationSound) {
    NotificationSound["DEFAULT"] = "default";
    NotificationSound["NONE"] = "none";
    NotificationSound["CUSTOM"] = "custom";
})(NotificationSound || (exports.NotificationSound = NotificationSound = {}));
class NotificationSettingsDto {
}
exports.NotificationSettingsDto = NotificationSettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Show message previews in notifications', default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], NotificationSettingsDto.prototype, "showPreviews", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Silent notifications', default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], NotificationSettingsDto.prototype, "silent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Notification sound', enum: NotificationSound, default: NotificationSound.DEFAULT }),
    (0, class_validator_1.IsEnum)(NotificationSound),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], NotificationSettingsDto.prototype, "sound", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mute until specific timestamp', required: false }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], NotificationSettingsDto.prototype, "muteUntil", void 0);
class ChatNotificationSettingsDto {
}
exports.ChatNotificationSettingsDto = ChatNotificationSettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to update settings for' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ChatNotificationSettingsDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: NotificationSettingsDto }),
    __metadata("design:type", NotificationSettingsDto)
], ChatNotificationSettingsDto.prototype, "settings", void 0);
//# sourceMappingURL=notification-settings.dto.js.map