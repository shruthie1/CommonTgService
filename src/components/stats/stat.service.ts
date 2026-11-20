import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateStatDto } from './create-stat.dto';
import { UpdateStatDto } from './update-stat.dto';
import { Stat, StatDocument } from './stat.schema';

/**
 * Single-row reads and writes match the full row key {chatId, profile, client} (unique index
 * chatId_1_profile_1_client_1). Two sibling clients share a persona, so {chatId, profile} alone could
 * read, update or delete the other client's row (stats2 audit A4, 2026-11-20).
 */
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

  async findByChatIdAndProfile(chatId: string, profile: string, client: string): Promise<Stat> {
    const stat = await this.statModel.findOne({ chatId, profile, client }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
    return stat;
  }

  async update(chatId: string, profile: string, client: string, updateStatDto: UpdateStatDto): Promise<Stat> {
    const stat = await this.statModel.findOneAndUpdate({ chatId, profile, client }, updateStatDto, { returnDocument: 'after' }).exec();
    if (!stat) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
    return stat;
  }

  async deleteOne(chatId: string, profile: string, client: string): Promise<void> {
    const result = await this.statModel.deleteOne({ chatId, profile, client }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Stat not found for chatId ${chatId}, profile ${profile} and client ${client}`);
    }
  }

  async deleteAll(): Promise<void> {
    await this.statModel.deleteMany({}).exec();
  }
}
