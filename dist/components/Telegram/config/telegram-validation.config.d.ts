export declare class TelegramValidationConfig {
    static readonly PHONE_PATTERN: RegExp;
    static readonly USERNAME_PATTERN: RegExp;
    static readonly MESSAGE_MAX_LENGTH = 4096;
    static readonly CAPTION_MAX_LENGTH = 1024;
    static readonly FILE_SIZE_LIMIT: number;
    static readonly BATCH_SIZE_LIMIT = 100;
    static readonly ALLOWED_MEDIA_TYPES: string[];
    static readonly ALLOWED_PRIVACY_LEVELS: string[];
    static readonly MESSAGE_TYPES: string[];
    static readonly DEFAULT_PAGINATION: {
        limit: number;
        maxLimit: number;
    };
}
