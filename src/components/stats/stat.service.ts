import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';
import { Stat, StatDocument } from './stat.schema';

@Injectable()
export class StatService {
  constructor(@InjectModel("StatsModule") private statModel: Model<StatDocument>) {}

  async create(createStatDto: CreateStatDto): Promise<Stat> {
    const createdStat = new this.statModel(createStatDto);
    return createdStat.save();
  }

  async findAll(): Promise<Stat[]> {
    const stats = await this.statModel.find().exec();
    return stats;
  }

  async findByChatIdAndProfile(chatId: string, profile: string): Promise<Stat> {
    const stat = await this.statModel.findOne({ chatId, profile }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
    }
    return stat;
  }

  async update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<Stat> {
    const stat = await this.statModel.findOneAndUpdate({ chatId, profile }, updateStatDto, { new: true }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
    }
    return stat;
  }

  async deleteOne(chatId: string, profile: string): Promise<void> {
    const result = await this.statModel.deleteOne({ chatId, profile }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
    }
  }

  async deleteAll(): Promise<void> {
    await this.statModel.deleteMany({}).exec();
  }
}
