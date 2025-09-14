import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { Bot } from './schemas/bot.schema';
import { ChannelCategory } from './bots.service';

// Import DTOs
import { CreateBotDto } from './dto/create-bot.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  SendPhotoDto,
  SendVideoDto,
  SendAudioDto,
  SendDocumentDto
} from './dto/media.dto';
import {
  SendVoiceDto,
  SendAnimationDto,
  SendStickerDto
} from './dto/media-extras.dto';
import { SendMediaGroupDto } from './dto/media-group.dto';

@ApiTags('Bots')
@Controller('bots')
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  // Bot Management Endpoints
  @Post()
  @ApiOperation({
    summary: 'Create a new bot',
    description: 'Creates a new Telegram bot with the provided configuration. The bot will be registered in the system and can be used for message distribution.',
  })
  @ApiResponse({ status: 201, description: 'Bot has been successfully created' })
  @ApiResponse({ status: 400, description: 'Invalid bot configuration provided' })
  @ApiResponse({ status: 409, description: 'Bot with the same token already exists' })
  @ApiBody({ type: CreateBotDto, description: 'Bot creation parameters including token and category' })
  async createBot(@Body() createBotDto: CreateBotDto) {
    return this.botsService.createBot(createBotDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all bots or filter by category',
    description: 'Retrieves a list of all registered bots. Can be filtered by category if provided.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Optional category filter to return only bots of a specific category',
    enum: ChannelCategory
  })
  @ApiResponse({ status: 200, description: 'List of bots retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid category provided' })
  async getBots(@Query('category') category?: ChannelCategory) {
    return this.botsService.getBots(category);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a bot by ID',
    description: 'Retrieves detailed information about a specific bot using its unique identifier.',
  })
  @ApiResponse({ status: 200, description: 'Bot details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  async getBotById(@Param('id') id: string) {
    return this.botsService.getBotById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a bot',
    description: 'Updates the configuration of an existing bot. Only provided fields will be modified.',
  })
  @ApiResponse({ status: 200, description: 'Bot updated successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiResponse({ status: 400, description: 'Invalid update parameters' })
  async updateBot(@Param('id') id: string, @Body() updateBotDto: Partial<Bot>) {
    return this.botsService.updateBot(id, updateBotDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a bot',
    description: 'Removes a bot from the system. This action cannot be undone.',
  })
  @ApiResponse({ status: 200, description: 'Bot successfully deleted' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  async deleteBot(@Param('id') id: string) {
    return this.botsService.deleteBot(id);
  }

  // Message Sending Endpoints - By Category
  @Post('category/:category/message')
  @ApiOperation({
    summary: 'Send a message using bots in a category',
    description: 'Sends a text message using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the message',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendMessageDto,
    description: 'Message content and optional formatting parameters'
  })
  @ApiResponse({ status: 200, description: 'Message sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid message parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendMessageByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendMessageDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
      return this.botsService.sendMessageByBotId(botId, data.message, data.options);
    }
    return this.botsService.sendMessageByCategory(category, data.message, data.options);
  }

  @Post('category/:category/photo')
  @ApiOperation({
    summary: 'Send a photo using bots in a category',
    description: 'Sends a photo using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the photo',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendPhotoDto,
    description: 'Photo content and optional caption parameters'
  })
  @ApiResponse({ status: 200, description: 'Photo sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid photo parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendPhotoByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendPhotoDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendPhotoByCategory(category, data.photo, data.options);
  }

  @Post('category/:category/video')
  @ApiOperation({
    summary: 'Send a video using bots in a category',
    description: 'Sends a video using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the video',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendVideoDto,
    description: 'Video content and optional caption parameters'
  })
  @ApiResponse({ status: 200, description: 'Video sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid video parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendVideoByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendVideoDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendVideoByCategory(category, data.video, data.options);
  }

  @Post('category/:category/audio')
  @ApiOperation({
    summary: 'Send audio using bots in a category',
    description: 'Sends an audio file using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the audio',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendAudioDto,
    description: 'Audio content and optional metadata parameters'
  })
  @ApiResponse({ status: 200, description: 'Audio sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid audio parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendAudioByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendAudioDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendAudioByCategory(category, data.audio, data.options);
  }

  @Post('category/:category/document')
  @ApiOperation({
    summary: 'Send a document using bots in a category',
    description: 'Sends a document file using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the document',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendDocumentDto,
    description: 'Document content and optional caption parameters'
  })
  @ApiResponse({ status: 200, description: 'Document sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid document parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendDocumentByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendDocumentDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendDocumentByCategory(category, data.document, data.options);
  }

  @Post('category/:category/voice')
  @ApiOperation({
    summary: 'Send a voice message using bots in a category',
    description: 'Sends a voice message using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the voice message',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendVoiceDto,
    description: 'Voice message content and optional parameters'
  })
  @ApiResponse({ status: 200, description: 'Voice message sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid voice message parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendVoiceByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendVoiceDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendVoiceByCategory(category, data.voice, data.options);
  }

  @Post('category/:category/animation')
  @ApiOperation({
    summary: 'Send an animation using bots in a category',
    description: 'Sends an animation (GIF or short video) using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the animation',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendAnimationDto,
    description: 'Animation content and optional caption parameters'
  })
  @ApiResponse({ status: 200, description: 'Animation sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid animation parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendAnimationByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendAnimationDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendAnimationByCategory(category, data.animation, data.options);
  }

  @Post('category/:category/sticker')
  @ApiOperation({
    summary: 'Send a sticker using bots in a category',
    description: 'Sends a sticker using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the sticker',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendStickerDto,
    description: 'Sticker file or sticker ID to send'
  })
  @ApiResponse({ status: 200, description: 'Sticker sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid sticker parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendStickerByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendStickerDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendStickerByCategory(category, data.sticker, data.options);
  }

  @Post('category/:category/media-group')
  @ApiOperation({
    summary: 'Send a media group using bots in a category',
    description: 'Sends a group of media (photos and videos) as an album using either all bots in a category or a specific bot if botId is provided.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to use for sending the media group',
    enum: ChannelCategory
  })
  @ApiQuery({
    name: 'botId',
    required: false,
    description: 'Optional specific bot ID to use instead of all bots in the category'
  })
  @ApiBody({
    type: SendMediaGroupDto,
    description: 'Array of media items (photos/videos) to send as a group'
  })
  @ApiResponse({ status: 200, description: 'Media group sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid media group parameters or bot category' })
  @ApiResponse({ status: 404, description: 'Bot or category not found' })
  async sendMediaGroupByCategory(
    @Param('category') category: ChannelCategory,
    @Query('botId') botId: string,
    @Body() data: SendMediaGroupDto
  ) {
    if (botId) {
      const bot = await this.botsService.getBotById(botId);
      if (bot.category !== category) {
        throw new Error(`Bot ${botId} does not belong to category ${category}`);
      }
    }
    return this.botsService.sendMediaGroupByCategory(category, data.media, data.options);
  }


  // Statistics and Monitoring
  @Get('category/:category/stats')
  @ApiOperation({
    summary: 'Get bot statistics by category',
    description: 'Retrieves aggregated statistics for all bots in a specific category, including message counts and performance metrics.',
  })
  @ApiParam({
    name: 'category',
    description: 'Category of bots to get statistics for',
    enum: ChannelCategory
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getBotStats(@Param('category') category: ChannelCategory) {
    return this.botsService.getBotStatsByCategory(category);
  }

}

