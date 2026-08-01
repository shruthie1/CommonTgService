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

describe('AppService client channel join contract', () => {
  const fetchSpy = jest.spyOn(utils, 'fetchWithTimeout');
  const sleepSpy = jest.spyOn(telegramHelpers, 'sleep');

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy.mockResolvedValue(undefined as any);
    sleepSpy.mockResolvedValue(undefined);
  });

  function makeService(overrides: Record<string, unknown> = {}): AppService {
    return Object.assign(Object.create(AppService.prototype), {
      clientService: {
        findAll: jest.fn().mockResolvedValue([]),
      },
      activeChannelsService: {
        getActiveChannels: jest.fn().mockResolvedValue([]),
      },
      joinChannelMap: new Map(),
      joinChannelQueue: jest.fn(),
      logger: {
        warn: jest.fn(),
      },
      ...overrides,
    });
  }

  it('builds joinchannel URLs only for valid public usernames', () => {
    const service = makeService() as any;

    expect(service.buildJoinChannelUrl('https://client.example', { username: '@valid_name', channelId: '123' }))
      .toBe('https://client.example/joinchannel?username=valid_name');

    for (const username of [undefined, null, '', 'undefined', 'null', 'bad space', 'abcd']) {
      expect(service.buildJoinChannelUrl('https://client.example', { username, channelId: '123', accessHash: '456' }))
        .toBeNull();
    }
  });

  it('uses channelinfo ids plus canSendFalseChats as exclusions and caps old client joins to 25', async () => {
    const activeChannels = [{ channelId: 'new-1', username: 'joinable_1' }];
    const service = makeService({
      clientService: {
        findAll: jest.fn().mockResolvedValue([{ clientId: 'shruthi1', repl: 'https://shruthi1.paidgirls.site' }]),
      },
      activeChannelsService: {
        getActiveChannels: jest.fn().mockResolvedValue(activeChannels),
      },
    });

    fetchSpy
      .mockResolvedValueOnce({
        data: {
          canSendTrueCount: 120,
          ids: ['already-1', 'already-2'],
          canSendFalseChats: ['already-2', 'cannot-send-1'],
        },
      } as any)
      .mockResolvedValue(undefined as any);

    await service.joinchannelForClients();

    expect((service as any).activeChannelsService.getActiveChannels).toHaveBeenCalledWith(
      25,
      0,
      ['already-1', 'already-2', 'cannot-send-1'],
    );
    expect((service as any).joinChannelMap.get('https://shruthi1.paidgirls.site')).toBe(activeChannels);
    expect((service as any).joinChannelQueue).toHaveBeenCalled();
  });
});
