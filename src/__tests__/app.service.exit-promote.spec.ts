import * as telegramHelpers from 'telegram/Helpers';
import * as utils from '../utils';
import { AppService } from '../app.service';

describe('AppService promote-client exits', () => {
  const fetchSpy = jest.spyOn(utils, 'fetchWithTimeout');
  const sleepSpy = jest.spyOn(telegramHelpers, 'sleep');

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy.mockResolvedValue(undefined as any);
    sleepSpy.mockResolvedValue(undefined);
  });

  function makeService(clients: Array<Record<string, unknown>>): AppService {
    return Object.assign(Object.create(AppService.prototype), {
      clientService: {
        findAll: jest.fn().mockResolvedValue(clients),
      },
      logger: {
        warn: jest.fn(),
      },
    });
  }

  it('exits only primary promote repls and normalizes a trailing slash', async () => {
    const service = makeService([
      { clientId: 'kavya1', promoteRepl: 'https://promote-primary.example/' },
      { clientId: 'kavya2', promoteRepl: 'https://promote-secondary.example' },
    ]);

    await service.exitPromotePrimary();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('https://promote-primary.example/exit');
    expect(sleepSpy).toHaveBeenCalledWith(40000);
  });

  it('exits only secondary promote repls', async () => {
    const service = makeService([
      { clientId: 'nidhi1', promoteRepl: 'https://promote-primary.example' },
      { clientId: 'nidhi2', promoteRepl: 'https://promote-secondary.example' },
    ]);

    await service.exitPromoteSecondary();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('https://promote-secondary.example/exit');
    expect(sleepSpy).toHaveBeenCalledWith(40000);
  });

  it('skips a selected client whose promote repl is missing', async () => {
    const service = makeService([
      { clientId: 'shruthi1', promoteRepl: '   ' },
      { clientId: 'shruthi2', promoteRepl: 'https://promote-secondary.example' },
    ]);

    await service.exitPromotePrimary();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sleepSpy).not.toHaveBeenCalled();
    expect((service as any).logger.warn).toHaveBeenCalledWith(
      'Skipping promote exit for shruthi1: promoteRepl is missing',
    );
  });
});
