import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatService } from './stat.service';
import { StatController } from './stat.controller';
import { StatSchema } from './stat.schema';
import { InitModule } from '../ConfigurationInit/init.module';

@Module({
    imports: [
        InitModule,
        MongooseModule.forFeature([{ name: "StatsModule", collection: "stats", schema: StatSchema }])],
    controllers: [StatController],
    providers: [StatService],
    exports:[StatService]
})
export class StatModule { }
