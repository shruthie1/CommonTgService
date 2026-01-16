import { Document } from 'mongoose';
export type PromoteClientDocument = PromoteClient & Document;
export declare class PromoteClient {
    tgId: string;
    mobile: string;
    lastActive: string;
    availableDate: string;
    channels: number;
    clientId?: string;
    status: string;
    message: string;
    lastUsed: Date;
    privacyUpdatedAt: Date;
    profilePicsUpdatedAt: Date;
    nameBioUpdatedAt: Date;
    profilePicsDeletedAt: Date;
    usernameUpdatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    lastChecked: Date;
    lastUpdateAttempt: Date;
    failedUpdateAttempts: number;
    lastUpdateFailure: Date;
}
export declare const PromoteClientSchema: import("mongoose").Schema<PromoteClient, import("mongoose").Model<PromoteClient, any, any, any, Document<unknown, any, PromoteClient, any, {}> & PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteClient, Document<unknown, {}, import("mongoose").FlatRecord<PromoteClient>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<PromoteClient> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
