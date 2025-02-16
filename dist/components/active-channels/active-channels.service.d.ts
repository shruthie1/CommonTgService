/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/inferschematype" />
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
    createMultiple(createChannelDtos: CreateActiveChannelDto[]): Promise<string>;
    findAll(): Promise<ActiveChannel[]>;
    findOne(channelId: string): Promise<ActiveChannel>;
    update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel>;
    removeFromAvailableMsgs(channelId: string, msg: string): Promise<import("mongoose").Document<unknown, {}, ActiveChannelDocument> & ActiveChannel & import("mongoose").Document<any, any, any> & {
        _id: import("mongoose").Types.ObjectId;
    }>;
    addToAvailableMsgs(channelId: string, msg: string): Promise<import("mongoose").Document<unknown, {}, ActiveChannelDocument> & ActiveChannel & import("mongoose").Document<any, any, any> & {
        _id: import("mongoose").Types.ObjectId;
    }>;
    remove(channelId: string): Promise<void>;
    search(filter: any): Promise<ActiveChannel[]>;
    addReactions(channelId: string, reactions: string[]): Promise<ActiveChannel>;
    getRandomReaction(channelId: string): Promise<string>;
    removeReaction(channelId: string, reaction: string): Promise<ActiveChannel>;
    getActiveChannels(limit?: number, skip?: number, notIds?: any[]): Promise<ActiveChannel[]>;
    executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<ActiveChannel[]>;
    resetWordRestrictions(): Promise<void>;
    resetAvailableMsgs(): Promise<void>;
    updateBannedChannels(): Promise<void>;
    updateDefaultReactions(): Promise<void>;
}
