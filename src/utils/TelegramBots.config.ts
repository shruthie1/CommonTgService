import axios from 'axios';
import FormData from 'form-data';

export enum ChannelCategory {
    CLIENT_UPDATES = 'CLIENT_UPDATES',
    USER_WARNINGS = 'USER_WARNINGS',
    VC_WARNINGS = 'VC_WARNINGS',
    USER_REQUESTS = 'USER_REQUESTS',
    VC_NOTIFICATIONS = 'VC_NOTIFICATIONS',
    CHANNEL_NOTIFICATIONS = 'CHANNEL_NOTIFICATIONS',
    ACCOUNT_NOTIFICATIONS = 'ACCOUNT_NOTIFICATIONS',
    ACCOUNT_LOGIN_FAILURES = 'ACCOUNT_LOGIN_FAILURES',
    PROMOTION_ACCOUNT = 'PROMOTION_ACCOUNT',
    CLIENT_ACCOUNT = 'CLIENT_ACCOUNT',
    PAYMENT_FAIL_QUERIES = 'PAYMENT_FAIL_QUERIES',
    SAVED_MESSAGES = 'SAVED_MESSAGES',
    HTTP_FAILURES = 'HTTP_FAILURES',
    UNVDS = 'UNVDS',
    PROM_LOGS1 = 'PROM_LOGS1',
    PROM_LOGS2 = 'PROM_LOGS2',
    UNAUTH_CALLS = 'UNAUTH_CALLS',
}

export interface SendMessageOptions {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    disableWebPagePreview?: boolean;
    disableNotification?: boolean;
    replyToMessageId?: number;
    allowSendingWithoutReply?: boolean;
    protectContent?: boolean;
    linkPreviewOptions?: {
        isDisabled?: boolean;
        url?: string;
        preferSmallMedia?: boolean;
        preferLargeMedia?: boolean;
        showAboveText?: boolean;
    };
}

export interface MediaOptions extends Omit<SendMessageOptions, 'disableWebPagePreview' | 'linkPreviewOptions'> {
    caption?: string;
    hasSpoiler?: boolean;
}

export interface PhotoOptions extends MediaOptions {
    // Photo-specific options can be added here
}

export interface VideoOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
    supportsStreaming?: boolean;
}

export interface AudioOptions extends MediaOptions {
    duration?: number;
    performer?: string;
    title?: string;
    thumbnail?: Buffer | string;
}

export interface DocumentOptions extends MediaOptions {
    thumbnail?: Buffer | string;
    disableContentTypeDetection?: boolean;
}

export interface VoiceOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
}

export interface VideoNoteOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
    length?: number;
    thumbnail?: Buffer | string;
}

export interface AnimationOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
}

export interface StickerOptions extends Omit<MediaOptions, 'caption'> {
    emoji?: string;
}

export interface MediaGroupItem {
    type: 'photo' | 'video' | 'audio' | 'document';
    media: Buffer | string; // Buffer for local files, string for URLs or file_id
    caption?: string;
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    hasSpoiler?: boolean;

    // Extension for proper filename
    extension?: string;

    // Video-specific properties
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;

    // Audio-specific properties
    performer?: string;
    title?: string;

    // Document-specific properties
    thumbnail?: Buffer; // Thumbnail for documents
}

export interface MediaGroupOptions extends Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'> {
    // Media group options
}

type ChannelData = {
    botTokens: string[];
    botUsernames: string[];
    lastUsedIndex: number;
    channelId: string;
};

export class BotConfig {
    private static instance: BotConfig;
    private categoryMap = new Map<ChannelCategory, ChannelData>();
    private initialized = false;
    private initializing = false;
    private initPromise: Promise<void> | null = null;
    private initRetries = 0;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 2000; // 2 seconds

    private constructor() {
        // Immediate initialization with fallback to lazy initialization
        this.initPromise = this.initialize();
    }

    /**
     * Get the singleton instance and trigger immediate initialization
     * @returns BotConfig instance
     */
    public static getInstance(): BotConfig {
        if (!BotConfig.instance) {
            BotConfig.instance = new BotConfig();
            // Note: Constructor already starts initialization
        }
        return BotConfig.instance;
    }

    /**
     * Initialize the configuration immediately and wait for completion
     * @returns Promise that resolves when initialization is complete
     */
    public static async initializeAndGetInstance(): Promise<BotConfig> {
        const instance = BotConfig.getInstance();
        await instance.ready();
        return instance;
    }

    /**
     * Ensures the configuration is ready before proceeding
     * @returns Promise that resolves when initialization is complete
     */
    public async ready(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (!this.initPromise) {
            // This is a fallback if somehow the constructor initialization failed
            this.initPromise = this.initialize();
        }

        return this.initPromise;
    }

    /**
     * Initialize the configuration by fetching bot data
     */
    private async initialize(): Promise<void> {
        if (this.initialized || this.initializing) {
            return;
        }

        try {
            this.initializing = true;
            console.debug('Initializing Telegram channel configuration...');

            const envKeys = Object.keys(process.env).filter(key =>
                key.startsWith('TELEGRAM_CHANNEL_CONFIG_')
            );

            for (const key of envKeys) {
                const value = process.env[key];
                if (!value) continue;

                try {
                    const [channelId, description = '', botTokensStr] = value.split('::');
                    const botTokens = botTokensStr?.split(',').map(t => t.trim()).filter(Boolean);

                    if (!channelId || !botTokens || botTokens.length === 0) {
                        console.warn(`Invalid configuration for ${key}: missing channelId or botTokens`);
                        continue;
                    }

                    const category = this.getCategoryFromDescription(description);
                    if (!category) {
                        console.warn(`Invalid category in description for ${key}: ${description}`);
                        continue;
                    }

                    const botUsernames: string[] = [];
                    for (const token of botTokens) {
                        try {
                            const username = await this.fetchUsername(token);
                            if (!username) {
                                console.warn(`Invalid bot token in ${category}`);
                                continue;
                            }
                            botUsernames.push(username);
                        } catch (error) {
                            console.error(`Error fetching username for token in ${category}:`, error);
                        }
                    }

                    if (botUsernames.length === 0) {
                        console.warn(`No valid bot usernames found for ${category}`);
                        continue;
                    }

                    this.categoryMap.set(category, {
                        botTokens,
                        botUsernames,
                        lastUsedIndex: -1,
                        channelId,
                    });
                } catch (error) {
                    console.error(`Error processing configuration for ${key}:`, error);
                }
            }

            // Initialize bots after configuration is loaded
            await this.initializeBots();

            this.initialized = true;
            console.info(`BotConfig initialized successfully with ${this.categoryMap.size} categories.`);
        } catch (error) {
            console.error('Failed to initialize BotConfig:', error);

            if (this.initRetries < this.MAX_RETRIES) {
                this.initRetries++;
                console.info(`Retrying initialization (attempt ${this.initRetries}/${this.MAX_RETRIES})...`);

                // Reset state for retry
                this.initializing = false;
                this.initPromise = null;

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.initialize();
            } else {
                console.error(`Failed to initialize after ${this.MAX_RETRIES} attempts`);
                throw error;
            }
        } finally {
            this.initializing = false;
        }
    }

    /**
     * Extract category from description string
     */
    private getCategoryFromDescription(desc: string): ChannelCategory | null {
        if (!desc) return null;

        const normalized = desc.trim().toUpperCase();
        return (Object.values(ChannelCategory) as string[]).find(cat =>
            normalized.includes(cat) || cat.includes(normalized)
        ) as ChannelCategory ?? null;
    }

    /**
     * Fetch bot username from token
     */
    private async fetchUsername(token: string): Promise<string> {
        if (!token || typeof token !== 'string' || token.length < 10) {
            return '';
        }

        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
                timeout: 5000 // 5 second timeout
            });
            return res.data?.ok ? res.data.result.username : '';
        } catch (error) {
            console.error('Error fetching bot username:', error);
            return '';
        }
    }

    /**
     * Get bot username for specified category
     */
    public async getBotUsername(category: ChannelCategory): Promise<string> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }

        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return data.botUsernames[data.lastUsedIndex];
    }

    /**
     * Get channel ID for specified category
     */
    public async getChannelId(category: ChannelCategory): Promise<string> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data) {
            throw new Error(`No configuration found for ${category}`);
        }

        return data.channelId;
    }

    /**
     * Get bot username, channel ID and token for specified category
     */
    public async getBotAndChannel(category: ChannelCategory): Promise<{
        username: string;
        channelId: string;
        token: string
    }> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }

        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return {
            username: data.botUsernames[data.lastUsedIndex],
            channelId: data.channelId,
            token: data.botTokens[data.lastUsedIndex],
        };
    }

    /**
     * Send message to a channel using the configured bot
     */
    public async sendMessage(
        category: ChannelCategory,
        message: string,
        options: SendMessageOptions = {}
    ): Promise<boolean> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }

        // Get the next bot in rotation
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;

        // Prepare request parameters
        const params = new URLSearchParams({
            chat_id: channelId,
            text: `${process.env.clientId?.toUpperCase()}:\n\n${message}`,
        });

        if (options.parseMode) params.append('parse_mode', options.parseMode);
        if (options.disableWebPagePreview) params.append('disable_web_page_preview', 'true');
        if (options.disableNotification) params.append('disable_notification', 'true');
        if (options.replyToMessageId) params.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply) params.append('allow_sending_without_reply', 'true');
        if (options.protectContent) params.append('protect_content', 'true');

        // Handle link preview options
        if (options.linkPreviewOptions) {
            const { isDisabled, url, preferSmallMedia, preferLargeMedia, showAboveText } = options.linkPreviewOptions;
            if (isDisabled) params.append('disable_web_page_preview', 'true');
            if (url) params.append('link_preview_url', url);
            if (preferSmallMedia) params.append('prefer_small_media', 'true');
            if (preferLargeMedia) params.append('prefer_large_media', 'true');
            if (showAboveText) params.append('show_above_text', 'true');
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        // Try to send the message
        try {
            const response = await axios.post(url, params, {
                timeout: 10000 // 10 second timeout
            });
            return response.data?.ok === true;
        } catch (error) {
            console.error(`Failed to send message to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex; // Will be incremented in the recursive call
                return this.sendMessage(category, message, options);
            }
            return false;
        }
    }

    /**
     * Send photo to a channel
     */
    public async sendPhoto(
        category: ChannelCategory,
        photo: Buffer | string,
        options: PhotoOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendPhoto', photo, options);
    }

    /**
     * Send video to a channel
     */
    public async sendVideo(
        category: ChannelCategory,
        video: Buffer | string,
        options: VideoOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendVideo', video, options);
    }

    /**
     * Send audio to a channel
     */
    public async sendAudio(
        category: ChannelCategory,
        audio: Buffer | string,
        options: AudioOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendAudio', audio, options);
    }

    /**
     * Send document to a channel
     */
    public async sendDocument(
        category: ChannelCategory,
        document: Buffer | string,
        options: DocumentOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendDocument', document, options);
    }

    /**
     * Send voice message to a channel
     */
    public async sendVoice(
        category: ChannelCategory,
        voice: Buffer | string,
        options: VoiceOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendVoice', voice, options);
    }

    /**
     * Send video note to a channel
     */
    public async sendVideoNote(
        category: ChannelCategory,
        videoNote: Buffer | string,
        options: VideoNoteOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendVideoNote', videoNote, options);
    }

    /**
     * Send animation (GIF) to a channel
     */
    public async sendAnimation(
        category: ChannelCategory,
        animation: Buffer | string,
        options: AnimationOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendAnimation', animation, options);
    }

    /**
     * Send sticker to a channel
     */
    public async sendSticker(
        category: ChannelCategory,
        sticker: Buffer | string,
        options: StickerOptions = {}
    ): Promise<boolean> {
        return this.sendMedia(category, 'sendSticker', sticker, options);
    }

    /**
     * Send media group (album) to a channel
     */
    public async sendMediaGroup(
        category: ChannelCategory,
        media: MediaGroupItem[],
        options: MediaGroupOptions = {}
    ): Promise<boolean> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }

        // Get the next bot in rotation
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;

        const formData = new FormData();
        formData.append('chat_id', channelId);

        // Prepare media array
        const mediaArray = [];
        for (let i = 0; i < media.length; i++) {
            const item = media[i];
            const mediaObj: any = {
                type: item.type,
                media: Buffer.isBuffer(item.media) ? `attach://file${i}` : item.media,
            };

            mediaObj.caption = `${process.env.clientId.toUpperCase()}:\n\n${item.caption || ''}`;
            if (item.parseMode) mediaObj.parse_mode = item.parseMode;
            if (item.hasSpoiler) mediaObj.has_spoiler = true;

            // Add type-specific properties
            if (item.type === 'video') {
                if (item.duration) mediaObj.duration = item.duration;
                if (item.width) mediaObj.width = item.width;
                if (item.height) mediaObj.height = item.height;
                if (item.supportsStreaming) mediaObj.supports_streaming = true;
            }

            if (item.type === 'audio') {
                if (item.duration) mediaObj.duration = item.duration;
                if (item.performer) mediaObj.performer = item.performer;
                if (item.title) mediaObj.title = item.title;
            }

            if (item.type === 'document') {
                // For documents, we can add thumbnail if available
                if (item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                    mediaObj.thumbnail = `attach://thumb${i}`;
                }
            }

            mediaArray.push(mediaObj);

            // Add file to form data if it's a Buffer
            if (Buffer.isBuffer(item.media)) {
                // Generate proper filename with extension
                let filename = `file${i}`;

                if (item.extension) {
                    // Use the extension from the item
                    filename = `file${i}.${item.extension}`;
                } else {
                    // Fallback based on media type
                    switch (item.type) {
                        case 'photo':
                            filename = `file${i}.jpg`;
                            break;
                        case 'video':
                            filename = `file${i}.mp4`;
                            break;
                        case 'audio':
                            filename = `file${i}.mp3`;
                            break;
                        case 'document':
                            filename = `file${i}.bin`; // Generic binary file
                            break;
                    }
                }

                formData.append(`file${i}`, item.media, filename);
            }

            // Add thumbnail if present for documents
            if (item.type === 'document' && item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                formData.append(`thumb${i}`, item.thumbnail, `thumb${i}.jpg`);
            }
        }

        formData.append('media', JSON.stringify(mediaArray));

        // Add common options
        if (options.disableNotification) formData.append('disable_notification', 'true');
        if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent) formData.append('protect_content', 'true');

        const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;

        try {
            const response = await axios.post(url, formData, {
                timeout: 30000, // 30 second timeout for media uploads
                headers: {
                    ...formData.getHeaders(),
                },
            });
            return response.data?.ok === true;
        } catch (error) {
            console.error(`Failed to send media group to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex;
                return this.sendMediaGroup(category, media, options);
            }
            return false;
        }
    }

    /**
     * Generic method to send media
     */
    private async sendMedia(
        category: ChannelCategory,
        method: string,
        media: Buffer | string,
        options: any = {}
    ): Promise<boolean> {
        await this.ensureInitialized();

        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }

        // Get the next bot in rotation
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;

        const formData = new FormData();
        formData.append('chat_id', channelId);

        // Determine media field name based on method
        const mediaField = method.replace('send', '').toLowerCase();

        if (Buffer.isBuffer(media)) {
            formData.append(mediaField, media, `${mediaField}.dat`);
        } else {
            formData.append(mediaField, media);
        }

        // Add common options
        if (options.caption) formData.append('caption', `${process.env.clientId.toUpperCase()}:\n\n${options.caption}`);
        if (options.parseMode) formData.append('parse_mode', options.parseMode);
        if (options.disableNotification) formData.append('disable_notification', 'true');
        if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent) formData.append('protect_content', 'true');
        if (options.hasSpoiler) formData.append('has_spoiler', 'true');

        // Add method-specific options
        if (method === 'sendVideo') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.width) formData.append('width', options.width.toString());
            if (options.height) formData.append('height', options.height.toString());
            if (options.supportsStreaming) formData.append('supports_streaming', 'true');
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                } else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }

        if (method === 'sendAudio') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.performer) formData.append('performer', options.performer);
            if (options.title) formData.append('title', options.title);
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                } else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }

        if (method === 'sendDocument') {
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                } else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
            if (options.disableContentTypeDetection) formData.append('disable_content_type_detection', 'true');
        }

        if (method === 'sendVoice') {
            if (options.duration) formData.append('duration', options.duration.toString());
        }

        if (method === 'sendVideoNote') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.length) formData.append('length', options.length.toString());
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                } else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }

        if (method === 'sendAnimation') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.width) formData.append('width', options.width.toString());
            if (options.height) formData.append('height', options.height.toString());
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                } else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }

        if (method === 'sendSticker') {
            if (options.emoji) formData.append('emoji', options.emoji);
        }

        const url = `https://api.telegram.org/bot${token}/${method}`;

        try {
            const response = await axios.post(url, formData, {
                timeout: 30000, // 30 second timeout for media uploads
                headers: {
                    ...formData.getHeaders(),
                },
            });
            return response.data?.ok === true;
        } catch (error) {
            console.error(`Failed to send ${method} to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex;
                return this.sendMedia(category, method, media, options);
            }
            return false;
        }
    }

    /**
     * Initialize bots with /start command
     */
    private async initializeBots(): Promise<void> {
        console.debug('Initializing bots with /start command...');

        const initPromises: Promise<void>[] = [];

        for (const [category, data] of this.categoryMap) {
            for (const token of data.botTokens) {
                const promise = (async () => {
                    try {
                        const botInfo = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
                            timeout: 5000
                        });

                        if (!botInfo.data?.ok) {
                            console.error(`Failed to get bot info for ${category}`);
                            return;
                        }
                        console.debug(`Successfully initialized bot for ${category}`);
                    } catch (error) {
                        console.error(`Failed to initialize bot for ${category}:`, error);
                    }
                })();

                initPromises.push(promise);
            }
        }

        // Wait for all initialization attempts to complete
        await Promise.allSettled(initPromises);
    }

    /**
     * Ensure the class is initialized before performing operations
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.ready();

            if (!this.initialized) {
                throw new Error('BotConfig initialization failed. Unable to proceed.');
            }
        }
    }

    /**
     * Check if a category is configured
     */
    public async hasCategory(category: ChannelCategory): Promise<boolean> {
        await this.ensureInitialized();
        return this.categoryMap.has(category);
    }

    /**
     * Get all configured categories
     */
    public async getConfiguredCategories(): Promise<ChannelCategory[]> {
        await this.ensureInitialized();
        return Array.from(this.categoryMap.keys());
    }
}