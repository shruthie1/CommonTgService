import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramValidationConfig {
    static readonly PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;
    static readonly USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;
    static readonly MESSAGE_MAX_LENGTH = 4096;
    static readonly CAPTION_MAX_LENGTH = 1024;
    static readonly FILE_SIZE_LIMIT = 2000 * 1024 * 1024; // 2000MB
    static readonly BATCH_SIZE_LIMIT = 100;
    
    static readonly ALLOWED_MEDIA_TYPES = [
        'photo',
        'video',
        'document',
        'voice',
        'audio'
    ];

    static readonly ALLOWED_PRIVACY_LEVELS = [
        'everybody',
        'contacts',
        'nobody'
    ];

    static readonly MESSAGE_TYPES = [
        'all',
        'text',
        'photo',
        'video',
        'voice',
        'document'
    ];

    static readonly DEFAULT_PAGINATION = {
        limit: 20,
        maxLimit: 100
    };
}