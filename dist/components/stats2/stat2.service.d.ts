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
import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat2.dto';
import { UpdateStatDto } from './update-stat2.dto';
import { Stat2, Stat2Document } from './stat2.schema';
export declare class Stat2Service {
    private statModel;
    constructor(statModel: Model<Stat2Document>);
    create(createStatDto: CreateStatDto): Promise<Stat2>;
    findByChatIdAndProfile(chatId: string, profile: string): Promise<Stat2>;
    update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<Stat2>;
    findAll(): Promise<Stat2[]>;
    deleteOne(chatId: string, profile: string): Promise<void>;
    deleteAll(): Promise<void>;
}
