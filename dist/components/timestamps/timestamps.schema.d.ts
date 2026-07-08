import mongoose, { Document } from 'mongoose';
export type TimestampDocument = Timestamp & Document;
export declare class Timestamp {
}
export declare const TimestampSchema: mongoose.Schema<Timestamp, mongoose.Model<Timestamp, any, any, any, any, any, Timestamp>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Timestamp, mongoose.Document<unknown, {}, Timestamp, {
    id: string;
}, mongoose.DefaultSchemaOptions> & Omit<Timestamp & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & mongoose.HydratedDocumentOverrides<{
    id: string;
}>, {}, Timestamp>;
