import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat2.dto';
import { UpdateStatDto } from './update-stat2.dto';
import { Stat2, Stat2Document } from './stat2.schema';

@Injectable()
export class Stat2Service {
  constructor(@InjectModel("Stats2Module") private statModel: Model<Stat2Document>) {}

  async create(createStatDto: CreateStatDto): Promise<Stat2> {
    const createdStat = new this.statModel(createStatDto);
    return createdStat.save();
  }

  async findByChatIdAndProfile(chatId: string, profile: string): Promise<Stat2> {
    const stat = await this.statModel.findOne({ chatId, profile }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
    }
    return stat;
  }

  async update(chatId: string, profile: string, updateStatDto: UpdateStatDto): Promise<Stat2> {
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
