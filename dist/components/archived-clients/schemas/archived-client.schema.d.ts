import { Document } from 'mongoose';
export type ArchivedClientDocument = ArchivedClient & Document;
interface SessionHistoryEntry {
    session: string;
    action: string;
    timestamp: Date;
    status: string;
    source?: string;
}
export declare class ArchivedClient {
    mobile: string;
    session: string;
    oldSessions: string[];
    lastUpdated?: Date;
    lastCleanup?: Date;
    sessionHistory?: SessionHistoryEntry[];
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const ArchivedClientSchema: import("mongoose").Schema<ArchivedClient, import("mongoose").Model<ArchivedClient, any, any, any, Document<unknown, any, ArchivedClient, any> & ArchivedClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ArchivedClient, Document<unknown, {}, import("mongoose").FlatRecord<ArchivedClient>, {}> & import("mongoose").FlatRecord<ArchivedClient> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
export {};
