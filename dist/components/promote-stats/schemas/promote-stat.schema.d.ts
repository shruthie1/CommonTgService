import { Document } from 'mongoose';
export type PromoteStatDocument = PromoteStat & Document;
export declare class PromoteStat {
    client: string;
    data: Map<string, number>;
    totalCount: number;
    uniqueChannels: number;
    releaseDay: number;
    lastupdatedTimeStamp: number;
    isActive: boolean;
    lastUpdatedTimeStamp: number;
    channels: string[];
}
export declare const PromoteStatSchema: import("mongoose").Schema<PromoteStat, import("mongoose").Model<PromoteStat, any, any, any, Document<unknown, any, PromoteStat> & PromoteStat & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteStat, Document<unknown, {}, import("mongoose").FlatRecord<PromoteStat>> & import("mongoose").FlatRecord<PromoteStat> & {
    _id: import("mongoose").Types.ObjectId;
}>;
