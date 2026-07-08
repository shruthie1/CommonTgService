import { Document } from 'mongoose';
import { WarmupPhaseType } from '../../shared/warmup-phases';
import { ClientStatusType } from '../../shared/base-client.service';
export type PromoteClientDocument = PromoteClient & Document;
export declare class PromoteClient {
    tgId: string;
    mobile: string;
    lastActive: string;
    availableDate: string;
    channels: number;
    clientId?: string;
    status: ClientStatusType;
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
    session: string;
    inUse: boolean;
    twoFASetAt: Date;
    otherAuthsRemovedAt: Date;
    warmupPhase: WarmupPhaseType;
    warmupJitter: number;
    enrolledAt: Date;
    organicActivityAt: Date;
    sessionRotatedAt: Date;
    assignedFirstName: string;
    assignedLastName: string;
    assignedBio: string;
    assignedProfilePics: string[];
}
export declare const PromoteClientSchema: import("mongoose").Schema<PromoteClient, import("mongoose").Model<PromoteClient, any, any, any, any, any, PromoteClient>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteClient, Document<unknown, {}, PromoteClient, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    tgId?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastActive?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    availableDate?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    channels?: import("mongoose").SchemaDefinitionProperty<number, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    status?: import("mongoose").SchemaDefinitionProperty<ClientStatusType, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    message?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    privacyUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profilePicsUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    nameBioUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profilePicsDeletedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    usernameUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    updatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastChecked?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastUpdateAttempt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    failedUpdateAttempts?: import("mongoose").SchemaDefinitionProperty<number, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastUpdateFailure?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    session?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    inUse?: import("mongoose").SchemaDefinitionProperty<boolean, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    twoFASetAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    otherAuthsRemovedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    warmupPhase?: import("mongoose").SchemaDefinitionProperty<WarmupPhaseType, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    warmupJitter?: import("mongoose").SchemaDefinitionProperty<number, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    enrolledAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    organicActivityAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    sessionRotatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    assignedFirstName?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    assignedLastName?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    assignedBio?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    assignedProfilePics?: import("mongoose").SchemaDefinitionProperty<string[], PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, PromoteClient>;
