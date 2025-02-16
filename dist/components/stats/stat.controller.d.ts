import { StatService } from './stat.service';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';
export declare class StatController {
    private readonly statService;
    constructor(statService: StatService);
    create(createStatDto: CreateStatDto): Promise<import("src/components/stats/stat.schema").Stat>;
    findByChatIdAndProfile(chatId: string, profile: string): Promise<import("src/components/stats/stat.schema").Stat>;
    update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<import("src/components/stats/stat.schema").Stat>;
    deleteOne(chatId: string, profile: string): Promise<void>;
    deleteAll(): Promise<void>;
}
