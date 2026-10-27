import { Module } from '@nestjs/common';
import { DailyAnalyticsService } from './daily-analytics.service';
import { AnalyticsPgReader } from './analytics-pg.reader';
import { AnalyticsHealthCheck } from './analytics-health.check';
import { DailyAnalyticsController } from './daily-analytics.controller';

/** Daily analytics are read only from Postgres (daily_client, daily_mobile, payment_event_owner); no Mongo models. */
@Module({
  controllers: [DailyAnalyticsController],
  providers: [DailyAnalyticsService, AnalyticsPgReader, AnalyticsHealthCheck],
  exports: [DailyAnalyticsService, AnalyticsHealthCheck],
})
export class DailyAnalyticsModule {}
