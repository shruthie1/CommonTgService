import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
export declare class ChannelsService implements OnModuleInit {
    private ChannelModel;
    private readonly logger;
    constructor(ChannelModel: Model<ChannelDocument>);
    onModuleInit(): Promise<void>;
    create(createChannelDto: CreateChannelDto): Promise<Channel>;
    createMultiple(createChannelDtos: Partial<CreateChannelDto>[]): Promise<string>;
    findAll(): Promise<Channel[]>;
    findOne(channelId: string): Promise<Channel>;
    update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<Channel[]>;
    getChannels(limit?: number, skip?: number, keywords?: any[], notIds?: any[]): Promise<Channel[]>;
    executeQuery(query: any, sort?: any, limit?: number): Promise<Channel[]>;
    getActiveChannels(limit?: number, skip?: number, notIds?: any[]): Promise<Channel[]>;
    private copyDefinedFields;
    private legacySendabilityRepaired;
    private repairLegacySendabilityFlags;
}
