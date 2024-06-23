import { Document } from 'mongoose';
export type BufferClientDocument = BufferClient & Document;
export declare class BufferClient {
    tgId: string;
    mobile: string;
    session: string;
    createdDate: string;
    updatedDate: string;
    availableDate: string;
    channels: number;
}
export declare const BufferClientSchema: import("mongoose").Schema<BufferClient, import("mongoose").Model<BufferClient, any, any, any, Document<unknown, any, BufferClient> & BufferClient & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, BufferClient, Document<unknown, {}, import("mongoose").FlatRecord<BufferClient>> & import("mongoose").FlatRecord<BufferClient> & {
    _id: import("mongoose").Types.ObjectId;
}>;
