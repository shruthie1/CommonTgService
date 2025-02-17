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
/// <reference types="mongoose/types/inferrawdoctype" />
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
    getActiveChannels(limit?: number, skip?: number, notIds?: any[]): Promise<Channel[]>;
}
