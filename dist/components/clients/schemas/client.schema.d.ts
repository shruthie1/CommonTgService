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
    product: string;
    qrId: string;
    gpayId: string;
    dedicatedIps?: string[];
    preferredIpCountry?: string;
    autoAssignIps?: boolean;
    firstNames: string[];
    bufferLastNames: string[];
    promoteLastNames: string[];
    bios: string[];
    profilePics: string[];
}
export declare const ClientSchema: import("mongoose").Schema<Client, import("mongoose").Model<Client, any, any, any, any, any, Client>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Client, Document<unknown, {}, Client, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    channelLink?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    dbcoll?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    link?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    name?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    password?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    repl?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    promoteRepl?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    session?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    username?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    deployKey?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    product?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    qrId?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    gpayId?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    dedicatedIps?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    preferredIpCountry?: import("mongoose").SchemaDefinitionProperty<string, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    autoAssignIps?: import("mongoose").SchemaDefinitionProperty<boolean, Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    firstNames?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    bufferLastNames?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    promoteLastNames?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    bios?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profilePics?: import("mongoose").SchemaDefinitionProperty<string[], Client, Document<unknown, {}, Client, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Client & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, Client>;
