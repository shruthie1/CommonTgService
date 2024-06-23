import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
export declare class ConfigurationService {
    private configurationModel;
    constructor(configurationModel: Model<Configuration>);
    OnModuleInit(): Promise<void>;
    findOne(): Promise<any>;
    setEnv(): Promise<void>;
    update(updateClientDto: any): Promise<any>;
}
