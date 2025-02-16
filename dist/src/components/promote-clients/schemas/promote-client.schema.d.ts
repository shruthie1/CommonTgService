/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/inferschematype" />
import { Document } from 'mongoose';
export type PromoteClientDocument = PromoteClient & Document;
export declare class PromoteClient {
    tgId: string;
    mobile: string;
    lastActive: string;
    availableDate: string;
    channels: number;
}
export declare const PromoteClientSchema: import("mongoose").Schema<PromoteClient, import("mongoose").Model<PromoteClient, any, any, any, Document<unknown, any, PromoteClient> & PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteClient, Document<unknown, {}, import("mongoose").FlatRecord<PromoteClient>> & import("mongoose").FlatRecord<PromoteClient> & {
    _id: import("mongoose").Types.ObjectId;
}>;
