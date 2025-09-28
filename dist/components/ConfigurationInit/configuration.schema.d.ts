import mongoose, { Document } from 'mongoose';
export type ConfigurationDocument = Configuration & Document;
export declare class Configuration {
}
export declare const ConfigurationSchema: mongoose.Schema<Configuration, mongoose.Model<Configuration, any, any, any, mongoose.Document<unknown, any, Configuration, any, {}> & Configuration & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Configuration, mongoose.Document<unknown, {}, mongoose.FlatRecord<Configuration>, {}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & mongoose.FlatRecord<Configuration> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
