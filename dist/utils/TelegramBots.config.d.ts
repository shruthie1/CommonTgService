export declare enum ChannelCategory {
    CLIENT_UPDATES = "CLIENT_UPDATES",
    USER_WARNINGS = "USER_WARNINGS",
    VC_WARNINGS = "VC_WARNINGS",
    USER_REQUESTS = "USER_REQUESTS",
    LOGIN_FAILURES = "LOGIN_FAILURES",
    VC_NOTIFICATIONS = "VC_NOTIFICATIONS",
    CHANNEL_NOTIFICATIONS = "CHANNEL_NOTIFICATIONS",
    ACCOUNT_NOTIFICATIONS = "ACCOUNT_NOTIFICATIONS",
    ACCOUNT_LOGINS = "ACCOUNT_LOGINS",
    PROMOTION_ACCOUNT = "PROMOTION_ACCOUNT",
    CLIENT_ACCOUNT = "CLIENT_ACCOUNT",
    PAYMENT_FAIL_QUERIES = "PAYMENT_FAIL_QUERIES"
}
declare class BotConfig {
    private categoryMap;
    private initPromise;
    constructor();
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
}
export declare const botConfig: BotConfig;
export {};
