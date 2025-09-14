import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import { parseError } from 'src/utils';
import { Bot, BotDocument } from './schemas/bot.schema';

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

export interface PhotoOptions extends MediaOptions {}
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
    media: Buffer | string;
    caption?: string;
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    hasSpoiler?: boolean;
    extension?: string;
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;
    performer?: string;
    title?: string;
    thumbnail?: Buffer;
}

export interface MediaGroupOptions extends Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'> {}

@Injectable()
export class BotsService {
    constructor(
        @InjectModel(Bot.name) private botModel: Model<BotDocument>
    ) {}

    // Bot CRUD Methods
    async createBot(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
    }): Promise<Bot> {
        const username = await this.fetchUsername(createBotDto.token);
        if (!username) {
            throw new Error('Invalid bot token or unable to fetch bot username');
        }

        const existingBot = await this.botModel.findOne({ token: createBotDto.token });
        if (existingBot) {
            throw new Error('Bot with this token already exists');
        }

        const createdBot = new this.botModel({
            ...createBotDto,
            username,
            lastUsed: new Date(),
            stats: {
                messagesSent: 0,
                photosSent: 0,
                videosSent: 0,
                documentsSent: 0,
                audiosSent: 0,
                voicesSent: 0,
                animationsSent: 0,
                stickersSent: 0,
                mediaGroupsSent: 0
            }
        });

        return createdBot.save();
    }

    async getBots(category?: ChannelCategory): Promise<Bot[]> {
        if (category) {
            return this.botModel.find({ category }).exec();
        }
        return this.botModel.find().exec();
    }

    async getBotById(id: string): Promise<BotDocument> {
        const bot = await this.botModel.findById(id).exec();
        if (!bot) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
        return bot;
    }

    async updateBot(id: string, updateBotDto: Partial<Bot>): Promise<Bot> {
        const bot = await this.botModel
            .findByIdAndUpdate(id, updateBotDto, { new: true })
            .exec();
        if (!bot) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
        return bot;
    }

    async deleteBot(id: string): Promise<void> {
        const result = await this.botModel.findByIdAndDelete(id).exec();
        if (!result) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
    }

    // Send by Category with Round-Robin Logic
    private async sendByCategoryWithFailover<T extends any[]>(
        category: ChannelCategory,
        sender: (botId: string, ...args: T) => Promise<boolean>,
        ...args: T
    ): Promise<boolean> {
        const availableBots = await this.botModel
            .find({ category })
            .sort({ lastUsed: 'asc' })
            .exec();

        if (availableBots.length === 0) {
            console.error(`No bots found for category: ${category}`);
            return false;
        }

        for (const bot of availableBots) {
            const success = await sender.call(this, bot.id, ...args);
            if (success) {
                await this.botModel.findByIdAndUpdate(bot.id, { lastUsed: new Date() });
                return true;
            }
            console.warn(`Sending via bot ${bot.username} for category ${category} failed. Trying next available bot.`);
        }

        console.error(`Failed to send for category ${category} after trying all ${availableBots.length} available bot(s).`);
        return false;
    }

    // Send by Category Methods
    async sendMessageByCategory(category: ChannelCategory, message: string, options?: SendMessageOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendMessageByBotId, message, options);
    }

    async sendPhotoByCategory(category: ChannelCategory, photo: string | Buffer, options?: PhotoOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendPhotoByBotId, photo, options);
    }

    async sendVideoByCategory(category: ChannelCategory, video: string | Buffer, options?: VideoOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendVideoByBotId, video, options);
    }

    async sendAudioByCategory(category: ChannelCategory, audio: string | Buffer, options?: AudioOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendAudioByBotId, audio, options);
    }

    async sendDocumentByCategory(category: ChannelCategory, document: string | Buffer, options?: DocumentOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendDocumentByBotId, document, options);
    }

    async sendVoiceByCategory(category: ChannelCategory, voice: string | Buffer, options?: VoiceOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendVoiceByBotId, voice, options);
    }

    async sendAnimationByCategory(category: ChannelCategory, animation: string | Buffer, options?: AnimationOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendAnimationByBotId, animation, options);
    }

    async sendStickerByCategory(category: ChannelCategory, sticker: string | Buffer, options?: StickerOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendStickerByBotId, sticker, options);
    }

    async sendMediaGroupByCategory(category: ChannelCategory, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendMediaGroupByBotId, media, options);
    }

    // Send by Bot ID Methods
    async sendMessageByBotId(botId: string, message: string, options?: SendMessageOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMessage(bot, message, options);
        if (success) {
            await this.updateBotStats(bot.id, 'messagesSent');
        }
        return success;
    }

    async sendPhotoByBotId(botId: string, photo: string | Buffer, options?: PhotoOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendPhoto', photo, options);
        if (success) {
            await this.updateBotStats(bot.id, 'photosSent');
        }
        return success;
    }

    async sendVideoByBotId(botId: string, video: string | Buffer, options?: VideoOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVideo', video, options);
        if (success) {
            await this.updateBotStats(bot.id, 'videosSent');
        }
        return success;
    }

    async sendAudioByBotId(botId: string, audio: string | Buffer, options?: AudioOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAudio', audio, options);
        if (success) {
            await this.updateBotStats(bot.id, 'audiosSent');
        }
        return success;
    }

    async sendDocumentByBotId(botId: string, document: string | Buffer, options?: DocumentOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendDocument', document, options);
        if (success) {
            await this.updateBotStats(bot.id, 'documentsSent');
        }
        return success;
    }

    async sendVoiceByBotId(botId: string, voice: string | Buffer, options?: VoiceOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVoice', voice, options);
        if (success) {
            await this.updateBotStats(bot.id, 'voicesSent');
        }
        return success;
    }

    async sendAnimationByBotId(botId: string, animation: string | Buffer, options?: AnimationOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAnimation', animation, options);
        if (success) {
            await this.updateBotStats(bot.id, 'animationsSent');
        }
        return success;
    }

    async sendStickerByBotId(botId: string, sticker: string | Buffer, options?: StickerOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendSticker', sticker, options);
        if (success) {
            await this.updateBotStats(bot.id, 'stickersSent');
        }
        return success;
    }

    async sendMediaGroupByBotId(botId: string, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMediaGroup(bot, media, options);
        if (success) {
            await this.updateBotStats(bot.id, 'mediaGroupsSent');
        }
        return success;
    }

    // Private Execution Methods
    private async executeSendMessage(bot: BotDocument, text: string, options?: SendMessageOptions): Promise<boolean> {
        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/sendMessage`,
                {
                    chat_id: bot.channelId,
                    text: `${process.env.clientId?.toUpperCase()}:\n\n${text}`,
                    parse_mode: options?.parseMode,
                    disable_web_page_preview: options?.disableWebPagePreview,
                    disable_notification: options?.disableNotification,
                    reply_to_message_id: options?.replyToMessageId,
                    allow_sending_without_reply: options?.allowSendingWithoutReply,
                    protect_content: options?.protectContent,
                    link_preview_options: options?.linkPreviewOptions,
                },
                { timeout: 10000 }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMessage with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute sendMessage for bot ${bot.username}`);
            return false;
        }
    }

    private async executeSendMedia(bot: BotDocument, method: string, media: Buffer | string, options: any = {}): Promise<boolean> {
        const formData = new FormData();
        formData.append('chat_id', bot.channelId);

        const mediaField = method.replace('send', '').toLowerCase();
        if (Buffer.isBuffer(media)) {
            formData.append(mediaField, media, `${mediaField}.${this.getDefaultExtension(mediaField)}`);
        } else {
            formData.append(mediaField, media);
        }

        if (options.caption) {
            formData.append('caption', `${process.env.clientId?.toUpperCase()}:\n\n${options.caption}`);
        }
        if (options.parseMode) formData.append('parse_mode', options.parseMode);
        if (options.disableNotification) formData.append('disable_notification', 'true');
        if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent) formData.append('protect_content', 'true');
        if (options.hasSpoiler) formData.append('has_spoiler', 'true');

        this.addMethodSpecificOptions(method, options, formData);

        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/${method}`,
                formData,
                { timeout: 30000, headers: formData.getHeaders() }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for ${method} with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute ${method} for bot ${bot.username}`);
            return false;
        }
    }

    private async executeSendMediaGroup(bot: BotDocument, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        const formData = new FormData();
        formData.append('chat_id', bot.channelId);

        const mediaArray = media.map((item, i) => {
            const mediaObj: any = {
                type: item.type,
                media: Buffer.isBuffer(item.media) ? `attach://file${i}` : item.media,
            };
            if (item.caption) mediaObj.caption = `${process.env.clientId?.toUpperCase()}:\n\n${item.caption}`;
            if (item.parseMode) mediaObj.parse_mode = item.parseMode;
            if (item.hasSpoiler) mediaObj.has_spoiler = true;
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
            if (Buffer.isBuffer(item.media)) {
                const filename = item.extension ? `file${i}.${item.extension}` : `file${i}.${this.getDefaultExtension(item.type)}`;
                formData.append(`file${i}`, item.media, filename);
            }
            if (item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                mediaObj.thumbnail = `attach://thumb${i}`;
                formData.append(`thumb${i}`, item.thumbnail, `thumb${i}.jpg`);
            }
            return mediaObj;
        });

        formData.append('media', JSON.stringify(mediaArray));
        if (options) {
            if (options.disableNotification) formData.append('disable_notification', 'true');
            if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
            if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
            if (options.protectContent) formData.append('protect_content', 'true');
        }

        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/sendMediaGroup`,
                formData,
                { timeout: 30000, headers: formData.getHeaders() }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMediaGroup with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute sendMediaGroup for bot ${bot.username}`);
            return false;
        }
    }

    // Helper Methods
    private async fetchUsername(token: string): Promise<string> {
        if (!token || typeof token !== 'string' || token.length < 10) {
            return '';
        }

        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
                timeout: 5000
            });
            return res.data?.ok ? res.data.result.username : '';
        } catch (error) {
            parseError(error, 'Failed fetching bot username:');
            return '';
        }
    }

    private async updateBotStats(botId: string, statField: keyof Bot['stats']): Promise<void> {
        await this.botModel.findByIdAndUpdate(botId, {
            $inc: { [`stats.${statField}`]: 1 },
            lastUsed: new Date(),
        });
    }

    private getDefaultExtension(type: string): string {
        switch (type) {
            case 'photo': return 'jpg';
            case 'video': return 'mp4';
            case 'audio': return 'mp3';
            case 'document': return 'bin';
            default: return 'dat';
        }
    }

    private addMethodSpecificOptions(method: string, options: any, formData: FormData): void {
        if (method === 'sendVideo' || method === 'sendAnimation') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.width) formData.append('width', options.width.toString());
            if (options.height) formData.append('height', options.height.toString());
            if (options.supportsStreaming) formData.append('supports_streaming', 'true');
        }
        if (method === 'sendAudio') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.performer) formData.append('performer', options.performer);
            if (options.title) formData.append('title', options.title);
        }
        if (options.thumbnail) {
            if (Buffer.isBuffer(options.thumbnail)) {
                formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
            } else {
                formData.append('thumbnail', options.thumbnail);
            }
        }
        if (method === 'sendDocument' && options.disableContentTypeDetection) {
            formData.append('disable_content_type_detection', 'true');
        }
        if (method === 'sendVoice' || method === 'sendVideoNote') {
            if (options.duration) formData.append('duration', options.duration.toString());
        }
        if (method === 'sendVideoNote' && options.length) {
            formData.append('length', options.length.toString());
        }
        if (method === 'sendSticker' && options.emoji) {
            formData.append('emoji', options.emoji);
        }
    }
        async getBotStatsByCategory(category: ChannelCategory): Promise<any> {
        const stats = await this.botModel.aggregate([
            { $match: { category } },
            {
                $group: {
                    _id: '$category',
                    totalBots: { $sum: 1 },
                    totalMessagesSent: { $sum: '$stats.messagesSent' },
                    totalPhotosSent: { $sum: '$stats.photosSent' },
                    totalVideosSent: { $sum: '$stats.videosSent' },
                    totalDocumentsSent: { $sum: '$stats.documentsSent' },
                    totalAudiosSent: { $sum: '$stats.audiosSent' },
                    totalMediaGroupsSent: { $sum: '$stats.mediaGroupsSent' },
                    avgFailedAttempts: { $avg: '$failedAttempts' }
                }
            }
        ]);
        return stats[0] || { _id: category, totalBots: 0 };
    }
}