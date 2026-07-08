import mongoose, { Document } from 'mongoose';
export type UpiIdDocument = UpiId & Document;
export declare class UpiId {
}
export declare const UpiIdSchema: mongoose.Schema<UpiId, mongoose.Model<UpiId, any, any, any, any, any, UpiId>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, UpiId, mongoose.Document<unknown, {}, UpiId, {
    id: string;
}, mongoose.DefaultSchemaOptions> & Omit<UpiId & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & mongoose.HydratedDocumentOverrides<{
    id: string;
}>, {}, UpiId>;
