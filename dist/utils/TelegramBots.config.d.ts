export declare enum ChannelCategory {
    CLIENT_UPDATES = "CLIENT_UPDATES",
    USER_WARNINGS = "USER_WARNINGS",
    VC_WARNINGS = "VC_WARNINGS",
    USER_REQUESTS = "USER_REQUESTS",
    VC_NOTIFICATIONS = "VC_NOTIFICATIONS",
    CHANNEL_NOTIFICATIONS = "CHANNEL_NOTIFICATIONS",
    ACCOUNT_NOTIFICATIONS = "ACCOUNT_NOTIFICATIONS",
    ACCOUNT_LOGIN_FAILURES = "ACCOUNT_LOGIN_FAILURES",
    PROMOTION_ACCOUNT = "PROMOTION_ACCOUNT",
    CLIENT_ACCOUNT = "CLIENT_ACCOUNT",
    PAYMENT_FAIL_QUERIES = "PAYMENT_FAIL_QUERIES",
    SAVED_MESSAGES = "SAVED_MESSAGES"
}
export declare class BotConfig {
    private static instance;
    private categoryMap;
    private initialized;
    private initPromise;
    private constructor();
    static getInstance(): BotConfig;
    ready(): Promise<void>;
    private initialize;
    private getCategoryFromDescription;
    private fetchUsername;
    getBotUsername(category: ChannelCategory): string;
    getChannelId(category: ChannelCategory): string;
    getBotAndChannel(category: ChannelCategory): {
        username: string;
        channelId: string;
        token: string;
    };
    sendMessage(category: ChannelCategory, message: string): Promise<void>;
    getAllBotUsernames(category: ChannelCategory): string[];
    private assertInitialized;
}
