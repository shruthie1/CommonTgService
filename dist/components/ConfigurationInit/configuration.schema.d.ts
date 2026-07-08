import mongoose, { Document } from 'mongoose';
export type ConfigurationDocument = Configuration & Document;
export declare class Configuration {
}
export declare const ConfigurationSchema: mongoose.Schema<Configuration, mongoose.Model<Configuration, any, any, any, any, any, Configuration>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Configuration, mongoose.Document<unknown, {}, Configuration, {
    id: string;
}, mongoose.DefaultSchemaOptions> & Omit<Configuration & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & mongoose.HydratedDocumentOverrides<{
    id: string;
}>, {}, Configuration>;
