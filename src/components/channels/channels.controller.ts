import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, Query, BadRequestException } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { SearchChannelDto } from './dto/search-channel.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './schemas/channel.schema';

@ApiTags('Channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new  channel' })
  async create(@Body() createChannelDto: CreateChannelDto) {
    return this.channelsService.create(createChannelDto);
  }
  @Post('createMultiple')
  @ApiOperation({ summary: 'Create multiple channels' })
  @ApiBody({ type: [CreateChannelDto] })
  async createMultiple(@Body() createChannelDtos: CreateChannelDto[]): Promise<string> {
    return this.channelsService.createMultiple(createChannelDtos);
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
  search(@Query() query: SearchChannelDto): Promise<Channel[]> {
    console.log(query);
    return this.channelsService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'Get all  channels' })
  async findAll() {
    return this.channelsService.findAll();
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Get an  channel by channelId' })
  //@apiresponse({ status: 200, description: 'Return the  channel', type: Channel })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async findOne(@Param('channelId') channelId: string) {
    return this.channelsService.findOne(channelId);
  }

  @Patch(':channelId')
  @ApiOperation({ summary: 'Update an  channel by channelId' })
  //@apiresponse({ status: 200, description: 'The channel has been successfully updated.', type: Channel })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async update(@Param('channelId') channelId: string, @Body() updateChannelDto: UpdateChannelDto) {
    return this.channelsService.update(channelId, updateChannelDto);
  }

  @Delete(':channelId')
  @ApiOperation({ summary: 'Delete an  channel by channelId' })
  //@apiresponse({ status: 200, description: 'The channel has been successfully deleted.' })
  //@apiresponse({ status: 404, description: 'Channel not found' })
  async remove(@Param('channelId') channelId: string) {
    return this.channelsService.remove(channelId);
  }
}
