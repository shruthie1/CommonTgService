import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PromotionIntelligenceService } from './promotion-intelligence.service';
import {
  AttributeConversionRequestDto,
  BatchChannelIntelligenceRequestDto,
  RecordChannelConversionRequestDto,
  RecordPromotionSendRequestDto,
} from './dto/promotion-intelligence.dto';

@ApiTags('Promotion Intelligence')
@Controller('promotion-intelligence')
export class PromotionIntelligenceController {
  constructor(private readonly intelligenceService: PromotionIntelligenceService) {}

  @Get('health')
  @ApiOperation({ summary: 'Get promotion intelligence wiring status' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async getHealth() {
    return this.intelligenceService.getHealth();
  }

  @Post('initialize')
  @ApiOperation({ summary: 'Initialize promotion intelligence services' })
  @ApiAcceptedResponse({ schema: { type: 'object', additionalProperties: true } })
  async initialize() {
    return this.intelligenceService.initialize();
  }

  @Get('channels/top')
  @ApiOperation({ summary: 'Get top-ranked channel intelligence documents' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  async getTopChannels(@Query('limit') limit?: number) {
    return this.intelligenceService.getTopChannels(limit || 50);
  }

  @Get('channels/:channelId')
  @ApiOperation({ summary: 'Get one channel intelligence document' })
  @ApiParam({ name: 'channelId' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true, nullable: true } })
  async getChannel(@Param('channelId') channelId: string) {
    return this.intelligenceService.getChannel(channelId);
  }

  @Post('channels/batch')
  @ApiOperation({ summary: 'Batch load channel intelligence documents' })
  @ApiBody({ type: BatchChannelIntelligenceRequestDto })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'object', additionalProperties: true } } })
  async getChannels(@Body() body: BatchChannelIntelligenceRequestDto) {
    return this.intelligenceService.getChannels(body.channelIds);
  }

  @Get('percentiles')
  @ApiOperation({ summary: 'Get cached promotion channel percentiles' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async getPercentiles(@Query('refresh') refresh?: string) {
    return this.intelligenceService.getPercentiles(refresh === 'true');
  }

  @Post('sends')
  @ApiOperation({ summary: 'Record a successful promotion send for attribution' })
  @ApiBody({ type: RecordPromotionSendRequestDto })
  @ApiAcceptedResponse({ schema: { type: 'object', properties: { recorded: { type: 'boolean' } } } })
  async recordPromotionSend(@Body() body: RecordPromotionSendRequestDto) {
    return this.intelligenceService.recordPromotionSend(body.channelId, body.mobile, body.clientId);
  }

  @Post('conversions/attribute')
  @ApiOperation({ summary: 'Attribute a user conversion to recently promoted common channels' })
  @ApiBody({ type: AttributeConversionRequestDto })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async attributeConversion(@Body() body: AttributeConversionRequestDto) {
    return this.intelligenceService.attributeConversion(body.commonChatIds, body.chatId, body.profile, body.isPaid === true);
  }

  @Post('conversions/:channelId')
  @ApiOperation({ summary: 'Record direct conversion credit for a channel' })
  @ApiParam({ name: 'channelId' })
  @ApiBody({ type: RecordChannelConversionRequestDto })
  @ApiAcceptedResponse({ schema: { type: 'object', properties: { recorded: { type: 'boolean' } } } })
  async recordChannelConversion(
    @Param('channelId') channelId: string,
    @Body() body: RecordChannelConversionRequestDto = {},
  ) {
    return this.intelligenceService.recordChannelConversion(channelId, body.weight || 1, body.isPaid === true);
  }
}
