import mongoose, { Document } from 'mongoose';
export type UpiIdDocument = UpiId & Document;
export declare class UpiId {
}
export declare const UpiIdSchema: mongoose.Schema<UpiId, mongoose.Model<UpiId, any, any, any, (mongoose.Document<unknown, any, UpiId, any, mongoose.DefaultSchemaOptions> & UpiId & Required<{
    _id: unknown;
}> & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, UpiId, any, mongoose.DefaultSchemaOptions> & UpiId & Required<{
    _id: unknown;
}> & {
    __v: number;
}), any, UpiId>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, UpiId, mongoose.Document<unknown, {}, UpiId, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<UpiId & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {}, UpiId>;
