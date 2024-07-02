import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';

@Injectable()
export class UpiIdService {
    private upiIds;
    constructor(@InjectModel('UpiIdModule') private UpiIdModel: Model<UpiId>) {
    }

    async OnModuleInit() {
        console.log("Config Module Inited")
    }

    async findOne(): Promise<any> {
        if (this.upiIds) {
            return this.upiIds
        } else {
            const upiIds = await this.UpiIdModel.findOne({}).exec();
            this.upiIds = upiIds;
            return upiIds
        }
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.UpiIdModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: { ...updateClientDto } },
            { new: true, upsert: true }
        ).exec();
        if (!updatedUser) {
            throw new NotFoundException(`UpiIdModel not found`);
        }
        return updatedUser;
    }

}
