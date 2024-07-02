import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatService } from './stat.service';
import { StatController } from './stat.controller';
import { StatSchema } from './stat.schema';
import { initModule } from '../ConfigurationInit/init.module';

@Module({
    imports: [
        initModule,
        MongooseModule.forFeature([{ name: "StatsModule", collection: "stats", schema: StatSchema }])],
    controllers: [StatController],
    providers: [StatService],
})
export class StatModule { }
