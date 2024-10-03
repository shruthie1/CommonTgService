import { PromoteMsgsService } from './../promote-msgs/promote-msgs.service';
import { Model } from 'mongoose';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel, ActiveChannelDocument } from './schemas/active-channel.schema';
export declare class ActiveChannelsService {
    private activeChannelModel;
    private promoteMsgsService;
    constructor(activeChannelModel: Model<ActiveChannelDocument>, promoteMsgsService: PromoteMsgsService);
    create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    removeFromAvailableMsgs(channelId: string, msg: string): Promise<import("mongoose").Document<unknown, {}, ActiveChannelDocument> & ActiveChannel & import("mongoose").Document<unknown, any, any> & Required<{
        _id: unknown;
    }> & {
        __v?: number;
    }>;
    addToAvailableMsgs(channelId: string, msg: string): Promise<import("mongoose").Document<unknown, {}, ActiveChannelDocument> & ActiveChannel & import("mongoose").Document<unknown, any, any> & Required<{
        _id: unknown;
    }> & {
        __v?: number;
    }>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<ActiveChannel[]>;
    addReactions(channelId: string, reactions: string[]): Promise<ActiveChannel>;
    getRandomReaction(channelId: string): Promise<string>;
    removeReaction(channelId: string, reaction: string): Promise<ActiveChannel>;
    getActiveChannels(limit?: number, skip?: number, notIds?: string[]): Promise<ActiveChannel[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<ActiveChannel[]>;
    resetWordRestrictions(): Promise<void>;
    resetAvailableMsgs(): Promise<void>;
    updateBannedChannels(): Promise<void>;
    updateDefaultReactions(): Promise<void>;
}
