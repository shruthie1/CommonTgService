import mongoose, { Document } from 'mongoose';
export type PromoteMsgDocument = PromoteMsg & Document;
export declare class PromoteMsg {
}
export declare const PromoteMsgSchema: mongoose.Schema<PromoteMsg, mongoose.Model<PromoteMsg, any, any, any, (mongoose.Document<unknown, any, PromoteMsg, any, mongoose.DefaultSchemaOptions> & PromoteMsg & Required<{
    _id: unknown;
}> & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, PromoteMsg, any, mongoose.DefaultSchemaOptions> & PromoteMsg & Required<{
    _id: unknown;
}> & {
    __v: number;
}), any, PromoteMsg>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, PromoteMsg, mongoose.Document<unknown, {}, PromoteMsg, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<PromoteMsg & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {}, PromoteMsg>;
