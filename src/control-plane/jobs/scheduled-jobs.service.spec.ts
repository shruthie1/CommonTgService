jest.mock('node-schedule-tz', () => ({
  scheduleJob: jest.fn(() => ({ cancel: jest.fn() })),
}));

jest.mock('../../utils/bot-notice', () => ({
  sendBotNotice: jest.fn().mockResolvedValue({ sent: true }),
}));

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  fetchWithTimeout: jest.fn().mockResolvedValue({ data: { ok: true } }),
}));

import * as schedule from 'node-schedule-tz';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fetchWithTimeout } from '../../utils';
import { sendBotNotice } from '../../utils/bot-notice';
import { ScheduledJobsService } from './scheduled-jobs.service';

const scheduleJob = schedule.scheduleJob as jest.Mock;

describe('ScheduledJobsService scheduler ownership', () => {
  const originalLocalServer = process.env.LOCAL_SERVER;

  beforeEach(() => {
    process.env.LOCAL_SERVER = 'true';
    scheduleJob.mockClear();
    (fetchWithTimeout as jest.Mock).mockClear();
    (sendBotNotice as jest.Mock).mockClear();
  });

  afterAll(() => {
    if (originalLocalServer === undefined) delete process.env.LOCAL_SERVER;
    else process.env.LOCAL_SERVER = originalLocalServer;
  });

  const analyticsHealth = { run: jest.fn().mockResolvedValue([]) };

  function createService(
    enabled: string[],
    connection: { db?: unknown } = { db: {} },
  ): ScheduledJobsService {
    const config = {
      enabled: jest.fn((name: string) => enabled.includes(name)),
      activeSchedulers: jest.fn(() => enabled),
    };
    return new ScheduledJobsService(
      config as any,
      { checkBufferClients: jest.fn(), rotateReadyBufferClients: jest.fn(), joinBufferClients: jest.fn(), updateBufferClientInfo: jest.fn() } as any,
      {
        checkPromoteClients: jest.fn(),
        rotateReadyPromoteClients: jest.fn(),
        preparePromoteClientJoin: jest.fn(),
        refreshPromoteClientInfo: jest.fn(),
        processEligibleUsers: jest.fn(),
      } as any,
      { refreshMap: jest.fn() } as any,
      { resetMessageDeletionCounters: jest.fn() } as any,
      { deleteAll: jest.fn() } as any,
      connection as any,
      analyticsHealth as any,
    );
  }

  function jobNames(): string[] {
    return scheduleJob.mock.calls.map(([name]) => name);
  }

  it('registers the daily analytics health check at 02:30 IST only for CMS, and it runs the check', async () => {
    createService(['UMS_SCHEDULER']).onModuleInit();
    createService(['UMS_TEST_SCHEDULER']).onModuleInit();
    expect(jobNames()).not.toContain('cms-analytics-health');

    createService(['CMS_SCHEDULER']).onModuleInit();
    expect(scheduleJob).toHaveBeenCalledWith('cms-analytics-health', '30 2 * * *', 'Asia/Kolkata', expect.any(Function));
  });

  it('analytics health: two CMS-scheduler processes on one Mongo send ONE check per IST day (run-claim)', async () => {
    jest.setTimeout(60_000);
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-analytics-health-test' })
      .asPromise();
    try {
      analyticsHealth.run.mockClear();
      analyticsHealth.run.mockResolvedValue(['daily_client has 0 rows']);
      const cms = createService(['CMS_SCHEDULER'], connection);
      const ums = createService(['CMS_SCHEDULER'], connection);
      cms.onModuleInit();
      ums.onModuleInit();
      const callbacks = scheduleJob.mock.calls.filter(([name]) => name === 'cms-analytics-health').map((c) => c[3]);
      expect(callbacks).toHaveLength(2);
      await Promise.all(callbacks.map((cb) => cb()));
      await callbacks[0](); // a later re-fire the same day
      expect(analyticsHealth.run).toHaveBeenCalledTimes(1);
      const runs = (await connection.db.collection('controlPlaneJobRuns').find({}).toArray())
        .filter((run) => String(run._id).startsWith('analytics-health:'));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(expect.objectContaining({ completedAt: expect.any(Date), problems: ['daily_client has 0 rows'] }));
    } finally {
      analyticsHealth.run.mockResolvedValue([]);
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('analytics health: a failed run expires its lease so a later fire the same day retries', async () => {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-analytics-health-retry' })
      .asPromise();
    try {
      analyticsHealth.run.mockClear();
      analyticsHealth.run.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
      const service = createService(['CMS_SCHEDULER'], connection);
      await expect((service as any).runAnalyticsHealth()).rejects.toThrow('boom');
      await (service as any).runAnalyticsHealth();
      expect(analyticsHealth.run).toHaveBeenCalledTimes(2);
    } finally {
      analyticsHealth.run.mockResolvedValue([]);
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('registers buffer work, including one ready rotation per hour, only for CMS', () => {
    const service = createService(['CMS_SCHEDULER']);
    service.onModuleInit();

    expect(jobNames()).toEqual(expect.arrayContaining([
      'cms-buffer-check',
      'cms-buffer-ready-rotation',
      'cms-buffer-join',
    ]));
    expect(scheduleJob).toHaveBeenCalledWith(
      'cms-buffer-ready-rotation',
      '45 * * * *',
      'Asia/Kolkata',
      expect.any(Function),
    );
    expect(jobNames()).not.toContain('maintenance-promote-ready-rotation');
    service.onModuleDestroy();
  });

  it('registers all promote lifecycle work, including an hourly ready rotation, only for UMS', async () => {
    const service = createService(['UMS_SCHEDULER']);
    service.onModuleInit();

    expect(jobNames()).toEqual(expect.arrayContaining([
      'maintenance-promote-client-check',
      'maintenance-promote-client-join',
      'maintenance-promote-info-refresh',
      'maintenance-promote-ready-rotation',
      'maintenance-daily-promote-stats-reset',
      'maintenance-daily-promote-stats-reset-recovery',
    ]));
    expect(scheduleJob).toHaveBeenCalledWith(
      'maintenance-promote-ready-rotation',
      '55 * * * *',
      'Asia/Kolkata',
      expect.any(Function),
    );
    const rotationCallback = scheduleJob.mock.calls.find(
      ([name]) => name === 'maintenance-promote-ready-rotation',
    )?.[3] as (() => Promise<void>) | undefined;
    expect(rotationCallback).toBeDefined();
    await rotationCallback!();
    await rotationCallback!();
    expect((service as any).maintenance.rotateReadyPromoteClients).toHaveBeenCalledTimes(2);
    expect(jobNames()).not.toContain('cms-buffer-ready-rotation');
    expect(jobNames()).not.toContain('maintenance-process-users');
    expect(jobNames()).not.toContain('maintenance-refresh-map-and-stat1');
    service.onModuleDestroy();
  });

  it('registers raw-user processing and general maintenance only for UMS-test', () => {
    const service = createService(['UMS_TEST_SCHEDULER']);
    service.onModuleInit();

    expect(jobNames()).toEqual(expect.arrayContaining([
      'maintenance-process-users',
      'maintenance-refresh-map-and-stat1',
      'maintenance-active-channel-message-deletion-counters',
      'maintenance-daily-user-stats-reset',
      'maintenance-daily-user-stats-reset-recovery',
    ]));
    expect(jobNames()).not.toContain('maintenance-promote-client-check');
    expect(jobNames()).not.toContain('maintenance-promote-client-join');
    expect(jobNames()).not.toContain('maintenance-promote-info-refresh');
    expect(jobNames()).not.toContain('maintenance-promote-ready-rotation');
    expect(jobNames()).not.toContain('maintenance-daily-promote-stats-reset');
    expect(jobNames()).not.toContain('cms-buffer-ready-rotation');
    service.onModuleDestroy();
  });

  it('does not re-run raw-user processing after a restart; only the 3-hourly cron runs it', () => {
    jest.useFakeTimers();
    try {
      const service = createService(['UMS_TEST_SCHEDULER']);
      service.onModuleInit();
      jest.advanceTimersByTime(10 * 60_000);

      expect((service as any).maintenance.processEligibleUsers).not.toHaveBeenCalled();
      service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the injected Nest connection for the legacy daily stats2 and paid-user reset', async () => {
    const stats2 = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 12 }),
    };
    const userData = {
      updateMany: jest.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 3 }),
    };
    const controlPlaneJobRuns = {
      updateOne: jest
        .fn()
        .mockResolvedValueOnce({ modifiedCount: 0 })
        .mockResolvedValueOnce({ modifiedCount: 1 }),
      insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'stats2') return stats2;
        if (name === 'userData') return userData;
        if (name === 'controlPlaneJobRuns') return controlPlaneJobRuns;
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };
    const service = createService(['UMS_TEST_SCHEDULER'], { db });

    await (service as any).runDailyUserStatsReset();

    expect(stats2.deleteMany).toHaveBeenCalledWith({});
    expect(userData.updateMany).toHaveBeenCalledWith(
      { payAmount: { $gt: 10 }, totalCount: { $gt: 30 } },
      {
        $set: expect.objectContaining({ totalCount: 10, windowCount: 1, paidReply: true }),
      },
    );
    expect(controlPlaneJobRuns.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.stringMatching(/^daily-user-stats-reset:/),
      }),
    );
  });

  it('uses the injected Nest connection for the complete legacy promoteStats reset', async () => {
    const updateMany = jest.fn().mockResolvedValue({ matchedCount: 20, modifiedCount: 20 });
    const promoteStats = {
      find: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ client: 'ums', totalCount: 7 }]),
      })),
      updateMany,
    };
    const controlPlaneJobRuns = {
      updateOne: jest
        .fn()
        .mockResolvedValueOnce({ modifiedCount: 0 })
        .mockResolvedValueOnce({ modifiedCount: 1 }),
      insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'promoteStats') return promoteStats;
        if (name === 'controlPlaneJobRuns') return controlPlaneJobRuns;
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };
    const service = createService(['UMS_SCHEDULER'], { db });

    await (service as any).runDailyPromoteReset();

    expect(db.collection).toHaveBeenCalledWith('controlPlaneJobRuns');
    expect(db.collection).toHaveBeenCalledWith('promoteStats');
    expect(updateMany).toHaveBeenCalledWith(
      {},
      {
        $set: expect.objectContaining({
          totalCount: 0,
          uniqueChannels: 0,
          data: {},
        }),
      },
    );
    expect(controlPlaneJobRuns.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.stringMatching(/^daily-promote-stats-reset:/),
      }),
    );
    expect(sendBotNotice).toHaveBeenCalledTimes(1);
    const [target, notice] = (sendBotNotice as jest.Mock).mock.calls[0];
    expect(target).toBe('pppl');
    expect(notice.title).toBe('Daily reset');
    expect(notice.tables[0].columns).toEqual(['Client', 'Promotions']);
    expect(notice.tables[0].rows).toEqual([['UMS', 7]]);
    expect(notice.tables[0].numeric).toEqual([1]);
  });

  it('executes the reset through a real Mongoose Connection.db', async () => {
    jest.setTimeout(60_000);
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-test' })
      .asPromise();

    try {
      await connection.db.collection('promoteStats').insertMany([
        { client: 'ums', totalCount: 7, uniqueChannels: 4, data: { channel: 1 } },
        { client: 'ums-test', totalCount: 2, uniqueChannels: 1, data: { channel: 1 } },
      ]);
      const service = createService(['UMS_SCHEDULER'], connection);

      await (service as any).runDailyPromoteReset();

      const stats = await connection.db.collection('promoteStats').find({}).toArray();
      expect(stats).toHaveLength(2);
      expect(stats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ totalCount: 0, uniqueChannels: 0, data: {} }),
        expect.objectContaining({ totalCount: 0, uniqueChannels: 0, data: {} }),
        ]),
      );
      const runs = (await connection.db
        .collection('controlPlaneJobRuns')
        .find({})
        .toArray()).filter((run) =>
        String(run._id).startsWith('daily-promote-stats-reset:'),
      );
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(expect.objectContaining({ completedAt: expect.any(Date) }));
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('clears stats2 and applies the paid-user reset through a real Mongoose Connection.db', async () => {
    jest.setTimeout(60_000);
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-user-stats-test' })
      .asPromise();

    try {
      await connection.db.collection('stats2').insertMany([
        { client: 'a', chatId: '1' },
        { client: 'b', chatId: '2' },
      ]);
      await connection.db.collection('userData').insertMany([
        { profile: 'p1', chatId: '1', payAmount: 11, totalCount: 31, paidReply: false },
        { profile: 'p2', chatId: '2', payAmount: 10, totalCount: 99, paidReply: false },
      ]);
      const service = createService(['UMS_TEST_SCHEDULER'], connection);

      await (service as any).runDailyUserStatsReset();

      expect(await connection.db.collection('stats2').countDocuments()).toBe(0);
      expect(await connection.db.collection('userData').findOne({ profile: 'p1' }))
        .toEqual(expect.objectContaining({ totalCount: 10, windowCount: 1, paidReply: true }));
      expect(await connection.db.collection('userData').findOne({ profile: 'p2' }))
        .toEqual(expect.objectContaining({ totalCount: 99, paidReply: false }));
      const runs = (await connection.db.collection('controlPlaneJobRuns').find({}).toArray())
        .filter((run) => String(run._id).startsWith('daily-user-stats-reset:'));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(expect.objectContaining({
        completedAt: expect.any(Date),
        stats2DeletedCount: 2,
        paidUsersModifiedCount: 1,
      }));
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });
});
