import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DailyAnalyticsService } from './daily-analytics.service';
import { DailyAnalyticsController } from './daily-analytics.controller';
import {
  PromoteStatDaily,
  PromoteStatDailySchema,
  ReactionStatDaily,
  ReactionStatDailySchema,
  UserStatDaily,
  UserStatDailySchema,
} from './schemas/daily-analytics.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoteStatDaily.name, schema: PromoteStatDailySchema },
      { name: ReactionStatDaily.name, schema: ReactionStatDailySchema },
      { name: UserStatDaily.name, schema: UserStatDailySchema },
    ]),
  ],
  controllers: [DailyAnalyticsController],
  providers: [DailyAnalyticsService],
  exports: [DailyAnalyticsService],
})
export class DailyAnalyticsModule {}
