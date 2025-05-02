"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.botConfig = exports.ChannelCategory = void 0;
const axios_1 = __importDefault(require("axios"));
var ChannelCategory;
(function (ChannelCategory) {
    ChannelCategory["CLIENT_UPDATES"] = "CLIENT_UPDATES";
    ChannelCategory["USER_WARNINGS"] = "USER_WARNINGS";
    ChannelCategory["VC_WARNINGS"] = "VC_WARNINGS";
    ChannelCategory["USER_REQUESTS"] = "USER_REQUESTS";
    ChannelCategory["LOGIN_FAILURES"] = "LOGIN_FAILURES";
    ChannelCategory["VC_NOTIFICATIONS"] = "VC_NOTIFICATIONS";
    ChannelCategory["CHANNEL_NOTIFICATIONS"] = "CHANNEL_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_NOTIFICATIONS"] = "ACCOUNT_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_LOGIN_FAILURES"] = "ACCOUNT_LOGIN_FAILURES";
    ChannelCategory["PROMOTION_ACCOUNT"] = "PROMOTION_ACCOUNT";
    ChannelCategory["CLIENT_ACCOUNT"] = "CLIENT_ACCOUNT";
    ChannelCategory["PAYMENT_FAIL_QUERIES"] = "PAYMENT_FAIL_QUERIES";
})(ChannelCategory || (exports.ChannelCategory = ChannelCategory = {}));
class BotConfig {
    constructor() {
        this.categoryMap = new Map();
        this.initPromise = this.initialize();
    }
    async initialize() {
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
                    throw new Error(`Missing or invalid bot username for token ${token.substring(0, 8)} in category ${category}`);
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
    }
    getCategoryFromDescription(desc) {
        const normalized = desc.toUpperCase();
        return Object.values(ChannelCategory).find(cat => normalized.includes(cat)) ?? null;
    }
    async fetchUsername(token) {
        try {
            const res = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`);
            if (res.data?.ok && res.data?.result?.username) {
                return res.data.result.username;
            }
            return '';
        }
        catch (err) {
            console.error(`Failed to fetch bot username for token ${token.substring(0, 8)}...`);
            return '';
        }
    }
    getBotUsername(category) {
        if (!this.categoryMap.has(category)) {
            throw new Error(`Category ${category} not found in bot configuration`);
        }
        if (!this.initPromise) {
            throw new Error('Bot configuration not initialized yet');
        }
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for category ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        const username = data.botUsernames[data.lastUsedIndex];
        if (!username) {
            throw new Error(`Bot username not found during load balancing for category ${category}`);
        }
        return username;
    }
    getChannelId(category) {
        if (!this.categoryMap.has(category)) {
            throw new Error(`Category ${category} not found in bot configuration`);
        }
        if (!this.initPromise) {
            throw new Error('Bot configuration not initialized yet');
        }
        const data = this.categoryMap.get(category);
        if (!data) {
            throw new Error(`No configuration found for category ${category}`);
        }
        return data.channelId;
    }
    getBotAndChannel(category) {
        if (!this.categoryMap.has(category)) {
            throw new Error(`Category ${category} not found in bot configuration`);
        }
        if (!this.initPromise) {
            throw new Error('Bot configuration not initialized yet');
        }
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for category ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return {
            username: data.botUsernames[data.lastUsedIndex],
            channelId: data.channelId,
            token: data.botTokens[data.lastUsedIndex],
        };
    }
    async sendMessage(category, message) {
        if (!this.categoryMap.has(category)) {
            throw new Error(`Category ${category} not found in bot configuration`);
        }
        if (!this.initPromise) {
            throw new Error('Bot configuration not initialized yet');
        }
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for category ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        const token = data.botTokens[data.lastUsedIndex];
        const channelId = data.channelId;
        const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${channelId}&text=${encodeURIComponent(message)}`;
        try {
            await axios_1.default.post(url);
        }
        catch (error) {
            console.error(`Failed to send message to ${channelId}:`, error);
        }
    }
}
exports.botConfig = new BotConfig();
//# sourceMappingURL=TelegramBots.config.js.map