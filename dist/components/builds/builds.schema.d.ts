import mongoose, { Document } from 'mongoose';
export type BuildDocument = Build & Document;
export declare class Build {
}
export declare const BuildSchema: mongoose.Schema<Build, mongoose.Model<Build, any, any, any, (mongoose.Document<unknown, any, Build, any, mongoose.DefaultSchemaOptions> & Build & Required<{
    _id: unknown;
}> & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, Build, any, mongoose.DefaultSchemaOptions> & Build & Required<{
    _id: unknown;
}> & {
    __v: number;
}), any, Build>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Build, mongoose.Document<unknown, {}, Build, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Build & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {}, Build>;
