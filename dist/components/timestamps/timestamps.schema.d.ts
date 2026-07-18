import mongoose, { Document } from 'mongoose';
export type TimestampDocument = Timestamp & Document;
export declare class Timestamp {
}
export declare const TimestampSchema: mongoose.Schema<Timestamp, mongoose.Model<Timestamp, any, any, any, (mongoose.Document<unknown, any, Timestamp, any, mongoose.DefaultSchemaOptions> & Timestamp & Required<{
    _id: unknown;
}> & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, Timestamp, any, mongoose.DefaultSchemaOptions> & Timestamp & Required<{
    _id: unknown;
}> & {
    __v: number;
}), any, Timestamp>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Timestamp, mongoose.Document<unknown, {}, Timestamp, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Timestamp & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {}, Timestamp>;
