import { Document, Schema as MongooseSchema } from 'mongoose';
export type DynamicDataDocument = DynamicData & Document;
export declare class DynamicData {
    configKey: string;
    data: any;
}
export declare const DynamicDataSchema: MongooseSchema<DynamicData, import("mongoose").Model<DynamicData, any, any, any, (Document<unknown, any, DynamicData, any, import("mongoose").DefaultSchemaOptions> & DynamicData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, DynamicData, any, import("mongoose").DefaultSchemaOptions> & DynamicData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, DynamicData>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, DynamicData, Document<unknown, {}, DynamicData, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<DynamicData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    configKey?: import("mongoose").SchemaDefinitionProperty<string, DynamicData, Document<unknown, {}, DynamicData, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<DynamicData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    data?: import("mongoose").SchemaDefinitionProperty<any, DynamicData, Document<unknown, {}, DynamicData, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<DynamicData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, DynamicData>;
