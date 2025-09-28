"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramValidationConfig = void 0;
const common_1 = require("@nestjs/common");
let TelegramValidationConfig = class TelegramValidationConfig {
};
exports.TelegramValidationConfig = TelegramValidationConfig;
TelegramValidationConfig.PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;
TelegramValidationConfig.USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;
TelegramValidationConfig.MESSAGE_MAX_LENGTH = 4096;
TelegramValidationConfig.CAPTION_MAX_LENGTH = 1024;
TelegramValidationConfig.FILE_SIZE_LIMIT = 2000 * 1024 * 1024;
TelegramValidationConfig.BATCH_SIZE_LIMIT = 100;
TelegramValidationConfig.ALLOWED_MEDIA_TYPES = [
    'photo',
    'video',
    'document',
    'voice',
    'audio'
];
TelegramValidationConfig.ALLOWED_PRIVACY_LEVELS = [
    'everybody',
    'contacts',
    'nobody'
];
TelegramValidationConfig.MESSAGE_TYPES = [
    'all',
    'text',
    'photo',
    'video',
    'voice',
    'document'
];
TelegramValidationConfig.DEFAULT_PAGINATION = {
    limit: 20,
    maxLimit: 100
};
exports.TelegramValidationConfig = TelegramValidationConfig = __decorate([
    (0, common_1.Injectable)()
], TelegramValidationConfig);
//# sourceMappingURL=telegram-validation.config.js.map