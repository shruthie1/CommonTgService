import mongoose, { Document } from 'mongoose';
export type TimestampDocument = Timestamp & Document;
export declare class Timestamp {
}
export declare const TimestampSchema: mongoose.Schema<Timestamp, mongoose.Model<Timestamp, any, any, any, mongoose.Document<unknown, any, Timestamp, any, {}> & Timestamp & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Timestamp, mongoose.Document<unknown, {}, mongoose.FlatRecord<Timestamp>, {}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & mongoose.FlatRecord<Timestamp> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
