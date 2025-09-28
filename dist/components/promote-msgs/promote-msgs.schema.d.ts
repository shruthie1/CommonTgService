import mongoose, { Document } from 'mongoose';
export type PromoteMsgDocument = PromoteMsg & Document;
export declare class PromoteMsg {
}
export declare const PromoteMsgSchema: mongoose.Schema<PromoteMsg, mongoose.Model<PromoteMsg, any, any, any, mongoose.Document<unknown, any, PromoteMsg, any, {}> & PromoteMsg & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, PromoteMsg, mongoose.Document<unknown, {}, mongoose.FlatRecord<PromoteMsg>, {}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & mongoose.FlatRecord<PromoteMsg> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
