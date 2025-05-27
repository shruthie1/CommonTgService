"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfig = exports.ChannelCategory = void 0;
const axios_1 = __importDefault(require("axios"));
var ChannelCategory;
(function (ChannelCategory) {
    ChannelCategory["CLIENT_UPDATES"] = "CLIENT_UPDATES";
    ChannelCategory["USER_WARNINGS"] = "USER_WARNINGS";
    ChannelCategory["VC_WARNINGS"] = "VC_WARNINGS";
    ChannelCategory["USER_REQUESTS"] = "USER_REQUESTS";
    ChannelCategory["VC_NOTIFICATIONS"] = "VC_NOTIFICATIONS";
    ChannelCategory["CHANNEL_NOTIFICATIONS"] = "CHANNEL_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_NOTIFICATIONS"] = "ACCOUNT_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_LOGIN_FAILURES"] = "ACCOUNT_LOGIN_FAILURES";
    ChannelCategory["PROMOTION_ACCOUNT"] = "PROMOTION_ACCOUNT";
    ChannelCategory["CLIENT_ACCOUNT"] = "CLIENT_ACCOUNT";
    ChannelCategory["PAYMENT_FAIL_QUERIES"] = "PAYMENT_FAIL_QUERIES";
    ChannelCategory["SAVED_MESSAGES"] = "SAVED_MESSAGES";
})(ChannelCategory || (exports.ChannelCategory = ChannelCategory = {}));
class BotConfig {
    constructor() {
        this.categoryMap = new Map();
        this.initialized = false;
        this.initPromise = this.initialize();
    }
    static getInstance() {
        if (!BotConfig.instance) {
            BotConfig.instance = new BotConfig();
        }
        return BotConfig.instance;
    }
    async ready() {
        if (!this.initialized) {
            await this.initPromise;
        }
    }
    async initialize() {
        console.debug('Initializing Telegram channel configuration...');
        const envKeys = Object.keys(process.env).filter(key => key.startsWith('TELEGRAM_CHANNEL_CONFIG_'));
        for (const key of envKeys) {
            const value = process.env[key];
            if (!value)
                continue;
            const [channelId, description = '', botTokensStr] = value.split('::');
            const botTokens = botTokensStr?.split(',').map(t => t.trim()).filter(Boolean);
            if (!channelId || !botTokens || botTokens.length === 0)
                continue;
            const category = this.getCategoryFromDescription(description);
            if (!category)
                continue;
            const botUsernames = [];
            for (const token of botTokens) {
                const username = await this.fetchUsername(token);
                if (!username) {
                    throw new Error(`Invalid bot token for ${category}`);
                }
                botUsernames.push(username);
            }
            this.categoryMap.set(category, {
                botTokens,
                botUsernames,
                lastUsedIndex: -1,
                channelId,
            });
        }
        this.initialized = true;
        console.info('BotConfig initialized.');
    }
    getCategoryFromDescription(desc) {
        const normalized = desc.toUpperCase();
        return Object.values(ChannelCategory).find(cat => normalized.includes(cat)) ?? null;
    }
    async fetchUsername(token) {
        try {
            const res = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`);
            return res.data?.ok ? res.data.result.username : '';
        }
        catch {
            return '';
        }
    }
    getBotUsername(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return data.botUsernames[data.lastUsedIndex];
    }
    getChannelId(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data) {
            throw new Error(`No config for ${category}`);
        }
        return data.channelId;
    }
    getBotAndChannel(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return {
            username: data.botUsernames[data.lastUsedIndex],
            channelId: data.channelId,
            token: data.botTokens[data.lastUsedIndex],
        };
    }
    async sendMessage(category, message) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const token = data.botTokens[data.lastUsedIndex];
        const channelId = data.channelId;
        const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${channelId}&text=${encodeURIComponent(message)}`;
        axios_1.default.post(url).catch(error => {
            console.error(`Failed to send message to ${channelId}:`, error);
        });
    }
    getAllBotUsernames(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        return [...data.botUsernames];
    }
    assertInitialized() {
        if (!this.initialized) {
            throw new Error('BotConfig not initialized. App module has not finished initializing.');
        }
    }
}
exports.BotConfig = BotConfig;
//# sourceMappingURL=TelegramBots.config.js.map