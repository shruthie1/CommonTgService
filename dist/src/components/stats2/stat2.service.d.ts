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
