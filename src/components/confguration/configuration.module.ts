import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';
import { ConfigurationSchema } from './configuration.schema';
import { initModule } from '../../init.module';

@Module({
    imports: [
        initModule,
        MongooseModule.forFeature([{
        name: 'configurationModule', collection: 'configuration', schema: ConfigurationSchema
    }])],
    controllers: [ConfigurationController],
    providers: [ConfigurationService],
})
export class ConfigurationModule { }
