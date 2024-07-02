import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';
import { Stat, StatDocument } from './stat.schema';
export declare class StatService {
    private statModel;
    constructor(statModel: Model<StatDocument>);
    create(createStatDto: CreateStatDto): Promise<Stat>;
    findByChatIdAndProfile(chatId: string, profile: string): Promise<Stat>;
    update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<Stat>;
    deleteOne(chatId: string, profile: string): Promise<void>;
    deleteAll(): Promise<void>;
}
