import { Module } from '@nestjs/common';
import { RedisClient } from '../../utils/redisClient';
import { AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { MonitorController } from './monitor.controller';
import { MONITOR_REDIS, MonitorRedis, MonitorService } from './monitor.service';

/**
 * Read-only monitoring API (GET /monitor/fleet, /monitor/client/:clientId, /monitor/live).
 * Postgres via its own AnalyticsPgReader (pool max 2, 10 s timeouts); Mongo via the default
 * connection (aggregate/find only); Redis via the shared RedisClient (SMEMBERS + MGET for live; GET/SET
 * only on its own monitor::snapshot::<page> keys; one HGETALL/HLEN/ZCARD pipeline per promotions build).
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
        // only the monitor's own monitor::snapshot::<page> keys (last page snapshots, TTL 36 h)
        get: (key) => RedisClient.getClient().get(key),
        set: (key, value, mode, ttlSec) => RedisClient.getClient().set(key, value, mode, ttlSec),
        // read-only batch for /monitor/promotions: HGETALL tg::acct::<mobile>, HLEN/ZCARD promote::route*::<mobile>
        readPipeline: async (cmds) => {
          const results = await RedisClient.getClient()
            .pipeline(cmds.map(([cmd, key]) => [cmd, key]))
            .exec();
          return (results ?? []).map(([err, value]) => (err ? null : value));
        },
      }),
    },
  ],
})
export class MonitorModule {}
