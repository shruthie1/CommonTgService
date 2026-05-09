import { ActiveChannelsService } from './active-channels.service';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel } from './schemas/active-channel.schema';
export declare class ActiveChannelsController {
    private readonly activeChannelsService;
    constructor(activeChannelsService: ActiveChannelsService);
    create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel>;
    createMultiple(createChannelDtos: CreateActiveChannelDto[]): Promise<string>;
    analytics(): Promise<Record<string, any>>;
    paginated(page?: string, limit?: string, sortBy?: string, sortOrder?: string, search?: string, filter?: string): Promise<{
        channels: ActiveChannel[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    search(query: any): Promise<ActiveChannel[]>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    remove(channelId: string): Promise<void>;
}
