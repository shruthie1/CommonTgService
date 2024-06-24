import { Model } from 'mongoose';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel, ActiveChannelDocument } from './schemas/active-channel.schema';
export declare class ActiveChannelsService {
    private activeChannelModel;
    constructor(activeChannelModel: Model<ActiveChannelDocument>);
    create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<ActiveChannel[]>;
    addReactions(channelId: string, reactions: string[]): Promise<ActiveChannel>;
    getRandomReaction(channelId: string): Promise<string>;
    removeReaction(channelId: string, reaction: string): Promise<ActiveChannel>;
    getActiveChannels(limit?: number, skip?: number, keywords?: any[], notIds?: any[]): Promise<ActiveChannel[]>;
    executeQuery(query: any, sort?: any, limit?: number): Promise<ActiveChannel[]>;
}
