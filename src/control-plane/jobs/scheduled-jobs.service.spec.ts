jest.mock('node-schedule-tz', () => ({
  scheduleJob: jest.fn(() => ({ cancel: jest.fn() })),
}));

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  fetchWithTimeout: jest.fn().mockResolvedValue({ data: { ok: true } }),
}));

import * as schedule from 'node-schedule-tz';
import { fetchWithTimeout } from '../../utils';
import { ScheduledJobsService } from './scheduled-jobs.service';

const scheduleJob = schedule.scheduleJob as jest.Mock;

describe('ScheduledJobsService scheduler ownership', () => {
  const originalLocalServer = process.env.LOCAL_SERVER;

  beforeEach(() => {
    process.env.LOCAL_SERVER = 'true';
    scheduleJob.mockClear();
  });

  afterAll(() => {
    if (originalLocalServer === undefined) delete process.env.LOCAL_SERVER;
    else process.env.LOCAL_SERVER = originalLocalServer;
  });

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
      { resetWordRestrictions: jest.fn() } as any,
      { deleteAll: jest.fn() } as any,
      connection as any,
    );
  }

  function jobNames(): string[] {
    return scheduleJob.mock.calls.map(([name]) => name);
  }

  it('registers buffer work, including one daily ready rotation, only for CMS', () => {
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

  it('registers all promote lifecycle work, including one daily ready rotation, only for UMS', () => {
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
      'maintenance-active-channel-word-restrictions',
    ]));
    expect(jobNames()).not.toContain('maintenance-promote-client-check');
    expect(jobNames()).not.toContain('maintenance-promote-client-join');
    expect(jobNames()).not.toContain('maintenance-promote-info-refresh');
    expect(jobNames()).not.toContain('maintenance-promote-ready-rotation');
    expect(jobNames()).not.toContain('maintenance-daily-promote-stats-reset');
    expect(jobNames()).not.toContain('cms-buffer-ready-rotation');
    service.onModuleDestroy();
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
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});
