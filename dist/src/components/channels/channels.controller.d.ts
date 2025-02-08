import { ChannelsService } from './channels.service';
import { SearchChannelDto } from './dto/search-channel.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './schemas/channel.schema';
export declare class ChannelsController {
    private readonly channelsService;
    constructor(channelsService: ChannelsService);
    create(createChannelDto: CreateChannelDto): Promise<Channel>;
    createMultiple(createChannelDtos: CreateChannelDto[]): Promise<string>;
    search(query: SearchChannelDto): Promise<Channel[]>;
    findAll(): Promise<Channel[]>;
    findOne(channelId: string): Promise<Channel>;
    update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel>;
    remove(channelId: string): Promise<void>;
}
