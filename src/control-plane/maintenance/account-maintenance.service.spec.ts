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
    const service = new AccountMaintenanceService(
      usersService as any,
      {} as any,
      {} as any,
      bufferClientService as any,
      promoteClientService as any,
    );
    return { service, usersService, bufferClientService, promoteClientService };
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
});
