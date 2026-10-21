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

  it('still clears timestamps when the userData sweep fails, and reports each step separately', async () => {
    const service = makeService({
      userDataService: { removeRedundantData: jest.fn().mockRejectedValue(new Error('sweep down')) },
    });

    await (service as any).runUserDataRetention();

    expect(service.timestampService.clear).toHaveBeenCalledTimes(1);
    const errors = service.logger.error.mock.calls.map(([message]: [string]) => message);
    expect(errors).toEqual([expect.stringContaining('userData retention failed')]);
  });

  it('reports a timestamps clear failure as such, not as a userData failure', async () => {
    const service = makeService({
      timestampService: { clear: jest.fn().mockRejectedValue(new Error("Updating the path 'updatedAt' would create a conflict")) },
    });

    await (service as any).runUserDataRetention();

    const errors = service.logger.error.mock.calls.map(([message]: [string]) => message);
    expect(errors).toEqual([expect.stringContaining('timestamps clear failed')]);
    expect(errors.join(' ')).not.toMatch(/userData/i);
    expect(service.logger.log).toHaveBeenCalledWith(expect.stringContaining('deleted=3'));
  });
});
