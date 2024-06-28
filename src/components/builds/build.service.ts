import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Build } from './builds.schema';

@Injectable()
export class BuildService {
    constructor(@InjectModel('buildModule') private buildModel: Model<Build>) {
     }

    async OnModuleInit() {
       console.log("Config Module Inited")
    }

    async findOne(): Promise<any> {
        const user = await this.buildModel.findOne({}).exec();
        if (!user) {
            throw new NotFoundException(`buildModel not found`);
        }
        return user;
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.buildModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: { ...updateClientDto } },
            { new: true, upsert: true }
        ).exec();
        if (!updatedUser) {
            throw new NotFoundException(`buildModel not found`);
        }
        return updatedUser;
    }

}
