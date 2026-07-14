import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { DailyAnalyticsService, DailyMetric } from './daily-analytics.service';

const METRICS: DailyMetric[] = ['promote', 'reaction', 'user'];

function parseDays(days?: string): number {
  const n = Number(days);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 60) : 14;
}

function parseMetric(metric?: string): DailyMetric {
  return METRICS.includes(metric as DailyMetric) ? (metric as DailyMetric) : 'promote';
}

@ApiTags('daily-analytics')
@Controller('daily-analytics')
export class DailyAnalyticsController {
  constructor(private readonly service: DailyAnalyticsService) {}

  /** Combined dashboard overview: fleet daily totals for promote + reaction + user metrics. */
  @Get('overview')
  @ApiQuery({ name: 'days', required: false })
  async overview(@Query('days') days?: string) {
    return this.service.overview(parseDays(days));
  }

  /** Per-day fleet totals for one metric (promote|reaction|user), gap-filled. */
  @Get(':metric/daily')
  @ApiParam({ name: 'metric', enum: METRICS })
  @ApiQuery({ name: 'days', required: false })
  async daily(@Param('metric') metric: string, @Query('days') days?: string) {
    return this.service.dailyTotals(parseMetric(metric), parseDays(days));
  }

  /** Per-client totals for one metric over the window (leaderboard/table). */
  @Get(':metric/by-client')
  @ApiParam({ name: 'metric', enum: METRICS })
  @ApiQuery({ name: 'days', required: false })
  async byClient(@Param('metric') metric: string, @Query('days') days?: string) {
    return this.service.byClient(parseMetric(metric), parseDays(days));
  }

  /** Raw daily rows for one metric, optionally filtered to a single client. */
  @Get(':metric/rows')
  @ApiParam({ name: 'metric', enum: METRICS })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  async rows(
    @Param('metric') metric: string,
    @Query('days') days?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.service.rows(parseMetric(metric), parseDays(days), clientId);
  }
}
