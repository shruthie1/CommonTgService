import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatService } from './stat.service';
import { StatController } from './stat.controller';
import { Stat, StatSchema } from './stat.schema';

@Module({
    imports: [MongooseModule.forFeature([{ name: "StatsModule", collection: "stats", schema: StatSchema }])],
    controllers: [StatController],
    providers: [StatService],
})
export class StatModule { }
