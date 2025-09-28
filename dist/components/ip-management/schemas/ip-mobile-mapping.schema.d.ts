import { Document } from 'mongoose';
export type IpMobileMappingDocument = IpMobileMapping & Document;
export declare class IpMobileMapping {
    mobile: string;
    ipAddress: string;
    clientId: string;
    status: string;
}
export declare const IpMobileMappingSchema: import("mongoose").Schema<IpMobileMapping, import("mongoose").Model<IpMobileMapping, any, any, any, Document<unknown, any, IpMobileMapping, any, {}> & IpMobileMapping & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, IpMobileMapping, Document<unknown, {}, import("mongoose").FlatRecord<IpMobileMapping>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<IpMobileMapping> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
