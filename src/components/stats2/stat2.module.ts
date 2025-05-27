import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Stat2Service } from './stat2.service';
import { Stat2Controller } from './stat2.controller';
import { StatSchema } from './stat2.schema';
import { InitModule } from '../ConfigurationInit/init.module';

@Module({
    imports: [
        InitModule,
        MongooseModule.forFeature([{ name: "Stats2Module", collection: "stats2", schema: StatSchema }])],
    controllers: [Stat2Controller],
    providers: [Stat2Service],
    exports: [Stat2Service]
})
export class Stat2Module { }
