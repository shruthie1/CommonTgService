import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import axios from 'axios';
import { areJsonsNotSame } from '../../utils';
import { NpointService } from '../n-point/npoint.service';

@Injectable()
export class UpiIdService implements OnModuleDestroy, OnModuleInit {
    private checkInterval: NodeJS.Timeout | null = null;
    private upiIds = {}
    constructor(@InjectModel('UpiIdModule') private UpiIdModel: Model<UpiId>,
        private npointSerive: NpointService
    ) {
        this.findOne().then(() => {
            this.checkInterval = setInterval(async () => {
                await this.refreshUPIs();
                await this.checkNpoint();
            }, 5 * 60000);
        });
    }
    onModuleDestroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
    onModuleInit() {
        console.log("UPI ID Service Initialized");
    }

    async refreshUPIs() {
        console.log("Refreshing UPIs");
        const result = await this.UpiIdModel.findOne({}).lean().exec();
        if (result) {
            this.upiIds = result;
        }
    }

    async checkNpoint() {
        // const upiIds = (await axios.get('https://api.npoint.io/54baf762fd873c55c6b1')).data;
        // const existingUpiIds = await this.findOne();
        // if (areJsonsNotSame(upiIds, existingUpiIds)) {
        //     await this.npointSerive.updateDocument("54baf762fd873c55c6b1", existingUpiIds)
        // }
    }

    async findOne(): Promise<any> {
        if (Object.keys(this.upiIds).length > 0) {
            return this.upiIds;
        }
        const result = await this.UpiIdModel.findOne({}).lean().exec();
        if (!result) return null;

        this.upiIds = result;
        console.log("Refreshed UPIs");
        return result;
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.UpiIdModel.findOneAndUpdate(
            {},
            { $set: { ...updateClientDto } },
            { new: true, upsert: true, lean: true }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`UpiIdModel not found`);
        }

        this.upiIds = updatedUser;
        console.log("Refreshed UPIs")
        return updatedUser;
    }

}
