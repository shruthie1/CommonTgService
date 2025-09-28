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
export declare const ProxyIpSchema: import("mongoose").Schema<ProxyIp, import("mongoose").Model<ProxyIp, any, any, any, Document<unknown, any, ProxyIp, any, {}> & ProxyIp & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ProxyIp, Document<unknown, {}, import("mongoose").FlatRecord<ProxyIp>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<ProxyIp> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
