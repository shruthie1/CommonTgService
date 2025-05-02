import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { BotConfig } from '../../utils/TelegramBots.config';

@Injectable()
export class ConfigurationService {
    constructor(@InjectModel('configurationModule') private configurationModel: Model<Configuration>) {
        this.setEnv().then(async () => {
            await BotConfig.getInstance().ready();
            fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Started :: ${process.env.clientId}`)}`);
        });

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
        const data = { ...configuration }
        for (const key in data) {
            console.log('setting', key)
            process.env[key] = data[key];
        }
        console.log("finished setting env");
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
