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
import mongoose from 'mongoose';
export type UserDocument = User & Document;
export declare class User {
    mobile: string;
    session: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    channels: number;
    personalChats: number;
    demoGiven: boolean;
    msgs: number;
    totalChats: number;
    lastActive: string;
    tgId: string;
    movieCount: number;
    photoCount: number;
    videoCount: number;
    gender: string | null;
    twoFA: boolean;
    expired: boolean;
    password: string;
    otherPhotoCount: number;
    otherVideoCount: number;
    ownPhotoCount: number;
    ownVideoCount: number;
    contacts: number;
    calls: {
        outgoing: number;
        incoming: number;
        video: number;
        chatCallCounts: any[];
        totalCalls: number;
    };
    recentUsers: any[];
}
export declare const UserSchema: mongoose.Schema<User, mongoose.Model<User, any, any, any, mongoose.Document<unknown, any, User> & User & {
    _id: mongoose.Types.ObjectId;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, User, mongoose.Document<unknown, {}, mongoose.FlatRecord<User>> & mongoose.FlatRecord<User> & {
    _id: mongoose.Types.ObjectId;
}>;
