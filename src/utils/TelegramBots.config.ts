import axios from 'axios';

export enum ChannelCategory {
    CLIENT_UPDATES = 'CLIENT_UPDATES',
    USER_WARNINGS = 'USER_WARNINGS',
    VC_WARNINGS = 'VC_WARNINGS',
    USER_REQUESTS = 'USER_REQUESTS',
    LOGIN_FAILURES = 'LOGIN_FAILURES',
    VC_NOTIFICATIONS = 'VC_NOTIFICATIONS',
    CHANNEL_NOTIFICATIONS = 'CHANNEL_NOTIFICATIONS',
    ACCOUNT_NOTIFICATIONS = 'ACCOUNT_NOTIFICATIONS',
    ACCOUNT_LOGIN_FAILURES = 'ACCOUNT_LOGIN_FAILURES',
    PROMOTION_ACCOUNT = 'PROMOTION_ACCOUNT',
    CLIENT_ACCOUNT = 'CLIENT_ACCOUNT',
    PAYMENT_FAIL_QUERIES = 'PAYMENT_FAIL_QUERIES',
}

type ChannelData = {
    botTokens: string[];
    botUsernames: string[];
    lastUsedIndex: number;
    channelId: string;
};

class BotConfig {
    private categoryMap = new Map<ChannelCategory, ChannelData>();
    private initPromise: Promise<void>;

    constructor() {
        this.initPromise = this.initialize();
    }

    private async initialize(): Promise<void> {
        const envKeys = Object.keys(process.env).filter(key =>
            key.startsWith('TELEGRAM_CHANNEL_CONFIG_')
        );

        for (const key of envKeys) {
            const value = process.env[key];
            if (!value) continue;

            const [channelId, description = '', botTokensStr] = value.split('::');
            const botTokens = botTokensStr?.split(',').map(t => t.trim()).filter(Boolean);
            if (!channelId || !botTokens || botTokens.length === 0) continue;

            const category = this.getCategoryFromDescription(description);
            if (!category) continue;

            const botUsernames: string[] = [];

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

    private getCategoryFromDescription(desc: string): ChannelCategory | null {
        const normalized = desc.toUpperCase();
        return (Object.values(ChannelCategory) as string[]).find(cat => normalized.includes(cat)) as ChannelCategory ?? null;
    }

    private async fetchUsername(token: string): Promise<string> {
        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
            if (res.data?.ok && res.data?.result?.username) {
                return res.data.result.username;
            }
            return '';
        } catch (err) {
            console.error(`Failed to fetch bot username for token ${token.substring(0, 8)}...`);
            return '';
        }
    }

    /**
     * Returns the next bot username for the given category, using round-robin load balancing.
     * Throws an error if the username is not available.
     */
    public getBotUsername(category: ChannelCategory): string {
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

    /**
     * Returns the channel ID for the given category.
     * Throws an error if the category is not found or not initialized.
     */
    public getChannelId(category: ChannelCategory): string {
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

    public getBotAndChannel(category: ChannelCategory) {
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
        }

    }

    public async sendMessage(category: ChannelCategory, message: string) {
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
            await axios.post(url);
        } catch (error) {
            console.error(`Failed to send message to ${channelId}:`, error);
        }
    }
}

export const botConfig = new BotConfig();
