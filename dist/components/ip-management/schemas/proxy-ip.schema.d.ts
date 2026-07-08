import { Document } from 'mongoose';
export type ProxyIpDocument = ProxyIp & Document;
export declare class ProxyIp {
    ipAddress: string;
    port: number;
    protocol: string;
    username?: string;
    password?: string;
    status: string;
    isAssigned: boolean;
    assignedToClient?: string;
    source: string;
    webshareId?: string;
    countryCode?: string;
    cityName?: string;
    lastVerified?: Date;
    lastUsed?: Date;
    consecutiveFails: number;
    roundRobinIndex: number;
}
export declare const ProxyIpSchema: import("mongoose").Schema<ProxyIp, import("mongoose").Model<ProxyIp, any, any, any, any, any, ProxyIp>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ProxyIp, Document<unknown, {}, ProxyIp, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    ipAddress?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    port?: import("mongoose").SchemaDefinitionProperty<number, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    protocol?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    username?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    password?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    status?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    isAssigned?: import("mongoose").SchemaDefinitionProperty<boolean, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    assignedToClient?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    source?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    webshareId?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    countryCode?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    cityName?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastVerified?: import("mongoose").SchemaDefinitionProperty<Date, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    consecutiveFails?: import("mongoose").SchemaDefinitionProperty<number, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    roundRobinIndex?: import("mongoose").SchemaDefinitionProperty<number, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, ProxyIp>;
