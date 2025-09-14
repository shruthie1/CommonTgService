import { BotsService } from './bots.service';
import { Bot } from './schemas/bot.schema';
import { ChannelCategory } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SendPhotoDto, SendVideoDto, SendAudioDto, SendDocumentDto } from './dto/media.dto';
import { SendVoiceDto, SendAnimationDto, SendStickerDto } from './dto/media-extras.dto';
import { SendMediaGroupDto } from './dto/media-group.dto';
export declare class BotsController {
    private readonly botsService;
    constructor(botsService: BotsService);
    createBot(createBotDto: CreateBotDto): Promise<Bot>;
    getBots(category?: ChannelCategory): Promise<Bot[]>;
    getBotById(id: string): Promise<import("./schemas/bot.schema").BotDocument>;
    updateBot(id: string, updateBotDto: Partial<Bot>): Promise<Bot>;
    deleteBot(id: string): Promise<void>;
    sendMessageByCategory(category: ChannelCategory, botId: string, data: SendMessageDto): Promise<boolean>;
    sendPhotoByCategory(category: ChannelCategory, botId: string, data: SendPhotoDto): Promise<boolean>;
    sendVideoByCategory(category: ChannelCategory, botId: string, data: SendVideoDto): Promise<boolean>;
    sendAudioByCategory(category: ChannelCategory, botId: string, data: SendAudioDto): Promise<boolean>;
    sendDocumentByCategory(category: ChannelCategory, botId: string, data: SendDocumentDto): Promise<boolean>;
    sendVoiceByCategory(category: ChannelCategory, botId: string, data: SendVoiceDto): Promise<boolean>;
    sendAnimationByCategory(category: ChannelCategory, botId: string, data: SendAnimationDto): Promise<boolean>;
    sendStickerByCategory(category: ChannelCategory, botId: string, data: SendStickerDto): Promise<boolean>;
    sendMediaGroupByCategory(category: ChannelCategory, botId: string, data: SendMediaGroupDto): Promise<boolean>;
    getBotStats(category: ChannelCategory): Promise<any>;
}
