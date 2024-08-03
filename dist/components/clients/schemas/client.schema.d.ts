import { Document } from 'mongoose';
export type ClientDocument = Client & Document;
export declare class Client {
    channelLink: string;
    dbcoll: string;
    link: string;
    name: string;
    mobile: string;
    password: string;
    repl: string;
    promoteRepl: string;
    session: string;
    username: string;
    clientId: string;
    deployKey: string;
    mainAccount: string;
    product: string;
}
export declare const ClientSchema: import("mongoose").Schema<Client, import("mongoose").Model<Client, any, any, any, Document<unknown, any, Client> & Client & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Client, Document<unknown, {}, import("mongoose").FlatRecord<Client>> & import("mongoose").FlatRecord<Client> & {
    _id: import("mongoose").Types.ObjectId;
}>;
