import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
export declare class ChannelsService {
    private ChannelModel;
    constructor(ChannelModel: Model<ChannelDocument>);
    create(createChannelDto: CreateChannelDto): Promise<Channel>;
    createMultiple(createChannelDtos: CreateChannelDto[]): Promise<string>;
    findAll(): Promise<Channel[]>;
    findOne(channelId: string): Promise<Channel>;
    update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<Channel[]>;
    getChannels(limit?: number, skip?: number, keywords?: any[], notIds?: any[]): Promise<Channel[]>;
    executeQuery(query: any, sort?: any, limit?: number): Promise<Channel[]>;
}
