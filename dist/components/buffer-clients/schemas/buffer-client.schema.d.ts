import { Document } from 'mongoose';
export declare class BufferClient extends Document {
    tgId: string;
    mobile: string;
    session: string;
    createdDate: string;
    updatedDate: string;
    availableDate: string;
    channels: number;
}
export declare const BufferClientSchema: import("mongoose").Schema<BufferClient, import("mongoose").Model<BufferClient, any, any, any, Document<unknown, any, BufferClient> & BufferClient & Required<{
    _id: unknown;
}>, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, BufferClient, Document<unknown, {}, import("mongoose").FlatRecord<BufferClient>> & import("mongoose").FlatRecord<BufferClient> & Required<{
    _id: unknown;
}>>;
