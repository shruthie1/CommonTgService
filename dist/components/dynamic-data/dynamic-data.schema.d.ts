import { Document, Schema as MongooseSchema } from 'mongoose';
export type DynamicDataDocument = DynamicData & Document;
export declare class DynamicData {
    configKey: string;
    data: any;
}
export declare const DynamicDataSchema: MongooseSchema<DynamicData, import("mongoose").Model<DynamicData, any, any, any, any, any, DynamicData>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, DynamicData, Document<unknown, {}, DynamicData, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<DynamicData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    configKey?: import("mongoose").SchemaDefinitionProperty<string, DynamicData, Document<unknown, {}, DynamicData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DynamicData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    data?: import("mongoose").SchemaDefinitionProperty<any, DynamicData, Document<unknown, {}, DynamicData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<DynamicData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, DynamicData>;
