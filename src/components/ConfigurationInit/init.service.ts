import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
import { CloudinaryService } from '../../cloudinary';

@Injectable()
export class ConfigurationService {
    constructor(@InjectModel('configurationModule') private configurationModel: Model<Configuration>) {
        this.setEnv()
     }

    async OnModuleInit() {
       console.log("Config Module Inited")
    }

    async findOne(): Promise<any> {
        const user = await this.configurationModel.findOne({}).exec();
        if (!user) {
            throw new NotFoundException(`configurationModel not found`);
        }
        return user;
    }

    async setEnv() {
        console.log("Setting Envs");
        const configuration: Configuration = await this.configurationModel.findOne({}, { _id: 0 });
        const data = {...configuration}
        for (const key in data) {
            console.log('setting', key)
            process.env[key] = data[key];
        }
        console.log("finished setting env");
        await CloudinaryService.getInstance("divya");
    }

    async update(updateClientDto: any): Promise<any> {
        delete updateClientDto['_id']
        const updatedUser = await this.configurationModel.findOneAndUpdate(
            {}, // Assuming you want to update the first document found in the collection
            { $set: { ...updateClientDto } },
            { new: true, upsert: true }
        ).exec();
        if (!updatedUser) {
            throw new NotFoundException(`configurationModel not found`);
        }
        return updatedUser;
    }

}
