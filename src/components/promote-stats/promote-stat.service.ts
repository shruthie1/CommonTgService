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
    const promoteStat = await this.promoteStatModel.findOneAndUpdate({ client }, updatePromoteStatDto, { returnDocument: 'after' }).exec();
    if (!promoteStat) {
      throw new NotFoundException(`PromoteStat not found for client ${client}`);
    }
    return promoteStat;
  }
}
