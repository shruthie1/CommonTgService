import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePromoteStatDto } from './dto/create-promote-stat.dto';
import { UpdatePromoteStatDto } from './dto/update-promote-stat.dto';
import { PromoteStat, PromoteStatDocument } from './schemas/promote-stat.schema';
import { ClientService } from '../clients/client.service';

@Injectable()
export class PromoteStatService {
  constructor(@InjectModel(PromoteStat.name) private promoteStatModel: Model<PromoteStatDocument>,
    @Inject(forwardRef(() => ClientService))
    private clientService: ClientService,) { }

  async create(createPromoteStatDto: CreatePromoteStatDto): Promise<PromoteStat> {
    const createdPromoteStat = new this.promoteStatModel(createPromoteStatDto);
    return createdPromoteStat.save();
  }

  async findAll(): Promise<PromoteStat[]> {
    const promoteStat = await this.promoteStatModel.find().sort({ totalCount: -1 }).exec();
    return promoteStat;
  }


  async findByClient(client: string): Promise<PromoteStat> {
    const promoteStat = await this.promoteStatModel.findOne({ client }).exec()
    if (!promoteStat) {
      throw new NotFoundException(`PromoteStat not found for client ${client}`);
    }
    return promoteStat;
  }

  async update(client: string, updatePromoteStatDto: UpdatePromoteStatDto): Promise<PromoteStat> {
    const promoteStat = await this.promoteStatModel.findOneAndUpdate({ client }, updatePromoteStatDto, { new: true }).exec();
    if (!promoteStat) {
      throw new NotFoundException(`PromoteStat not found for client ${client}`);
    }
    return promoteStat;
  }

  async deleteOne(client: string): Promise<void> {
    const result = await this.promoteStatModel.deleteOne({ client }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`PromoteStat not found for client ${client}`);
    }
  }

  async deleteAll(): Promise<void> {
    await this.promoteStatModel.deleteMany({}).exec();
  }

  async reinitPromoteStats() {
    const users = await this.clientService.findAll();
    for (const user of users) {
      await this.promoteStatModel.updateOne({ client: user.clientId },
        {
          $set: {
            totalCount: 0,
            uniqueChannels: 0,
            releaseDay: Date.now(),
            lastupdatedTimeStamp: Date.now(),
            data: Object.fromEntries((await this.promoteStatModel.findOne({ client: user.clientId })).channels?.map(channel => [channel, 0])),
          }
        });
    }
  }
}
