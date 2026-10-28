import { Module } from '@nestjs/common';
import { RedisClient } from '../../utils/redisClient';
import { AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { MonitorController } from './monitor.controller';
import { MONITOR_REDIS, MonitorRedis, MonitorService } from './monitor.service';

/**
 * Read-only monitoring API (GET /monitor/fleet, /monitor/client/:clientId, /monitor/live).
 * Postgres via its own AnalyticsPgReader (pool max 2, 10 s timeouts); Mongo via the default
 * connection (aggregate/find only); Redis via the shared RedisClient (SMEMBERS + MGET only).
 */
@Module({
  controllers: [MonitorController],
  providers: [
    MonitorService,
    AnalyticsPgReader,
    {
      provide: MONITOR_REDIS,
      useFactory: (): MonitorRedis => ({
        smembers: (key) => RedisClient.getClient().smembers(key),
        mget: (keys) => RedisClient.getClient().mget(keys),
      }),
    },
  ],
})
export class MonitorModule {}
