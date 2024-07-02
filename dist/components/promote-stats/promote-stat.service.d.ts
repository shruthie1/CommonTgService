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
    findByClient(client: string): Promise<PromoteStat>;
    update(client: string, updatePromoteStatDto: UpdatePromoteStatDto): Promise<PromoteStat>;
    deleteOne(client: string): Promise<void>;
    deleteAll(): Promise<void>;
    reinitPromoteStats(): Promise<void>;
}
