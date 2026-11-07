jest.mock('node-schedule-tz', () => ({
  scheduleJob: jest.fn(() => ({ cancel: jest.fn() })),
}));

import * as schedule from 'node-schedule-tz';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ScheduledJobsService } from './scheduled-jobs.service';

const scheduleJob = schedule.scheduleJob as jest.Mock;

/** The hourly pool_snapshot job (cms-pool-snapshot): CMS scheduler only, run-claimed per UTC hour. */
describe('ScheduledJobsService cms-pool-snapshot', () => {
  const originalLocalServer = process.env.LOCAL_SERVER;
  let mongod: MongoMemoryServer;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    process.env.LOCAL_SERVER = 'true';
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'scheduled-jobs-pool-snapshot' }).asPromise();
  }, 60_000);

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
    await mongod.stop();
    if (originalLocalServer === undefined) delete process.env.LOCAL_SERVER;
    else process.env.LOCAL_SERVER = originalLocalServer;
  });

  beforeEach(async () => {
    scheduleJob.mockClear();
    await connection.db!.collection('controlPlaneJobRuns').deleteMany({});
  });

  function createService(enabled: string[], writer: { run: jest.Mock }): ScheduledJobsService {
    const config = {
      enabled: jest.fn((name: string) => enabled.includes(name)),
      activeSchedulers: jest.fn(() => enabled),
    };
    return new ScheduledJobsService(
      config as any,
      { checkBufferClients: jest.fn(), rotateReadyBufferClients: jest.fn(), joinBufferClients: jest.fn(), updateBufferClientInfo: jest.fn() } as any,
      { checkPromoteClients: jest.fn(), rotateReadyPromoteClients: jest.fn(), preparePromoteClientJoin: jest.fn(), refreshPromoteClientInfo: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      connection as any,
      {} as any,
      writer as any,
    );
  }

  const callbacks = () => scheduleJob.mock.calls.filter(([name]) => name === 'cms-pool-snapshot').map((c) => c[3] as () => Promise<void>);

  it('registers hourly at :03 IST for the CMS scheduler only', () => {
    const writer = { run: jest.fn() };
    createService(['UMS_SCHEDULER'], writer).onModuleInit();
    createService(['UMS_TEST_SCHEDULER'], writer).onModuleInit();
    expect(callbacks()).toHaveLength(0);
    createService(['CMS_SCHEDULER'], writer).onModuleInit();
    expect(scheduleJob).toHaveBeenCalledWith('cms-pool-snapshot', '3 * * * *', 'Asia/Kolkata', expect.any(Function));
  });

  it('two CMS-scheduler processes in the same hour: only the claim holder writes, a re-fire that hour is skipped', async () => {
    const writer = { run: jest.fn().mockResolvedValue({ status: 'written', rows: 42, inserted: 42 }) };
    createService(['CMS_SCHEDULER'], writer).onModuleInit();
    createService(['CMS_SCHEDULER'], writer).onModuleInit();
    const cbs = callbacks();
    expect(cbs).toHaveLength(2);
    await Promise.all(cbs.map((cb) => cb()));
    await cbs[0]();
    expect(writer.run).toHaveBeenCalledTimes(1);
    const runs = await connection.db!.collection('controlPlaneJobRuns').find({}).toArray();
    expect(runs).toHaveLength(1);
    expect(String(runs[0]._id)).toMatch(/^pool-snapshot:\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(runs[0]).toEqual(expect.objectContaining({ completedAt: expect.any(Date), outcome: { status: 'written', rows: 42, inserted: 42 } }));
  });

  it('a failed hour is recorded as completed (a gap, not retried) and the next hour writes again', async () => {
    const writer = { run: jest.fn().mockResolvedValue({ status: 'failed', reason: 'query 57014: timeout' }) };
    const svc = createService(['CMS_SCHEDULER'], writer);
    const at = new Date('2026-11-07T05:33:00Z');
    await (svc as any).runPoolSnapshot(at);
    await (svc as any).runPoolSnapshot(at);
    expect(writer.run).toHaveBeenCalledTimes(1);
    writer.run.mockResolvedValue({ status: 'written', rows: 42, inserted: 42 });
    await (svc as any).runPoolSnapshot(new Date('2026-11-07T06:33:00Z'));
    expect(writer.run).toHaveBeenCalledTimes(2);
    const runs = await connection.db!.collection('controlPlaneJobRuns').find({}).sort({ _id: 1 }).toArray();
    expect(runs.map((r) => [r._id, r.outcome.status, !!r.completedAt])).toEqual([
      ['pool-snapshot:2026-11-07T05', 'failed', true],
      ['pool-snapshot:2026-11-07T06', 'written', true],
    ]);
  });
});
