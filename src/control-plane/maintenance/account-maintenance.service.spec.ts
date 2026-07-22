import { AccountMaintenanceService } from './account-maintenance.service';

describe('AccountMaintenanceService lifecycle ownership', () => {
  function createService() {
    const usersService = {
      executeQuery: jest.fn().mockResolvedValue([]),
    };
    const bufferClientService = {
      findAll: jest.fn().mockResolvedValue([{ mobile: '10000000001' }]),
    };
    const promoteClientService = {
      findAll: jest.fn().mockResolvedValue([
        { mobile: '10000000002' },
        { mobile: '10000000001' },
      ]),
      checkPromoteClients: jest.fn(),
      rotateReadyPromoteClients: jest.fn(),
      joinchannelForPromoteClients: jest.fn(),
      updateInfo: jest.fn(),
    };
    const channelsService = {
      createMultiple: jest.fn().mockResolvedValue('ok'),
      findExistingChannelIds: jest.fn().mockResolvedValue([]),
    };
    const activeChannelsService = {
      createMultiple: jest.fn().mockResolvedValue('ok'),
      findExistingChannelIds: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountMaintenanceService(
      usersService as any,
      channelsService as any,
      activeChannelsService as any,
      bufferClientService as any,
      promoteClientService as any,
    );
    return { service, usersService, channelsService, activeChannelsService, bufferClientService, promoteClientService };
  }

  it('excludes all buffer and promote pool mobiles from raw-user processing', async () => {
    const { service, usersService } = createService();

    await service.processEligibleUsers(400, 0);

    expect(usersService.executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        mobile: { $nin: ['10000000001', '10000000002'] },
      }),
      {},
      400,
      0,
    );
  });

  it('does not trigger a promote join after a raw-user processing run', async () => {
    const { service, promoteClientService } = createService();

    await service.processEligibleUsers(400, 0);

    expect(promoteClientService.joinchannelForPromoteClients).not.toHaveBeenCalled();
  });

  it('persists new sendable channels and reconciles known unsendable channels only in their existing collection', async () => {
    const { service, channelsService, activeChannelsService } = createService();
    channelsService.findExistingChannelIds.mockResolvedValue(['2']);
    activeChannelsService.findExistingChannelIds.mockResolvedValue(['3']);
    const dialog = (id: string, overrides: Record<string, unknown> = {}) => ({
      isChannel: true,
      isGroup: false,
      entity: {
        id,
        title: 'adult chat',
        participantsCount: 100,
        broadcast: false,
        megagroup: true,
        ...overrides,
      },
    });

    await (service as any).persistDiscoveredChannels([
      dialog('1'),
      dialog('2', { restricted: true }),
      dialog('3', { left: true }),
      dialog('4', { private: true }),
      dialog('5', { forbidden: true }),
      dialog('6', { defaultBannedRights: { sendMessages: false, sendPlain: true } }),
      dialog('7', { broadcast: true }),
    ]);

    expect(channelsService.createMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ channelId: '1', canSendMsgs: true, private: false }),
      expect.objectContaining({ channelId: '2', canSendMsgs: false }),
    ]);
    expect(activeChannelsService.createMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ channelId: '1', canSendMsgs: true }),
      expect.objectContaining({ channelId: '3', canSendMsgs: false }),
    ]);
    const persisted = activeChannelsService.createMultiple.mock.calls[0][0][0];
    expect(persisted).toHaveProperty('private', false);
    expect(persisted).toHaveProperty('forbidden', false);
  });
});
