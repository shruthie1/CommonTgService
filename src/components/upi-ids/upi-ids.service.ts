import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import axios from 'axios';
import { areJsonsNotSame, mapToJson } from '../../utils';
import { NpointService } from '../n-point/npoint.service';

@Injectable()
export class UpiIdService {
    private upiIds = {}
    constructor(@InjectModel('UpiIdModule') private UpiIdModel: Model<UpiId>,
        private npointSerive: NpointService
    ) {
        this.UpiIdModel.findOne({}).exec().then((data) => {
            this.upiIds = data;
            console.log("Refreshed UPIs")
        })
        setInterval(async () => {
            await this.refreshUPIs();
            await this.checkNpoint();
        }, 5 * 60 * 1000);
    }

    async OnModuleInit() {
        console.log("Config Module Inited")
    }

    async refreshUPIs() {
        console.log("Refreshed UPIs")
        this.upiIds = await this.UpiIdModel.findOne({}).exec();
    }

    async checkNpoint() {
        const upiIds = (await axios.get('https://api.npoint.io/54baf762fd873c55c6b1')).data;
        const existingUpiIds = await this.findOne();
        if (areJsonsNotSame(upiIds, existingUpiIds)) {
            await this.npointSerive.updateDocument("54baf762fd873c55c6b1", this.upiIds)
        }
    }

    async findOne(): Promise<any> {
        if (Object.keys(this.upiIds).length > 0) {
            return this.upiIds
        }
        const result = await this.UpiIdModel.findOne({}).exec();
        this.upiIds = result
        console.log("Refreshed UPIs")
        return result
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.UpiIdModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: { ...updateClientDto } },
            { new: true, upsert: true }
        ).exec();
        this.upiIds = updatedUser;
        console.log("Refreshed UPIs")
        if (!updatedUser) {
            throw new NotFoundException(`UpiIdModel not found`);
        }
        return updatedUser;
    }

}
