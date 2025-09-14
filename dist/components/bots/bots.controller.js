"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const bots_service_1 = require("./bots.service");
const bots_service_2 = require("./bots.service");
const create_bot_dto_1 = require("./dto/create-bot.dto");
const send_message_dto_1 = require("./dto/send-message.dto");
const media_dto_1 = require("./dto/media.dto");
const media_extras_dto_1 = require("./dto/media-extras.dto");
const media_group_dto_1 = require("./dto/media-group.dto");
let BotsController = class BotsController {
    constructor(botsService) {
        this.botsService = botsService;
    }
    async createBot(createBotDto) {
        return this.botsService.createBot(createBotDto);
    }
    async getBots(category) {
        return this.botsService.getBots(category);
    }
    async getBotById(id) {
        return this.botsService.getBotById(id);
    }
    async updateBot(id, updateBotDto) {
        return this.botsService.updateBot(id, updateBotDto);
    }
    async deleteBot(id) {
        return this.botsService.deleteBot(id);
    }
    async sendMessageByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
            return this.botsService.sendMessageByBotId(botId, data.message, data.options);
        }
        return this.botsService.sendMessageByCategory(category, data.message, data.options);
    }
    async sendPhotoByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendPhotoByCategory(category, data.photo, data.options);
    }
    async sendVideoByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendVideoByCategory(category, data.video, data.options);
    }
    async sendAudioByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendAudioByCategory(category, data.audio, data.options);
    }
    async sendDocumentByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendDocumentByCategory(category, data.document, data.options);
    }
    async sendVoiceByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendVoiceByCategory(category, data.voice, data.options);
    }
    async sendAnimationByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendAnimationByCategory(category, data.animation, data.options);
    }
    async sendStickerByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendStickerByCategory(category, data.sticker, data.options);
    }
    async sendMediaGroupByCategory(category, botId, data) {
        if (botId) {
            const bot = await this.botsService.getBotById(botId);
            if (bot.category !== category) {
                throw new Error(`Bot ${botId} does not belong to category ${category}`);
            }
        }
        return this.botsService.sendMediaGroupByCategory(category, data.media, data.options);
    }
    async getBotStats(category) {
        return this.botsService.getBotStatsByCategory(category);
    }
};
exports.BotsController = BotsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a new bot',
        description: 'Creates a new Telegram bot with the provided configuration. The bot will be registered in the system and can be used for message distribution.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Bot has been successfully created' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid bot configuration provided' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Bot with the same token already exists' }),
    (0, swagger_1.ApiBody)({ type: create_bot_dto_1.CreateBotDto, description: 'Bot creation parameters including token and category' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_bot_dto_1.CreateBotDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "createBot", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Get all bots or filter by category',
        description: 'Retrieves a list of all registered bots. Can be filtered by category if provided.',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'category',
        required: false,
        description: 'Optional category filter to return only bots of a specific category',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'List of bots retrieved successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid category provided' }),
    __param(0, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "getBots", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a bot by ID',
        description: 'Retrieves detailed information about a specific bot using its unique identifier.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bot details retrieved successfully' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot not found' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "getBotById", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update a bot',
        description: 'Updates the configuration of an existing bot. Only provided fields will be modified.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bot updated successfully' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot not found' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid update parameters' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "updateBot", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Delete a bot',
        description: 'Removes a bot from the system. This action cannot be undone.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bot successfully deleted' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot not found' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "deleteBot", null);
__decorate([
    (0, common_1.Post)('category/:category/message'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a message using bots in a category',
        description: 'Sends a text message using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the message',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: send_message_dto_1.SendMessageDto,
        description: 'Message content and optional formatting parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Message sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid message parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, send_message_dto_1.SendMessageDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendMessageByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/photo'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a photo using bots in a category',
        description: 'Sends a photo using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the photo',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_dto_1.SendPhotoDto,
        description: 'Photo content and optional caption parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Photo sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid photo parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_dto_1.SendPhotoDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendPhotoByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/video'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a video using bots in a category',
        description: 'Sends a video using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the video',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_dto_1.SendVideoDto,
        description: 'Video content and optional caption parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Video sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid video parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_dto_1.SendVideoDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendVideoByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/audio'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send audio using bots in a category',
        description: 'Sends an audio file using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the audio',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_dto_1.SendAudioDto,
        description: 'Audio content and optional metadata parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Audio sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid audio parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_dto_1.SendAudioDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendAudioByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/document'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a document using bots in a category',
        description: 'Sends a document file using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the document',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_dto_1.SendDocumentDto,
        description: 'Document content and optional caption parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Document sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid document parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_dto_1.SendDocumentDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendDocumentByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/voice'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a voice message using bots in a category',
        description: 'Sends a voice message using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the voice message',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_extras_dto_1.SendVoiceDto,
        description: 'Voice message content and optional parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Voice message sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid voice message parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_extras_dto_1.SendVoiceDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendVoiceByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/animation'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send an animation using bots in a category',
        description: 'Sends an animation (GIF or short video) using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the animation',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_extras_dto_1.SendAnimationDto,
        description: 'Animation content and optional caption parameters'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Animation sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid animation parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_extras_dto_1.SendAnimationDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendAnimationByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/sticker'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a sticker using bots in a category',
        description: 'Sends a sticker using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the sticker',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_extras_dto_1.SendStickerDto,
        description: 'Sticker file or sticker ID to send'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Sticker sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid sticker parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_extras_dto_1.SendStickerDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendStickerByCategory", null);
__decorate([
    (0, common_1.Post)('category/:category/media-group'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send a media group using bots in a category',
        description: 'Sends a group of media (photos and videos) as an album using either all bots in a category or a specific bot if botId is provided.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to use for sending the media group',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiQuery)({
        name: 'botId',
        required: false,
        description: 'Optional specific bot ID to use instead of all bots in the category'
    }),
    (0, swagger_1.ApiBody)({
        type: media_group_dto_1.SendMediaGroupDto,
        description: 'Array of media items (photos/videos) to send as a group'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Media group sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid media group parameters or bot category' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Bot or category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Query)('botId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, media_group_dto_1.SendMediaGroupDto]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "sendMediaGroupByCategory", null);
__decorate([
    (0, common_1.Get)('category/:category/stats'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get bot statistics by category',
        description: 'Retrieves aggregated statistics for all bots in a specific category, including message counts and performance metrics.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'category',
        description: 'Category of bots to get statistics for',
        enum: bots_service_2.ChannelCategory
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Statistics retrieved successfully' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Category not found' }),
    __param(0, (0, common_1.Param)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotsController.prototype, "getBotStats", null);
exports.BotsController = BotsController = __decorate([
    (0, swagger_1.ApiTags)('Bots'),
    (0, common_1.Controller)('bots'),
    __metadata("design:paramtypes", [bots_service_1.BotsService])
], BotsController);
//# sourceMappingURL=bots.controller.js.map