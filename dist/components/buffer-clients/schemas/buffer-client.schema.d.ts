import { Document } from 'mongoose';
export type BufferClientDocument = BufferClient & Document;
export declare class BufferClient {
    tgId: string;
    mobile: string;
    session: string;
    availableDate: string;
    channels: number;
    status: 'active' | 'inactive';
}
export declare const BufferClientSchema: import("mongoose").Schema<BufferClient, import("mongoose").Model<BufferClient, any, any, any, Document<unknown, any, BufferClient, any, {}> & BufferClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, BufferClient, Document<unknown, {}, import("mongoose").FlatRecord<BufferClient>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<BufferClient> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
