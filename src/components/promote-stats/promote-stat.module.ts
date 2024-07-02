import { initModule } from './../ConfigurationInit/init.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoteStatService } from './promote-stat.service';
import { PromoteStatController } from './promote-stat.controller';
import { PromoteStat, PromoteStatSchema } from './schemas/promote-stat.schema';

@Module({
  imports: [initModule,
    MongooseModule.forFeature([{ name: PromoteStat.name, schema: PromoteStatSchema }])],
  controllers: [PromoteStatController],
  providers: [PromoteStatService],
  exports: [PromoteStatService]
})
export class PromoteStatModule { }
