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
import { CreatePromoteStatDto } from './dto/create-promote-stat.dto';
import { UpdatePromoteStatDto } from './dto/update-promote-stat.dto';
import { PromoteStat, PromoteStatDocument } from './schemas/promote-stat.schema';
import { ClientService } from '../clients/client.service';
export declare class PromoteStatService {
    private promoteStatModel;
    private clientService;
    constructor(promoteStatModel: Model<PromoteStatDocument>, clientService: ClientService);
    create(createPromoteStatDto: CreatePromoteStatDto): Promise<PromoteStat>;
    findAll(): Promise<PromoteStat[]>;
    findByClient(client: string): Promise<PromoteStat>;
    update(client: string, updatePromoteStatDto: UpdatePromoteStatDto): Promise<PromoteStat>;
    deleteOne(client: string): Promise<void>;
    deleteAll(): Promise<void>;
    reinitPromoteStats(): Promise<void>;
}
