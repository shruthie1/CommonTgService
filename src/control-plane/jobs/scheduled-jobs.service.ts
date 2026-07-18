import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import mongoose from 'mongoose';
import * as schedule from 'node-schedule-tz';
import {
  ActiveChannelsService,
  ClientService,
  Stat1Service,
  Stat2Service,
  UserDataService,
} from '../../components';
import { fetchWithTimeout, ppplbot } from '../../utils';
import { AppService } from '../../app.service';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { AccountMaintenanceService } from '../maintenance/account-maintenance.service';

const IST = 'Asia/Kolkata';

@Injectable()
export class ScheduledJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly jobs: Array<{ cancel: () => unknown }> = [];
  private readonly startupTimers: NodeJS.Timeout[] = [];
  private readonly owner = `${process.env.HOSTNAME || 'control-plane'}:${process.pid}`;

  constructor(
    private readonly config: RuntimeConfigService,
    private readonly appService: AppService,
    private readonly maintenance: AccountMaintenanceService,
    private readonly clientService: ClientService,
    private readonly activeChannelsService: ActiveChannelsService,
    private readonly userDataService: UserDataService,
    private readonly stat1Service: Stat1Service,
    private readonly stat2Service: Stat2Service,
  ) {}

  onModuleInit(): void {
    this.registerCmsJobs();
    this.registerMaintenanceJobs();
  }

  onModuleDestroy(): void {
    for (const job of this.jobs) job.cancel();
    for (const timer of this.startupTimers) clearTimeout(timer);
  }

  private register(
    name: string,
    cron: string,
    task: () => Promise<void>,
  ): void {
    const job = schedule.scheduleJob(name, cron, IST, async () => {
      try {
        this.logger.log(`Starting scheduled job: ${name}`);
        await task();
        this.logger.log(`Completed scheduled job: ${name}`);
      } catch (error) {
        this.logger.error(
          `Scheduled job failed: ${name}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    });
    if (!job) throw new Error(`Unable to register scheduled job ${name}`);
    this.jobs.push(job);
  }

  private registerCmsJobs(): void {
    if (!this.config.enabled('CMS_SCHEDULER')) return;

    this.register('cms-buffer-check', '25 2 * * *', () =>
      this.appService.checkBufferClients(),
    );
    this.register('cms-buffer-join', '0 */3 * * *', () =>
      this.appService.joinBufferClients(),
    );
    this.register('cms-buffer-info-refresh', '25 0 * * *', async () => {
      // Original CMS used the UTC calendar day with an IST schedule.
      if (new Date().getUTCDate() % 5 === 0)
        await this.appService.updateBufferClientInfo();
    });
    if (!this.enabled('LOCAL_SERVER')) {
      this.afterStartup(60_000, () => this.appService.joinBufferClients());
    }
  }

  private registerMaintenanceJobs(): void {
    if (!this.config.enabled('UMS_TEST_SCHEDULER')) return;

    this.register('maintenance-refresh-map-and-stat1', '0 * * * *', async () => {
      await this.clientService.refreshMap();
      await this.stat1Service.deleteAll();
    });
    this.register('maintenance-process-users', '0 */3 * * *', async () => {
      await this.maintenance.processEligibleUsers(400, 0);
    });
    this.register('maintenance-promote-client-check', '35 16 * * *', () =>
      this.maintenance.checkPromoteClients(),
    );
    this.register(
      'maintenance-active-channel-word-restrictions',
      '25 0 * * *',
      async () => {
        // Original UMS-test evaluated UTC day, despite using an IST schedule.
        if (new Date().getUTCDate() % 9 !== 0) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
        await this.activeChannelsService.resetWordRestrictions();
      },
    );
    this.register('maintenance-daily-promote-stats-reset', '25 0 * * *', () =>
      this.runDailyPromoteReset(),
    );
    this.register(
      'maintenance-daily-promote-stats-reset-recovery',
      '30,45 0 * * *',
      () => this.runDailyPromoteReset(),
    );
    if (this.isDailyResetRecoveryWindow()) {
      this.afterStartup(15_000, () => this.runDailyPromoteReset());
    }
    this.afterStartup(120_000, () =>
      this.maintenance.processEligibleUsers(400, 0),
    );
  }

  private afterStartup(delayMs: number, task: () => Promise<unknown>): void {
    const timer = setTimeout(() => {
      task().catch((error) =>
        this.logger.error(
          'Startup task failed',
          error instanceof Error ? error.stack : String(error),
        ),
      );
    }, delayMs);
    this.startupTimers.push(timer);
  }

  private enabled(name: string): boolean {
    return ['1', 'true', 'yes', 'on'].includes(
      (process.env[name] || '').trim().toLowerCase(),
    );
  }

  private istDateKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: IST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replace(/\//g, '-');
  }

  private isDailyResetRecoveryWindow(): boolean {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value || 0);
    const minutes = value('hour') * 60 + value('minute');
    return minutes >= 25 && minutes < 60;
  }

  private async runDailyPromoteReset(): Promise<void> {
    const db = mongoose.connection.db;
    if (!db)
      throw new Error(
        'Mongo connection is unavailable for the daily promoteStats reset',
      );

    const jobId = `daily-promote-stats-reset:${this.istDateKey()}`;
    if (
      !(await this.claimJob(db.collection<any>('controlPlaneJobRuns'), jobId))
    ) {
      this.logger.warn(
        `Daily promoteStats reset already claimed or completed: ${jobId}`,
      );
      return;
    }

    let notification = '';
    try {
      const stats = await db
        .collection<any>('promoteStats')
        .find(
          {},
          { projection: { client: 1, totalCount: 1, lastUpdatedTimeStamp: 1 } },
        )
        .toArray();
      notification = stats
        .map(
          (stat) =>
            `${String(stat.client || 'unknown').toUpperCase()}: ${stat.totalCount || 0}`,
        )
        .join('\n');
      const result = await this.resetPromoteStatsWithRetries(
        db.collection<any>('promoteStats'),
      );
      await db.collection<any>('controlPlaneJobRuns').updateOne(
        { _id: jobId },
        {
          $set: {
            completedAt: new Date(),
            resetMatchedCount: result.matchedCount,
            resetModifiedCount: result.modifiedCount,
          },
          $unset: { leaseOwner: '', leaseExpiresAt: '' },
        },
      );
    } catch (error) {
      await db.collection<any>('controlPlaneJobRuns').updateOne(
        { _id: jobId },
        {
          $set: {
            failedAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
            // An expired lease permits a safe manual/restart retry for this day.
            leaseExpiresAt: new Date(0),
          },
          $unset: { leaseOwner: '' },
        },
      );
      throw error;
    }

    try {
      await fetchWithTimeout(
        `${ppplbot()}&text=${encodeURIComponent(notification)}`,
      );
    } catch (error) {
      this.logger.error(
        'Daily promoteStats reset completed, but its notification failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async resetPromoteStatsWithRetries(
    promoteStats: any,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.userDataService.resetPaidUsers();
        await this.stat1Service.deleteAll();
        await this.stat2Service.deleteAll();
        const now = Date.now();
        return await promoteStats.updateMany(
          {},
          {
            $set: {
              totalCount: 0,
              uniqueChannels: 0,
              releaseDay: now,
              lastUpdatedTimeStamp: now,
              data: {},
            },
          },
        );
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Daily promoteStats reset attempt ${attempt}/3 failed`,
        );
        if (attempt < 3)
          await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async claimJob(collection: any, jobId: string): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const claimed = await collection.updateOne(
      {
        _id: jobId,
        completedAt: { $exists: false },
        $or: [
          { leaseExpiresAt: { $lt: now } },
          { leaseExpiresAt: { $exists: false } },
        ],
      },
      { $set: { leaseOwner: this.owner, leaseExpiresAt, startedAt: now } },
    );
    if (claimed.modifiedCount === 1) return true;

    try {
      await collection.insertOne({
        _id: jobId,
        leaseOwner: this.owner,
        leaseExpiresAt,
        startedAt: now,
      });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }
}
