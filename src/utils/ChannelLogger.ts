import axios from 'axios';

interface ChannelConfig {
    channelId: string;
    tokens: string[];
    currentTokenIndex: number;
}

interface TelegramMessageOptions {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
    protect_content?: boolean;
    reply_to_message_id?: number;
    allow_sending_without_reply?: boolean;
    reply_markup?: any; // InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, or ForceReply
}

export enum ChannelType {
    USER_WARNINGS = 'userWarnings',
    LOGIN_FAILURES = 'loginFailures',
    CHANNEL_NOTIFICATIONS = 'channelNotifications',
    SAVED_MESSAGES = 'savedMessages',
    CLIENT_UPDATES = 'clientUpdates',
    PROMOTION_FAILURES = 'promotionFailures',
    PROMOTIONS_INFO = 'promotionsInfo',
    GENERAL_ERRORS = 'generalErrors',
    HTTP_FAILURES = 'httpFailures'
}

export class ChannelLogger {
    private static instance: ChannelLogger;
    private channels: Record<ChannelType, ChannelConfig> = {} as Record<ChannelType, ChannelConfig>;

    // Channel type definitions for better intellisense
    private readonly channelTypes: Record<ChannelType, string> = {
        [ChannelType.USER_WARNINGS]: 'TELEGRAM_CHANNEL_CONFIG_USER_WARNINGS',
        [ChannelType.LOGIN_FAILURES]: 'TELEGRAM_CHANNEL_CONFIG_LOGIN_FAILURES',
        [ChannelType.CHANNEL_NOTIFICATIONS]: 'TELEGRAM_CHANNEL_CONFIG_CHANNEL_NOTIFICATIONS',
        [ChannelType.SAVED_MESSAGES]: 'TELEGRAM_CHANNEL_CONFIG_SAVED',
        [ChannelType.CLIENT_UPDATES]: 'TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES',
        [ChannelType.PROMOTION_FAILURES]: 'TELEGRAM_CHANNEL_CONFIG_PROMOTION_FAILURES',
        [ChannelType.PROMOTIONS_INFO]: 'TELEGRAM_CHANNEL_CONFIG_PROMOTIONS_INFO',
        [ChannelType.GENERAL_ERRORS]: 'TELEGRAM_CHANNEL_CONFIG_GENERAL_ERRORS',
        [ChannelType.HTTP_FAILURES]: 'TELEGRAM_CHANNEL_CONFIG_HTTP_FAILURES'
    };

    private constructor() {
        this.initializeChannels();
    }

    public static getInstance(): ChannelLogger {
        if (!ChannelLogger.instance) {
            ChannelLogger.instance = new ChannelLogger();
        }
        return ChannelLogger.instance;
    }

    private initializeChannels(): void {
        Object.entries(this.channelTypes).forEach(([channelKey, envVar]) => {
            const config = process.env[envVar];
            if (config) {
                const parts = config.split('::');
                if (parts.length >= 3) {
                    const [channelId, name, ...tokenParts] = parts;
                    // Join remaining parts back together in case token contains '::'
                    const tokensStr = tokenParts.join('::');
                    const tokens = tokensStr.split(',').map(token => token.trim()).filter(token => token);

                    if (channelId && tokens.length > 0) {
                        this.channels[channelKey as ChannelType] = {
                            channelId,
                            tokens,
                            currentTokenIndex: 0
                        };
                        console.log(`Configured ${channelKey} channel: ${channelId} with ${tokens.length} token(s)`);
                    } else {
                        console.warn(`Invalid config for ${channelKey}: missing channelId or tokens`);
                    }
                } else {
                    console.warn(`Invalid config format for ${channelKey}: expected format 'channelId::name::token1,token2'`);
                }
            } else {
                console.log(`No configuration found for ${channelKey} (${envVar})`);
            }
        });

        console.log(`ChannelLogger initialized with ${Object.keys(this.channels).length} channels`);
    }

    private async sendMessage(
        channelType: ChannelType,
        message: string,
        options: TelegramMessageOptions = {},
        retries = 1
    ): Promise<boolean> {
        const channel = this.channels[channelType];
        if (!channel) {
            console.error(`Channel ${channelType} not configured`);
            return false;
        }

        // Default options - only include what's explicitly provided
        const defaultOptions: TelegramMessageOptions = {};

        // Merge with provided options (user options take precedence)
        const telegramOptions = { ...defaultOptions, ...options };

        for (let attempt = 0; attempt <= retries; attempt++) {
            // Use round-robin to select next token
            const token = channel.tokens[channel.currentTokenIndex];
            channel.currentTokenIndex = (channel.currentTokenIndex + 1) % channel.tokens.length;

            try {
                const url = `https://api.telegram.org/bot${token}/sendMessage`;
                const payload = {
                    chat_id: channel.channelId,
                    text: message,
                    ...telegramOptions
                };

                const response = await axios.post(url, payload, {
                    timeout: 5000,
                    validateStatus: (status) => status === 200
                });

                return true;
            } catch (error: any) {
                const errorMsg = error.response?.data?.description || error.message;
                console.error(`Attempt ${attempt + 1} failed for ${channelType}: ${errorMsg}`);
                if (attempt === retries) {
                    return false;
                }
            }
        }
        return false;
    }

    // Public methods with enhanced options support
    async sendUserWarning(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.USER_WARNINGS, message, options);
    }

    async sendHttpFailures(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.HTTP_FAILURES, message, options);
    }

    async sendLoginFailure(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.LOGIN_FAILURES, message, options);
    }

    async sendChannelNotification(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.CHANNEL_NOTIFICATIONS, message, options);
    }

    async sendSavedMessage(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.SAVED_MESSAGES, message, options);
    }

    async sendClientUpdate(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.CLIENT_UPDATES, message, options);
    }

    async sendPromotionFailure(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.PROMOTION_FAILURES, message, options);
    }

    async sendPromotionsInfo(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.PROMOTIONS_INFO, message, options);
    }

    async sendGeneralError(message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(ChannelType.GENERAL_ERRORS, message, options);
    }

    // Enhanced generic method for sending to any channel using enum
    async send(channelType: ChannelType, message: string, options?: TelegramMessageOptions): Promise<boolean> {
        return this.sendMessage(channelType, message, options);
    }

    // Utility method to check if a channel is configured
    isChannelConfigured(channelType: ChannelType): boolean {
        return !!this.channels[channelType];
    }

    // Get list of configured channels
    getConfiguredChannels(): ChannelType[] {
        return Object.keys(this.channels) as ChannelType[];
    }
}

export const clog = ChannelLogger.getInstance();