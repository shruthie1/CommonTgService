import { Stat2Service } from './stat2.service';
import { CreateStatDto } from './create-stat2.dto';
import { UpdateStatDto } from './update-stat2.dto';
export declare class Stat2Controller {
    private readonly statService;
    constructor(statService: Stat2Service);
    create(createStatDto: CreateStatDto): Promise<import("src/components/stats2/stat2.schema").Stat2>;
    findByChatIdAndProfile(chatId: string, profile: string): Promise<import("src/components/stats2/stat2.schema").Stat2>;
    update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<import("src/components/stats2/stat2.schema").Stat2>;
    deleteOne(chatId: string, profile: string): Promise<void>;
    deleteAll(): Promise<void>;
}
