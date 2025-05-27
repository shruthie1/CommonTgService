import mongoose, { Document } from 'mongoose';
export type UpiIdDocument = UpiId & Document;
export declare class UpiId {
}
export declare const UpiIdSchema: mongoose.Schema<UpiId, mongoose.Model<UpiId, any, any, any, mongoose.Document<unknown, any, UpiId, any> & UpiId & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, UpiId, mongoose.Document<unknown, {}, mongoose.FlatRecord<UpiId>, {}> & mongoose.FlatRecord<UpiId> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
