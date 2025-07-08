interface TelegramMessageOptions {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
    protect_content?: boolean;
    reply_to_message_id?: number;
    allow_sending_without_reply?: boolean;
    reply_markup?: any;
}
export declare enum ChannelType {
    USER_WARNINGS = "userWarnings",
    LOGIN_FAILURES = "loginFailures",
    CHANNEL_NOTIFICATIONS = "channelNotifications",
    SAVED_MESSAGES = "savedMessages",
    CLIENT_UPDATES = "clientUpdates",
    PROMOTION_FAILURES = "promotionFailures",
    PROMOTIONS_INFO = "promotionsInfo",
    GENERAL_ERRORS = "generalErrors",
    HTTP_FAILURES = "httpFailures"
}
export declare class ChannelLogger {
    private static instance;
    private channels;
    private readonly channelTypes;
    private constructor();
    static getInstance(): ChannelLogger;
    private initializeChannels;
    private sendMessage;
    sendUserWarning(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendHttpFailures(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendLoginFailure(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendChannelNotification(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendSavedMessage(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendClientUpdate(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendPromotionFailure(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendPromotionsInfo(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    sendGeneralError(message: string, options?: TelegramMessageOptions): Promise<boolean>;
    send(channelType: ChannelType, message: string, options?: TelegramMessageOptions): Promise<boolean>;
    isChannelConfigured(channelType: ChannelType): boolean;
    getConfiguredChannels(): ChannelType[];
}
export declare const clog: ChannelLogger;
export {};
