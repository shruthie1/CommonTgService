import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';

@Injectable()
export class ConfigurationService {
    constructor(@InjectModel('configurationModule') private configurationModel: Model<Configuration>) { }

    async findOne(): Promise<any> {
        const user = await this.configurationModel.findOne({}).exec();
        if (!user) {
            throw new NotFoundException(`configurationModel not found`);
        }
        return user;
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.configurationModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: {...updateClientDto} },
            { new: true, upsert: true }
        ).exec();
        if (!updatedUser) {
            throw new NotFoundException(`configurationModel not found`);
        }
        return updatedUser;
    }

}
