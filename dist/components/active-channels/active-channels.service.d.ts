import { PromoteMsgsService } from './../promote-msgs/promote-msgs.service';
import { Model } from 'mongoose';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel, ActiveChannelDocument } from './schemas/active-channel.schema';
export declare class ActiveChannelsService {
    private activeChannelModel;
    private promoteMsgsService;
    private readonly DEFAULT_LIMIT;
    private readonly DEFAULT_SKIP;
    private readonly MIN_PARTICIPANTS_COUNT;
    constructor(activeChannelModel: Model<ActiveChannelDocument>, promoteMsgsService: PromoteMsgsService);
    create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel>;
    createMultiple(createChannelDtos: Partial<CreateActiveChannelDto>[]): Promise<string>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel | null>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    removeFromAvailableMsgs(channelId: string, msg: string): Promise<ActiveChannel | null>;
    addToAvailableMsgs(channelId: string, msg: string): Promise<ActiveChannel | null>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<ActiveChannel[]>;
    getActiveChannels(limit?: number, skip?: number, notIds?: string[]): Promise<ActiveChannel[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<ActiveChannel[]>;
    resetWordRestrictions(): Promise<void>;
    resetAvailableMsgs(): Promise<void>;
    updateBannedChannels(): Promise<void>;
    private getAvailableMessages;
    private handleError;
}
