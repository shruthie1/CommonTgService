import mongoose, { Document } from 'mongoose';
export type BuildDocument = Build & Document;
export declare class Build {
}
export declare const BuildSchema: mongoose.Schema<Build, mongoose.Model<Build, any, any, any, any, any, Build>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Build, mongoose.Document<unknown, {}, Build, {
    id: string;
}, mongoose.DefaultSchemaOptions> & Omit<Build & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & mongoose.HydratedDocumentOverrides<{
    id: string;
}>, {}, Build>;
