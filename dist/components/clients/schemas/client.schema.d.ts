import { Document } from 'mongoose';
export type ClientDocument = Client & Document;
export declare class Client extends Document {
    channelLink: string;
    dbcoll: string;
    link: string;
    name: string;
    mobile: string;
    password: string;
    repl: string;
    session: string;
    userName: string;
    clientId: string;
    deployKey: string;
    mainAccount: string;
    product: string;
}
export declare const ClientSchema: import("mongoose").Schema<Client, import("mongoose").Model<Client, any, any, any, Document<unknown, any, Client> & Client & Required<{
    _id: unknown;
}>, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Client, Document<unknown, {}, import("mongoose").FlatRecord<Client>> & import("mongoose").FlatRecord<Client> & Required<{
    _id: unknown;
}>>;
