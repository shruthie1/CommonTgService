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
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ActiveChannelDocument = ActiveChannel & Document;
export declare class ActiveChannel {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    title: string;
    username: string;
    wordRestriction: number;
    dMRestriction: number;
    availableMsgs: string[];
    reactions: string[];
    banned: boolean;
    megagroup: boolean;
    private: boolean;
    reactRestricted: boolean;
    forbidden: boolean;
}
export declare const ActiveChannelSchema: mongoose.Schema<ActiveChannel, mongoose.Model<ActiveChannel, any, any, any, Document<unknown, any, ActiveChannel> & ActiveChannel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, mongoose.FlatRecord<ActiveChannel>> & mongoose.FlatRecord<ActiveChannel> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
