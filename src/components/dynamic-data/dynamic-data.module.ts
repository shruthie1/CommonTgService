import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DynamicDataController } from './dynamic-data.controller';
import { DynamicDataService } from './dynamic-data.service';
import { DynamicData, DynamicDataSchema } from './dynamic-data.schema';
import { NpointModule } from '../n-point';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DynamicData.name, schema: DynamicDataSchema },
    ]),
    NpointModule,
  ],
  controllers: [DynamicDataController],
  providers: [DynamicDataService],
  exports: [DynamicDataService],
})
export class DynamicDataModule {}
