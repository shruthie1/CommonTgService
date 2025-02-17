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
/// <reference types="mongoose/types/inferrawdoctype" />
import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';
import { Stat, StatDocument } from './stat.schema';
export declare class StatService {
    private statModel;
    constructor(statModel: Model<StatDocument>);
    create(createStatDto: CreateStatDto): Promise<Stat>;
    findAll(): Promise<Stat[]>;
    findByChatIdAndProfile(chatId: string, profile: string): Promise<Stat>;
    update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<Stat>;
    deleteOne(chatId: string, profile: string): Promise<void>;
    deleteAll(): Promise<void>;
}
