"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clog = exports.ChannelLogger = exports.ChannelType = void 0;
const axios_1 = __importDefault(require("axios"));
var ChannelType;
(function (ChannelType) {
    ChannelType["USER_WARNINGS"] = "userWarnings";
    ChannelType["LOGIN_FAILURES"] = "loginFailures";
    ChannelType["CHANNEL_NOTIFICATIONS"] = "channelNotifications";
    ChannelType["SAVED_MESSAGES"] = "savedMessages";
    ChannelType["CLIENT_UPDATES"] = "clientUpdates";
    ChannelType["PROMOTION_FAILURES"] = "promotionFailures";
    ChannelType["PROMOTIONS_INFO"] = "promotionsInfo";
    ChannelType["GENERAL_ERRORS"] = "generalErrors";
    ChannelType["HTTP_FAILURES"] = "httpFailures";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
class ChannelLogger {
    constructor() {
        this.channels = {};
        this.channelTypes = {
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
        this.initializeChannels();
    }
    static getInstance() {
        if (!ChannelLogger.instance) {
            ChannelLogger.instance = new ChannelLogger();
        }
        return ChannelLogger.instance;
    }
    initializeChannels() {
        Object.entries(this.channelTypes).forEach(([channelKey, envVar]) => {
            const config = process.env[envVar];
            if (config) {
                const parts = config.split('::');
                if (parts.length >= 3) {
                    const [channelId, name, ...tokenParts] = parts;
                    const tokensStr = tokenParts.join('::');
                    const tokens = tokensStr.split(',').map(token => token.trim()).filter(token => token);
                    if (channelId && tokens.length > 0) {
                        this.channels[channelKey] = {
                            channelId,
                            tokens,
                            currentTokenIndex: 0
                        };
                        console.log(`Configured ${channelKey} channel: ${channelId} with ${tokens.length} token(s)`);
                    }
                    else {
                        console.warn(`Invalid config for ${channelKey}: missing channelId or tokens`);
                    }
                }
                else {
                    console.warn(`Invalid config format for ${channelKey}: expected format 'channelId::name::token1,token2'`);
                }
            }
            else {
                console.log(`No configuration found for ${channelKey} (${envVar})`);
            }
        });
        console.log(`ChannelLogger initialized with ${Object.keys(this.channels).length} channels`);
    }
    async sendMessage(channelType, message, options = {}, retries = 1) {
        const channel = this.channels[channelType];
        if (!channel) {
            console.error(`Channel ${channelType} not configured`);
            return false;
        }
        const defaultOptions = {};
        const telegramOptions = { ...defaultOptions, ...options };
        for (let attempt = 0; attempt <= retries; attempt++) {
            const token = channel.tokens[channel.currentTokenIndex];
            channel.currentTokenIndex = (channel.currentTokenIndex + 1) % channel.tokens.length;
            try {
                const url = `https://api.telegram.org/bot${token}/sendMessage`;
                const payload = {
                    chat_id: channel.channelId,
                    text: message,
                    ...telegramOptions
                };
                const response = await axios_1.default.post(url, payload, {
                    timeout: 5000,
                    validateStatus: (status) => status === 200
                });
                return true;
            }
            catch (error) {
                const errorMsg = error.response?.data?.description || error.message;
                console.error(`Attempt ${attempt + 1} failed for ${channelType}: ${errorMsg}`);
                if (attempt === retries) {
                    return false;
                }
            }
        }
        return false;
    }
    async sendUserWarning(message, options) {
        return this.sendMessage(ChannelType.USER_WARNINGS, message, options);
    }
    async sendHttpFailures(message, options) {
        return this.sendMessage(ChannelType.HTTP_FAILURES, message, options);
    }
    async sendLoginFailure(message, options) {
        return this.sendMessage(ChannelType.LOGIN_FAILURES, message, options);
    }
    async sendChannelNotification(message, options) {
        return this.sendMessage(ChannelType.CHANNEL_NOTIFICATIONS, message, options);
    }
    async sendSavedMessage(message, options) {
        return this.sendMessage(ChannelType.SAVED_MESSAGES, message, options);
    }
    async sendClientUpdate(message, options) {
        return this.sendMessage(ChannelType.CLIENT_UPDATES, message, options);
    }
    async sendPromotionFailure(message, options) {
        return this.sendMessage(ChannelType.PROMOTION_FAILURES, message, options);
    }
    async sendPromotionsInfo(message, options) {
        return this.sendMessage(ChannelType.PROMOTIONS_INFO, message, options);
    }
    async sendGeneralError(message, options) {
        return this.sendMessage(ChannelType.GENERAL_ERRORS, message, options);
    }
    async send(channelType, message, options) {
        return this.sendMessage(channelType, message, options);
    }
    isChannelConfigured(channelType) {
        return !!this.channels[channelType];
    }
    getConfiguredChannels() {
        return Object.keys(this.channels);
    }
}
exports.ChannelLogger = ChannelLogger;
exports.clog = ChannelLogger.getInstance();
//# sourceMappingURL=ChannelLogger.js.map