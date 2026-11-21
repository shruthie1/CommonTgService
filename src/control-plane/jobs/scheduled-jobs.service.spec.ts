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

/** Today 00:00 IST, the stats2 reset cutoff (tg-aut's stats2 day key is the IST day). */
function istTodayStart(now: Date = new Date()): Date {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${key}T00:00:00+05:30`);
}

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

  const okHealth = { problems: [], suppressed: [], historyAlerts: {} };
  const analyticsHealth = { runWithState: jest.fn().mockResolvedValue(okHealth) };

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
      { run: jest.fn().mockResolvedValue({ status: 'skipped', reason: 'test' }) } as any, // PoolSnapshotWriter
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
      analyticsHealth.runWithState.mockClear();
      analyticsHealth.runWithState.mockResolvedValue({ ...okHealth, problems: ['daily_client has 0 rows'] });
      const cms = createService(['CMS_SCHEDULER'], connection);
      const ums = createService(['CMS_SCHEDULER'], connection);
      cms.onModuleInit();
      ums.onModuleInit();
      const callbacks = scheduleJob.mock.calls.filter(([name]) => name === 'cms-analytics-health').map((c) => c[3]);
      expect(callbacks).toHaveLength(2);
      await Promise.all(callbacks.map((cb) => cb()));
      await callbacks[0](); // a later re-fire the same day
      expect(analyticsHealth.runWithState).toHaveBeenCalledTimes(1);
      const runs = (await connection.db.collection('controlPlaneJobRuns').find({}).toArray())
        .filter((run) => String(run._id).startsWith('analytics-health:'));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(expect.objectContaining({ completedAt: expect.any(Date), problems: ['daily_client has 0 rows'] }));
    } finally {
      analyticsHealth.runWithState.mockResolvedValue(okHealth);
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('payment health: 09:00 IST, CMS only; two CMS-scheduler processes send ONE report per IST day (run-claim)', async () => {
    createService(['UMS_SCHEDULER']).onModuleInit();
    expect(jobNames()).not.toContain('cms-payment-health');
    scheduleJob.mockClear();
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-payment-health-test' })
      .asPromise();
    try {
      const paymentHealth = { runDaily: jest.fn().mockResolvedValue({ day: '2026-11-10', sent: true, summary: { missing: 0 } }) };
      const a = createService(['CMS_SCHEDULER'], connection);
      const b = createService(['CMS_SCHEDULER'], connection);
      (a as any).paymentHealth = paymentHealth;
      (b as any).paymentHealth = paymentHealth;
      a.onModuleInit();
      b.onModuleInit();
      expect(scheduleJob).toHaveBeenCalledWith('cms-payment-health', '0 9 * * *', 'Asia/Kolkata', expect.any(Function));
      const callbacks = scheduleJob.mock.calls.filter(([name]) => name === 'cms-payment-health').map((c) => c[3]);
      expect(callbacks).toHaveLength(2);
      await Promise.all(callbacks.map((cb) => cb()));
      await callbacks[0]();
      expect(paymentHealth.runDaily).toHaveBeenCalledTimes(1);
      const runs = (await connection.db.collection('controlPlaneJobRuns').find({}).toArray())
        .filter((run) => String(run._id).startsWith('payment-health:'));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual(expect.objectContaining({ completedAt: expect.any(Date), day: '2026-11-10', sent: true }));
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('payment health: no PaymentHealthService (optional dependency) = skipped, no claim, no throw', async () => {
    const svc = createService(['CMS_SCHEDULER']);
    svc.onModuleInit();
    const cb = scheduleJob.mock.calls.filter(([name]) => name === 'cms-payment-health').map((c) => c[3])[0];
    await expect(cb()).resolves.toBeUndefined();
  });

  it('DS-J01 degraded swap: swap maintenance every 30 min + daily summary, CMS only, run-claimed so two processes swap/alert ONCE per slot', async () => {
    createService(['UMS_SCHEDULER']).onModuleInit();
    expect(jobNames()).not.toContain('cms-swap-maintenance');
    expect(jobNames()).not.toContain('cms-degraded-summary');
    scheduleJob.mockClear();

    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-degraded-test' })
      .asPromise();
    try {
      const clientService = {
        runSwapMaintenance: jest.fn().mockResolvedValue({ rescue: [], upgrade: [{ clientId: 'sneha2', fromTier: 3, status: 'swapped' }], refill: [] }),
        sendDegradedSummary: jest.fn().mockResolvedValue({ degraded: 1, emptyPools: 0 }),
      };
      const a = createService(['CMS_SCHEDULER'], connection);
      const b = createService(['CMS_SCHEDULER'], connection);
      (a as any).clientService = clientService;
      (b as any).clientService = clientService;
      a.onModuleInit();
      b.onModuleInit();
      expect(scheduleJob).toHaveBeenCalledWith('cms-swap-maintenance', '7,37 * * * *', 'Asia/Kolkata', expect.any(Function));
      expect(scheduleJob).toHaveBeenCalledWith('cms-degraded-summary', '5 10 * * *', 'Asia/Kolkata', expect.any(Function));

      const upgrade = scheduleJob.mock.calls.filter(([name]) => name === 'cms-swap-maintenance').map((c) => c[3]);
      const summary = scheduleJob.mock.calls.filter(([name]) => name === 'cms-degraded-summary').map((c) => c[3]);
      await Promise.all(upgrade.map((cb) => cb()));
      await Promise.all(summary.map((cb) => cb()));
      expect(clientService.runSwapMaintenance).toHaveBeenCalledTimes(1);
      expect(clientService.sendDegradedSummary).toHaveBeenCalledTimes(1);

      const runs = await connection.db.collection('controlPlaneJobRuns').find({}).toArray();
      const upgradeRun = runs.find((r) => String(r._id).startsWith('swap-maintenance:'));
      expect(String(upgradeRun?._id)).toMatch(/^swap-maintenance:\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/);
      expect(upgradeRun).toEqual(expect.objectContaining({
        completedAt: expect.any(Date),
        results: { rescue: [], upgrade: [{ clientId: 'sneha2', fromTier: 3, status: 'swapped' }], refill: [] },
      }));
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('DS-J02 swap maintenance: the claim lasts 60 min (covers the worst-case run) and a slot is skipped while the previous slot still runs', async () => {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-swap-overlap' })
      .asPromise();
    try {
      scheduleJob.mockClear();
      const runs = connection.db.collection<any>('controlPlaneJobRuns');
      let claimTtlMs = 0;
      const clientService = {
        runSwapMaintenance: jest.fn(async () => {
          const doc = await runs.findOne({ _id: { $regex: '^swap-maintenance:' }, leaseOwner: { $exists: true } } as any);
          claimTtlMs = doc.leaseExpiresAt.getTime() - doc.startedAt.getTime();
          return { rescue: [], upgrade: [], refill: [] };
        }),
        sendDegradedSummary: jest.fn(),
      };
      const svc = createService(['CMS_SCHEDULER'], connection);
      (svc as any).clientService = clientService;
      svc.onModuleInit();
      const fire = scheduleJob.mock.calls.find(([name]) => name === 'cms-swap-maintenance')![3];
      const previous = `swap-maintenance:${(svc as any).halfHourSlotKey(new Date(Date.now() - 30 * 60 * 1000))}`;
      await runs.insertOne({ _id: previous, leaseOwner: 'other-host:1', leaseExpiresAt: new Date(Date.now() + 20 * 60 * 1000), startedAt: new Date() } as any);
      await fire();
      expect(clientService.runSwapMaintenance).not.toHaveBeenCalled();
      await runs.updateOne({ _id: previous } as any, { $set: { completedAt: new Date() }, $unset: { leaseOwner: '', leaseExpiresAt: '' } });
      await fire();
      expect(clientService.runSwapMaintenance).toHaveBeenCalledTimes(1);
      expect(claimTtlMs).toBe(60 * 60 * 1000);
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('A4: a run that lost its lease cannot complete or release the new claimant (complete and fail), terminal_skip logged, a third claimant stays blocked', async () => {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-fencing' })
      .asPromise();
    try {
      const runs = connection.db.collection<any>('controlPlaneJobRuns');
      const svc = createService(['CMS_SCHEDULER'], connection);
      const other = createService(['CMS_SCHEDULER'], connection);
      (other as any).owner = 'host-b:2';
      const warn = jest.spyOn((svc as any).logger, 'warn');
      let tokenB: string | null = null;
      // A outlived its lease (expired), then B reclaimed the same key through the real claimJob.
      const reclaimByB = async (jobId: string) => {
        await runs.updateOne({ _id: jobId } as any, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });
        tokenB = await (other as any).claimJob(runs, jobId);
        expect(typeof tokenB).toBe('string');
      };
      for (const phase of ['complete', 'fail'] as const) {
        const jobId = `fence-${phase}:1`;
        const run = (svc as any).runClaimed(jobId, 'fence', async () => {
          await reclaimByB(jobId);
          if (phase === 'fail') throw new Error('late failure');
          return { results: 'stale' };
        });
        if (phase === 'fail') await expect(run).rejects.toThrow('late failure');
        else await run;
        const doc = await runs.findOne({ _id: jobId } as any);
        expect([doc.claimToken, doc.leaseOwner, doc.completedAt, doc.failedAt, doc.results]).toEqual([tokenB, 'host-b:2', undefined, undefined, undefined]);
        expect(doc.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(warn.mock.calls.map((c) => String(c[0]))).toContain(`job-run kind=terminal_skip reason=lease_lost job=${jobId} phase=${phase}`);
        // B's live lease still blocks a third claimant.
        expect(await (svc as any).claimJob(runs, jobId)).toBeNull();
        // B's own terminal write with its token persists B's outcome and releases the lease.
        expect(await (other as any).finishRun(runs, jobId, tokenB, 'complete', { $set: { completedAt: new Date(), results: 'b' }, $unset: { leaseOwner: '', leaseExpiresAt: '' } })).toBe(true);
        const done = await runs.findOne({ _id: jobId } as any);
        expect([done.results, done.completedAt instanceof Date, done.leaseOwner, done.leaseExpiresAt]).toEqual(['b', true, undefined, undefined]);
      }
      // The normal path still completes with the token it claimed.
      await (svc as any).runClaimed('fence-ok:1', 'fence', async () => ({ results: 'ok' }));
      const ok = await runs.findOne({ _id: 'fence-ok:1' } as any);
      expect([ok.results, ok.completedAt instanceof Date, ok.leaseOwner, typeof ok.claimToken]).toEqual(['ok', true, undefined, 'string']);
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it('A1: scheduler-owned keys in a task outcome are dropped before the $set (shape kept), reserved_key_dropped logged', async () => {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-reserved' })
      .asPromise();
    try {
      const runs = connection.db.collection<any>('controlPlaneJobRuns');
      const svc = createService(['CMS_SCHEDULER'], connection);
      const warn = jest.spyOn((svc as any).logger, 'warn');
      await (svc as any).runClaimed('reserved:1', 'reserved', async () => ({
        _id: 'evil', completedAt: 'no', leaseOwner: 'x', leaseExpiresAt: new Date(8.64e15), claimToken: 't', failedAt: 1, error: 'e', startedAt: 0,
        day: '2026-11-21', sent: true,
      }));
      const doc = await runs.findOne({ _id: 'reserved:1' } as any);
      expect(await runs.countDocuments({ _id: 'evil' } as any)).toBe(0);
      expect(doc.completedAt).toBeInstanceOf(Date);
      expect(doc.startedAt).toBeInstanceOf(Date);
      expect([doc.day, doc.sent, doc.leaseOwner, doc.leaseExpiresAt, doc.failedAt, doc.error]).toEqual(['2026-11-21', true, undefined, undefined, undefined, undefined]);
      expect(doc.claimToken).not.toBe('t');
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
        'job-run kind=reserved_key_dropped job=reserved:1 keys=_id,startedAt,completedAt,leaseOwner,leaseExpiresAt,claimToken,failedAt,error',
      );
    } finally {
      await connection.dropDatabase();
      await connection.close();
      await mongod.stop();
    }
  });

  it.each([
    ['analytics health', 'runAnalyticsHealth', 'analytics-health:'],
    ['promote reset', 'runDailyPromoteReset', 'daily-promote-stats-reset:'],
    ['user reset', 'runDailyUserStatsReset', 'daily-user-stats-reset:'],
  ])('A4: %s terminal write matches _id + its claim token; a miss logs terminal_skip', async (_label, method, prefix) => {
    const controlPlaneJobRuns: any = {
      updateOne: jest.fn().mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }),
      insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      find: jest.fn(() => ({ sort: () => ({ limit: () => ({ next: async () => null }) }) })),
    };
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'controlPlaneJobRuns') return controlPlaneJobRuns;
        if (name === 'promoteStats') return { countDocuments: jest.fn().mockResolvedValue(0), find: () => ({ toArray: async () => [] }), updateMany: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }) };
        if (name === 'stats2') return { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) };
        if (name === 'userData') return { updateMany: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }) };
        throw new Error(`Unexpected collection: ${name}`);
      }),
    };
    const service = createService(['CMS_SCHEDULER'], { db });
    const warn = jest.spyOn((service as any).logger, 'warn');
    await (service as any)[method]();
    const inserted = controlPlaneJobRuns.insertOne.mock.calls[0][0];
    expect(typeof inserted.claimToken).toBe('string');
    const [filter] = controlPlaneJobRuns.updateOne.mock.calls[1];
    expect(filter).toEqual({ _id: inserted._id, claimToken: inserted.claimToken });
    expect(String(inserted._id).startsWith(prefix)).toBe(true);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain(`job-run kind=terminal_skip reason=lease_lost job=${inserted._id} phase=complete`);
  });

  it('A4: a failing analytics health run writes its failure on _id + its claim token; a miss logs terminal_skip phase=fail', async () => {
    const controlPlaneJobRuns: any = {
      updateOne: jest.fn().mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 }),
      insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      find: jest.fn(() => ({ sort: () => ({ limit: () => ({ next: async () => null }) }) })),
    };
    const service = createService(['CMS_SCHEDULER'], { db: { collection: () => controlPlaneJobRuns } });
    const warn = jest.spyOn((service as any).logger, 'warn');
    analyticsHealth.runWithState.mockRejectedValueOnce(new Error('pg down'));
    await expect((service as any).runAnalyticsHealth()).rejects.toThrow('pg down');
    const inserted = controlPlaneJobRuns.insertOne.mock.calls[0][0];
    const [filter, update] = controlPlaneJobRuns.updateOne.mock.calls[1];
    expect(filter).toEqual({ _id: inserted._id, claimToken: inserted.claimToken });
    expect(update.$set.error).toBe('pg down');
    expect(update.$set.leaseExpiresAt).toEqual(new Date(0));
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain(`job-run kind=terminal_skip reason=lease_lost job=${inserted._id} phase=fail`);
  });

  it('analytics health: guardrail dedupe state is read from the last completed day and stored on today\'s run', async () => {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose
      .createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-analytics-health-state' })
      .asPromise();
    try {
      const runs = connection.db.collection<any>('controlPlaneJobRuns');
      await runs.insertMany([
        { _id: 'analytics-health:2000-01-01', completedAt: new Date('2000-01-01T21:00:00Z'), historyAlerts: { old: '2000-01-01' } },
        { _id: 'analytics-health:2000-01-02', completedAt: new Date('2000-01-02T21:00:00Z'), historyAlerts: { 'size:warn:x': '2000-01-02' } },
        { _id: 'analytics-health:2000-01-03', failedAt: new Date('2000-01-03T21:00:00Z'), historyAlerts: { failed: 'x' } },
        { _id: 'swap-maintenance:2000-01-04T00:00', completedAt: new Date('2000-01-04T00:00:00Z'), historyAlerts: { other: 'x' } },
      ]);
      analyticsHealth.runWithState.mockClear();
      analyticsHealth.runWithState.mockResolvedValueOnce({
        problems: [],
        suppressed: ['size warn x: over budget'],
        historyAlerts: { 'size:warn:x': '2000-01-02' },
      });
      const service = createService(['CMS_SCHEDULER'], connection);
      await (service as any).runAnalyticsHealth();
      expect(analyticsHealth.runWithState).toHaveBeenCalledWith(expect.any(Number), { 'size:warn:x': '2000-01-02' });
      const today = (await runs.find({}).toArray()).find(
        (r) => String(r._id).startsWith('analytics-health:') && !String(r._id).startsWith('analytics-health:2000'),
      );
      expect(today).toEqual(
        expect.objectContaining({
          completedAt: expect.any(Date),
          problems: [],
          suppressed: ['size warn x: over budget'],
          historyAlerts: { 'size:warn:x': '2000-01-02' },
        }),
      );
    } finally {
      analyticsHealth.runWithState.mockResolvedValue(okHealth);
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
      analyticsHealth.runWithState.mockClear();
      analyticsHealth.runWithState.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(okHealth);
      const service = createService(['CMS_SCHEDULER'], connection);
      await expect((service as any).runAnalyticsHealth()).rejects.toThrow('boom');
      await (service as any).runAnalyticsHealth();
      expect(analyticsHealth.runWithState).toHaveBeenCalledTimes(2);
    } finally {
      analyticsHealth.runWithState.mockResolvedValue(okHealth);
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
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }),
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
    const log = jest.spyOn((service as any).logger, 'log');

    await (service as any).runDailyUserStatsReset();

    // stats2 audit B2: only rows created before today 00:00 IST, never the whole collection.
    expect(stats2.deleteMany).toHaveBeenCalledTimes(1);
    const filter = stats2.deleteMany.mock.calls[0][0];
    const cutoff = istTodayStart();
    expect(Object.keys(filter)).toEqual(['_id']);
    expect(filter._id.$lt).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(filter._id.$lt.getTimestamp().getTime()).toBe(cutoff.getTime());
    expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('stats2-reset '))).toEqual([
      `stats2-reset kind=deleted count=12 cutoff=${cutoff.toISOString()} attempt=1`,
    ]);
    // userData batch 2: windowCount replaced totalCount; reset to 10 (the old totalCount value), totalCount untouched.
    expect(userData.updateMany).toHaveBeenCalledWith(
      { payAmount: { $gt: 10 }, windowCount: { $gt: 30 } },
      {
        $set: { windowCount: 10, limitTime: expect.any(Number), paidReply: true },
      },
    );
    expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('window-count '))).toEqual([
      'window-count kind=daily-reset selector=payAmount>10,windowCount>30 value=10 matched=3 modified=3',
    ]);
    expect(controlPlaneJobRuns.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.stringMatching(/^daily-user-stats-reset:/),
      }),
    );
  });

  it('retries the stats2 reset with the same bounded delete when the paid-user update fails', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      // The first delete removes 4 rows, then the userData update fails; the retry's delete finds nothing new.
      const stats2 = {
        deleteMany: jest.fn().mockResolvedValueOnce({ deletedCount: 4 }).mockResolvedValueOnce({ deletedCount: 0 }),
      };
      const userData = {
        updateMany: jest
          .fn()
          .mockRejectedValueOnce(new Error('userData down'))
          .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }),
      };
      const service = createService(['UMS_TEST_SCHEDULER']);
      const log = jest.spyOn((service as any).logger, 'log');
      const cutoff = istTodayStart();
      const run = (service as any).resetUserStatsWithRetries(stats2, userData, cutoff);
      await jest.advanceTimersByTimeAsync(30_000);
      await expect(run).resolves.toEqual({ stats2DeletedCount: 4, paidUsersMatchedCount: 1, paidUsersModifiedCount: 1 }); // 4 + 0, not the retry's 0
      expect(stats2.deleteMany).toHaveBeenCalledTimes(2);
      expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('stats2-reset '))).toEqual([
        `stats2-reset kind=deleted count=4 cutoff=${cutoff.toISOString()} attempt=1`,
        `stats2-reset kind=deleted count=0 cutoff=${cutoff.toISOString()} attempt=2`,
      ]);
      for (const [filter] of stats2.deleteMany.mock.calls) {
        expect(filter._id.$lt.getTimestamp().getTime()).toBe(cutoff.getTime());
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the injected Nest connection for the complete legacy promoteStats reset', async () => {
    const updateMany = jest.fn().mockResolvedValue({ matchedCount: 20, modifiedCount: 20 });
    const promoteStats = {
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ client: 'ums', totalCount: 7 }]),
      })),
      updateMany,
    };
    const controlPlaneJobRuns = {
      updateOne: jest
        .fn()
        .mockResolvedValueOnce({ modifiedCount: 0 })
        .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }),
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
    const runId = expect.stringMatching(/^daily-promote-stats-reset:/);
    expect(promoteStats.countDocuments).toHaveBeenCalledWith({ resetRunId: runId });
    expect(updateMany).toHaveBeenCalledWith(
      { resetRunId: { $ne: runId } },
      {
        $set: expect.objectContaining({
          totalCount: 0,
          uniqueChannels: 0,
          data: {},
          resetRunId: runId,
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

  it('batch 5: a re-claim after a failed finishRun resets nothing again and logs kind=already_reset', async () => {
    jest.setTimeout(60_000);
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'sj-reset-idempotent' }).asPromise();
    try {
      const realDb = connection.db!;
      await realDb.collection('promoteStats').insertMany([
        { client: 'ums', totalCount: 40, uniqueChannels: 4, data: { a: 40 } },
        { client: 'ums-test', totalCount: 5, uniqueChannels: 1, data: { a: 5 } },
      ]);
      let failCompletion = true;
      const db = new Proxy(realDb, {
        get(target, prop) {
          if (prop !== 'collection') return (target as any)[prop]?.bind ? (target as any)[prop].bind(target) : (target as any)[prop];
          return (name: string) => {
            const coll = target.collection(name);
            if (name !== 'controlPlaneJobRuns') return coll;
            return new Proxy(coll, {
              get(c, p) {
                if (p === 'updateOne') {
                  return async (filter: any, update: any, ...rest: any[]) => {
                    if (failCompletion && update?.$set?.completedAt) { failCompletion = false; throw new Error('write concern timeout'); }
                    return (c.updateOne as any)(filter, update, ...rest);
                  };
                }
                const v = (c as any)[p];
                return typeof v === 'function' ? v.bind(c) : v;
              },
            });
          };
        },
      });
      const service = createService(['UMS_SCHEDULER'], { db });
      const warn = jest.spyOn((service as any).logger, 'warn');

      await expect((service as any).runDailyPromoteReset()).rejects.toThrow('write concern timeout');
      expect(sendBotNotice).not.toHaveBeenCalled();
      // tg counts 3 sends of the new day on one row.
      await realDb.collection('promoteStats').updateOne({ client: 'ums' }, { $inc: { totalCount: 3, 'data.b': 3 } });
      // Recovery tick re-claims the failed run.
      await (service as any).runDailyPromoteReset();

      const rows = await realDb.collection('promoteStats').find({}).sort({ client: 1 }).toArray();
      expect(rows.map((r) => [r.client, r.totalCount, r.data])).toEqual([['ums', 3, { b: 3 }], ['ums-test', 0, {}]]);
      expect(warn.mock.calls.map((c) => String(c[0]))).toContainEqual(
        expect.stringMatching(/^daily-promote-reset kind=already_reset job=daily-promote-stats-reset:\S+ rows=2$/),
      );
      // Nothing new to report on the re-claim: no second notice.
      expect(sendBotNotice).not.toHaveBeenCalled();
      const runs = (await realDb.collection('controlPlaneJobRuns').find({}).toArray())
        .filter((run) => String(run._id).startsWith('daily-promote-stats-reset:'));
      expect(runs).toEqual([expect.objectContaining({ completedAt: expect.any(Date) })]);
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
      const cutoffSec = Math.floor(istTodayStart().getTime() / 1000);
      await connection.db.collection('stats2').insertMany([
        { _id: mongoose.Types.ObjectId.createFromTime(cutoffSec - 3600), client: 'a', chatId: '1' },
        { _id: mongoose.Types.ObjectId.createFromTime(cutoffSec - 1), client: 'b', chatId: '2' },
        // Created after midnight IST (00:00-00:25, before the job): today's row, with today's paid marker.
        { _id: mongoose.Types.ObjectId.createFromTime(cutoffSec), client: 'c', chatId: '3', dailyPaidCountedAt: 'today' },
        { client: 'd', chatId: '4' },
      ] as any[]);
      await connection.db.collection('userData').insertMany([
        { profile: 'p1', chatId: '1', payAmount: 11, windowCount: 31, msgCount: 400, paidReply: false },
        { profile: 'p2', chatId: '2', payAmount: 10, windowCount: 99, paidReply: false },
        { profile: 'p3', chatId: '3', payAmount: 50, windowCount: 30, paidReply: false },
      ]);
      const service = createService(['UMS_TEST_SCHEDULER'], connection);

      await (service as any).runDailyUserStatsReset();

      expect((await connection.db.collection('stats2').find({}).toArray()).map((r) => r.client).sort()).toEqual(['c', 'd']);
      const p1 = await connection.db.collection('userData').findOne({ profile: 'p1' });
      expect(p1).toEqual(expect.objectContaining({ windowCount: 10, msgCount: 400, paidReply: true }));
      expect(p1).not.toHaveProperty('totalCount');
      expect(await connection.db.collection('userData').findOne({ profile: 'p2' }))
        .toEqual(expect.objectContaining({ windowCount: 99, paidReply: false }));
      expect(await connection.db.collection('userData').findOne({ profile: 'p3' }))
        .toEqual(expect.objectContaining({ windowCount: 30, paidReply: false }));
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
