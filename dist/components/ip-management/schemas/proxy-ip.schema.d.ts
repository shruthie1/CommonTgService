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
}
export declare const ProxyIpSchema: import("mongoose").Schema<ProxyIp, import("mongoose").Model<ProxyIp, any, any, any, (Document<unknown, any, ProxyIp, any, import("mongoose").DefaultSchemaOptions> & ProxyIp & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, ProxyIp, any, import("mongoose").DefaultSchemaOptions> & ProxyIp & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, ProxyIp>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ProxyIp, Document<unknown, {}, ProxyIp, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    ipAddress?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    port?: import("mongoose").SchemaDefinitionProperty<number, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    protocol?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    password?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    status?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    isAssigned?: import("mongoose").SchemaDefinitionProperty<boolean, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    assignedToClient?: import("mongoose").SchemaDefinitionProperty<string, ProxyIp, Document<unknown, {}, ProxyIp, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<ProxyIp & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, ProxyIp>;
