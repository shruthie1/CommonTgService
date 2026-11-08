import { AppService } from '../app.service';

describe('AppService user-data/timestamp retention', () => {
  function makeService(overrides: Record<string, unknown> = {}): any {
    const service = Object.assign(Object.create(AppService.prototype), {
      userDataService: { removeRedundantData: jest.fn().mockResolvedValue({ deletedCount: 3 }) },
      timestampService: { clear: jest.fn().mockResolvedValue({}) },
      logger: { log: jest.fn(), error: jest.fn() },
      ...overrides,
    });
    return service;
  }

  // Owner rule 2026-10-26 "never delete records from db" (decision 2026-11-08, item 6): the nightly job no longer
  // deletes idle never-paid userData rows. Only the timestamps heartbeat clear remains.
  it('never calls the userData delete sweep', async () => {
    const service = makeService();

    await (service as any).runUserDataRetention();

    expect(service.userDataService.removeRedundantData).not.toHaveBeenCalled();
    expect(service.timestampService.clear).toHaveBeenCalledTimes(1);
    expect(service.logger.error).not.toHaveBeenCalled();
  });

  it('reports a timestamps clear failure as such, not as a userData failure', async () => {
    const service = makeService({
      timestampService: { clear: jest.fn().mockRejectedValue(new Error("Updating the path 'updatedAt' would create a conflict")) },
    });

    await (service as any).runUserDataRetention();

    const errors = service.logger.error.mock.calls.map(([message]: [string]) => message);
    expect(errors).toEqual([expect.stringContaining('timestamps clear failed')]);
    expect(errors.join(' ')).not.toMatch(/userData/i);
  });
});
