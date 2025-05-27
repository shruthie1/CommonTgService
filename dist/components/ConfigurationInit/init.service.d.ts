import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { Configuration } from './configuration.schema';
import { ConfigService } from '@nestjs/config';
export declare class ConfigurationService implements OnModuleInit {
    private configurationModel;
    private configService;
    private readonly logger;
    private static initialized;
    constructor(configurationModel: Model<Configuration>, configService: ConfigService);
    onModuleInit(): Promise<void>;
    private initializeConfiguration;
    private notifyStart;
    findOne(): Promise<Configuration>;
    setEnv(): Promise<void>;
    update(updateDto: Partial<Configuration>): Promise<Configuration>;
}
