import { Document, Schema as MongooseSchema } from 'mongoose';
export type DynamicDataDocument = DynamicData & Document;
export declare class DynamicData {
    configKey: string;
    data: any;
}
export declare const DynamicDataSchema: MongooseSchema<DynamicData, import("mongoose").Model<DynamicData, any, any, any, Document<unknown, any, DynamicData, any, {}> & DynamicData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, DynamicData, Document<unknown, {}, import("mongoose").FlatRecord<DynamicData>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<DynamicData> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
