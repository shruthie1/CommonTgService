import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';

@Injectable()
export class UpiIdService {
    private upiIds = {}
    constructor(@InjectModel('UpiIdModule') private UpiIdModel: Model<UpiId>) {
        this.UpiIdModel.findOne({}).exec().then((data) => {
            this.upiIds = data
        })
        setInterval(async () => {
            await this.refreshUPIs()
        }, 5 * 60 * 1000);
    }

    async OnModuleInit() {
        console.log("Config Module Inited")
    }

    async refreshUPIs() {
        this.upiIds = await this.UpiIdModel.findOne({}).exec();
    }

    async findOne(): Promise<any> {
        if (Object.keys(this.upiIds).length > 0) {
            return this.upiIds
        }
        const result = await this.UpiIdModel.findOne({}).exec();
        this.upiIds = result
        return result
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.UpiIdModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: { ...updateClientDto } },
            { new: true, upsert: true }
        ).exec();
        this.upiIds = updatedUser
        if (!updatedUser) {
            throw new NotFoundException(`UpiIdModel not found`);
        }
        return updatedUser;
    }

}
