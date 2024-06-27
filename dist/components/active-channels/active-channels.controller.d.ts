import { ActiveChannelsService } from './active-channels.service';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel } from './schemas/active-channel.schema';
import { AddReactionDto } from './dto/add-reaction.dto';
export declare class ActiveChannelsController {
    private readonly activeChannelsService;
    constructor(activeChannelsService: ActiveChannelsService);
    create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel>;
    search(query: any): Promise<ActiveChannel[]>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    remove(channelId: string): Promise<void>;
    addReaction(channelId: string, addReactionDto: AddReactionDto): Promise<ActiveChannel>;
    getRandomReaction(channelId: string): Promise<string>;
    removeReaction(channelId: string, addReactionDto: AddReactionDto): Promise<ActiveChannel>;
}
