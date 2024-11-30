// src/activechannels/activechannels.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, Query, BadRequestException } from '@nestjs/common';
import { ActiveChannelsService } from './active-channels.service';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { ActiveChannel } from './schemas/active-channel.schema';
import { AddReactionDto } from './dto/add-reaction.dto';

@ApiTags('Active Channels')
@Controller('active-channels')
export class ActiveChannelsController {
  constructor(private readonly activeChannelsService: ActiveChannelsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new active channel' })
  async create(@Body() createActiveChannelDto: CreateActiveChannelDto) {
    return this.activeChannelsService.create(createActiveChannelDto);
  }

  @Post('createMultiple')
  @ApiOperation({ summary: 'Create multiple channels' })
  @ApiBody({ type: [CreateActiveChannelDto] })
  async createMultiple(@Body() createChannelDtos: CreateActiveChannelDto[]): Promise<string> {
    return this.activeChannelsService.createMultiple(createChannelDtos);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search channels by filters' })
  @ApiQuery({ name: 'channelId', required: false, type: String })
  @ApiQuery({ name: 'broadcast', required: false, type: Boolean })
  @ApiQuery({ name: 'canSendMsgs', required: false, type: Boolean })
  @ApiQuery({ name: 'participantsCount', required: false, type: Number })
  @ApiQuery({ name: 'restricted', required: false, type: Boolean })
  @ApiQuery({ name: 'sendMessages', required: false, type: Boolean })
  @ApiQuery({ name: 'title', required: false, type: String })
  @ApiQuery({ name: 'username', required: false, type: String })
  @ApiQuery({ name: 'wordRestriction', required: false, type: Number })
  @ApiQuery({ name: 'dMRestriction', required: false, type: Number })
  @ApiQuery({ name: 'availableMsgs', required: false, type: [String] })
  @ApiQuery({ name: 'reactions', required: false, type: [String] })
  @ApiQuery({ name: 'banned', required: false, type: Boolean })
  @ApiQuery({ name: 'reactRestricted', required: false, type: Boolean })
  @ApiQuery({ name: 'megagroup', required: false, type: Boolean })
  search(@Query() query: any): Promise<ActiveChannel[]> {
    console.log(query);
    return this.activeChannelsService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active channels' })
  async findAll() {
    return this.activeChannelsService.findAll();
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Get an active channel by channelId' })
  //@apiresponse({ status: 200, description: 'Return the active channel', type: ActiveChannel })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async findOne(@Param('channelId') channelId: string) {
    return this.activeChannelsService.findOne(channelId);
  }

  @Patch(':channelId')
  @ApiOperation({ summary: 'Update an active channel by channelId' })
  //@apiresponse({ status: 200, description: 'The channel has been successfully updated.', type: ActiveChannel })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async update(@Param('channelId') channelId: string, @Body() updateActiveChannelDto: UpdateActiveChannelDto) {
    return this.activeChannelsService.update(channelId, updateActiveChannelDto);
  }

  @Delete(':channelId')
  @ApiOperation({ summary: 'Delete an active channel by channelId' })
  //@apiresponse({ status: 200, description: 'The channel has been successfully deleted.' })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async remove(@Param('channelId') channelId: string) {
    return this.activeChannelsService.remove(channelId);
  }

  @Post(':channelId/reactions')
  @ApiOperation({ summary: 'Add reaction to chat group' })
  addReaction(@Param('channelId') channelId: string, @Body() addReactionDto: AddReactionDto): Promise<ActiveChannel> {
    if (!addReactionDto.reactions) {
      throw new BadRequestException('Reaction is required');
    }
    return this.activeChannelsService.addReactions(channelId, addReactionDto.reactions);
  }

  @Get(':channelId/reactions/random')
  @ApiOperation({ summary: 'Get a random reaction from chat group' })
  getRandomReaction(@Param('channelId') channelId: string): Promise<string> {
    return this.activeChannelsService.getRandomReaction(channelId);
  }

  @Delete(':channelId/reactions')
  @ApiOperation({ summary: 'Remove reaction from chat group' })
  removeReaction(@Param('channelId') channelId: string, @Body() addReactionDto: AddReactionDto): Promise<ActiveChannel> {
    if (!addReactionDto.reactions) {
      throw new BadRequestException('Reaction is required');
    }
    return this.activeChannelsService.removeReaction(channelId, addReactionDto.reactions[0]);
  }
}
