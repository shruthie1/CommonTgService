import mongoose, { Document } from 'mongoose';
export type ConfigurationDocument = Configuration & Document;
export declare class Configuration {
}
export declare const ConfigurationSchema: mongoose.Schema<Configuration, mongoose.Model<Configuration, any, any, any, (mongoose.Document<unknown, any, Configuration, any, mongoose.DefaultSchemaOptions> & Configuration & Required<{
    _id: unknown;
}> & {
    __v: number;
} & {
    id: string;
}) | (mongoose.Document<unknown, any, Configuration, any, mongoose.DefaultSchemaOptions> & Configuration & Required<{
    _id: unknown;
}> & {
    __v: number;
}), any, Configuration>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Configuration, mongoose.Document<unknown, {}, Configuration, {
    id: string;
}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & Omit<Configuration & Required<{
    _id: unknown;
}> & {
    __v: number;
}, "id"> & {
    id: string;
}, {}, Configuration>;
