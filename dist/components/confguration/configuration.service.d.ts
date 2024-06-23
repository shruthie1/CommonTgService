import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
export declare class ConfigurationService {
    private configurationModel;
    constructor(configurationModel: Model<Configuration>);
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}
