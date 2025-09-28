import mongoose, { Document } from 'mongoose';
export type BuildDocument = Build & Document;
export declare class Build {
}
export declare const BuildSchema: mongoose.Schema<Build, mongoose.Model<Build, any, any, any, mongoose.Document<unknown, any, Build, any, {}> & Build & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Build, mongoose.Document<unknown, {}, mongoose.FlatRecord<Build>, {}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & mongoose.FlatRecord<Build> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
