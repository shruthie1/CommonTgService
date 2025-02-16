import { PromoteStatService } from './promote-stat.service';
import { CreatePromoteStatDto } from './dto/create-promote-stat.dto';
import { UpdatePromoteStatDto } from './dto/update-promote-stat.dto';
export declare class PromoteStatController {
    private readonly promoteStatService;
    constructor(promoteStatService: PromoteStatService);
    create(createPromoteStatDto: CreatePromoteStatDto): Promise<import("src/components/promote-stats/schemas/promote-stat.schema").PromoteStat>;
    findByClient(client: string): Promise<import("src/components/promote-stats/schemas/promote-stat.schema").PromoteStat>;
    update(client: string, updatePromoteStatDto: UpdatePromoteStatDto): Promise<import("src/components/promote-stats/schemas/promote-stat.schema").PromoteStat>;
    deleteOne(client: string): Promise<void>;
    deleteAll(): Promise<void>;
}
