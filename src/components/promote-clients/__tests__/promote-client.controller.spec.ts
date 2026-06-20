/**
 * PromoteClientController unit tests.
 *
 * Controller is instantiated directly with a stub service (plain object of
 * jest.fn()). No Mongo, no Nest TestingModule. Every route method is exercised,
 * including query/bulk/error/fire-and-forget branches.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromoteClientController } from '../promote-client.controller';

const flushMicrotasks = async () => {
  await new Promise((r) => setImmediate(r));
  await Promise.resolve();
};

function makeStub() {
  return {
    create: jest.fn(),
    search: jest.fn(),
    joinchannelForPromoteClients: jest.fn(),
    updateInfo: jest.fn(),
    checkPromoteClients: jest.fn(),
    addNewUserstoPromoteClients: jest.fn(),
    findAll: jest.fn(),
    setAsPromoteClient: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createOrUpdate: jest.fn(),
    healDeadSessions: jest.fn(),
    remove: jest.fn(),
    executeQuery: jest.fn(),
    refreshProfilePhotosOnDemand: jest.fn(),
    getPromoteClientDistribution: jest.fn(),
    getPromoteClientsByStatus: jest.fn(),
    getPromoteClientsWithMessages: jest.fn(),
    updateStatus: jest.fn(),
    markAsActive: jest.fn(),
    markAsInactive: jest.fn(),
    markAsUsed: jest.fn(),
    updateLastUsed: jest.fn(),
    getLeastRecentlyUsedPromoteClients: jest.fn(),
    getNextAvailablePromoteClient: jest.fn(),
    getUnusedPromoteClients: jest.fn(),
    getUsageStatistics: jest.fn(),
  };
}

describe('PromoteClientController', () => {
  let stub: ReturnType<typeof makeStub>;
  let controller: PromoteClientController;

  beforeEach(() => {
    stub = makeStub();
    controller = new PromoteClientController(stub as any);
    jest.spyOn((controller as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create → delegates', async () => {
    stub.create.mockResolvedValue({ id: 1 });
    expect(await controller.create({ mobile: '111' } as any)).toEqual({ id: 1 });
    expect(stub.create).toHaveBeenCalledWith({ mobile: '111' });
  });

  it('search → strips apiKey', async () => {
    stub.search.mockResolvedValue([]);
    await controller.search({ mobile: '111', apiKey: 'secret' } as any);
    expect(stub.search).toHaveBeenCalledWith({ mobile: '111' });
    expect(stub.search.mock.calls[0][0]).not.toHaveProperty('apiKey');
  });

  it('joinChannelsforPromoteClients → delegates', async () => {
    stub.joinchannelForPromoteClients.mockResolvedValue('ok');
    expect(await controller.joinChannelsforPromoteClients()).toBe('ok');
    expect(stub.joinchannelForPromoteClients).toHaveBeenCalled();
  });

  describe('updateInfo (fire-and-forget)', () => {
    it('resolves → returns string', async () => {
      stub.updateInfo.mockResolvedValue(undefined);
      expect(await controller.updateInfo()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });
    it('rejects → logs', async () => {
      stub.updateInfo.mockRejectedValue(new Error('x'));
      expect(await controller.updateInfo()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('rejects with a message-less value → logs raw error (|| fallback)', async () => {
      stub.updateInfo.mockRejectedValue('metadata refresh died');
      expect(await controller.updateInfo()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('updateInfo failed: metadata refresh died');
    });
  });

  describe('checkpromoteClients (fire-and-forget)', () => {
    it('resolves → returns string', async () => {
      stub.checkPromoteClients.mockResolvedValue(undefined);
      expect(await controller.checkpromoteClients()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });
    it('rejects → logs', async () => {
      stub.checkPromoteClients.mockRejectedValue(new Error('x'));
      expect(await controller.checkpromoteClients()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('rejects with a message-less value → logs raw error (|| fallback)', async () => {
      stub.checkPromoteClients.mockRejectedValue('warmup processor stalled');
      expect(await controller.checkpromoteClients()).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('checkPromoteClients failed: warmup processor stalled');
    });
  });

  describe('addNewUserstoPromoteClients', () => {
    it('null body → BadRequest', async () => {
      await expect(controller.addNewUserstoPromoteClients(null as any)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('goodIds not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoPromoteClients({ goodIds: 'x', badIds: [] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('badIds not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoPromoteClients({ goodIds: [], badIds: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('clientsNeedingPromoteClients present but not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoPromoteClients({ goodIds: [], badIds: [], clientsNeedingPromoteClients: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('valid with clientsNeedingPromoteClients → delegates', async () => {
      stub.addNewUserstoPromoteClients.mockResolvedValue(undefined);
      const res = await controller.addNewUserstoPromoteClients({
        goodIds: ['g'],
        badIds: ['b'],
        clientsNeedingPromoteClients: ['c'],
      } as any);
      expect(res).toBe('initiated Checking');
      expect(stub.addNewUserstoPromoteClients).toHaveBeenCalledWith(['b'], ['g'], ['c'], undefined);
    });
    it('valid without clientsNeedingPromoteClients → defaults []', async () => {
      stub.addNewUserstoPromoteClients.mockResolvedValue(undefined);
      await controller.addNewUserstoPromoteClients({ goodIds: ['g'], badIds: ['b'] } as any);
      expect(stub.addNewUserstoPromoteClients).toHaveBeenCalledWith(['b'], ['g'], [], undefined);
    });
    it('reject → logs', async () => {
      stub.addNewUserstoPromoteClients.mockRejectedValue(new Error('x'));
      const res = await controller.addNewUserstoPromoteClients({ goodIds: [], badIds: [] } as any);
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('reject with a message-less value → logs raw error (|| fallback)', async () => {
      stub.addNewUserstoPromoteClients.mockRejectedValue('enrollment crashed');
      const res = await controller.addNewUserstoPromoteClients({ goodIds: [], badIds: [] } as any);
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('addNewUserstoPromoteClients failed: enrollment crashed');
    });
  });

  it('findAll → delegates with status', async () => {
    stub.findAll.mockResolvedValue([]);
    await controller.findAll('active' as any);
    expect(stub.findAll).toHaveBeenCalledWith('active');
  });

  it('setAsPromoteClient → delegates with and without clientId', async () => {
    stub.setAsPromoteClient.mockResolvedValue('ok');
    await controller.setAsPromoteClient('111', 'cid');
    expect(stub.setAsPromoteClient).toHaveBeenCalledWith('111', 'cid');
    await controller.setAsPromoteClient('111');
    expect(stub.setAsPromoteClient).toHaveBeenLastCalledWith('111', undefined);
  });

  it('findOne → delegates', async () => {
    stub.findOne.mockResolvedValue({});
    await controller.findOne('111');
    expect(stub.findOne).toHaveBeenCalledWith('111');
  });

  it('update → delegates', async () => {
    stub.update.mockResolvedValue({});
    await controller.update('111', { channels: 5 } as any);
    expect(stub.update).toHaveBeenCalledWith('111', { channels: 5 });
  });

  it('createOrUpdate → delegates', async () => {
    stub.createOrUpdate.mockResolvedValue({});
    await controller.createOrUpdate('111', { channels: 5 } as any);
    expect(stub.createOrUpdate).toHaveBeenCalledWith('111', { channels: 5 });
  });

  describe('healDeadSessions (fire-and-forget)', () => {
    it('resolves → returns string', async () => {
      stub.healDeadSessions.mockResolvedValue(undefined);
      expect(await controller.healDeadSessions()).toBe('Session healing initiated for promote clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });
    it('rejects → logs', async () => {
      stub.healDeadSessions.mockRejectedValue(new Error('x'));
      expect(await controller.healDeadSessions()).toBe('Session healing initiated for promote clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('rejects with a message-less value → logs raw error (|| fallback)', async () => {
      stub.healDeadSessions.mockRejectedValue('session pool locked');
      expect(await controller.healDeadSessions()).toBe('Session healing initiated for promote clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('healDeadSessions failed: session pool locked');
    });
  });

  it('remove → delegates', async () => {
    stub.remove.mockResolvedValue(undefined);
    await controller.remove('111');
    expect(stub.remove).toHaveBeenCalledWith('111');
  });

  it('executeQuery → delegates', async () => {
    stub.executeQuery.mockResolvedValue([]);
    await controller.executeQuery({ status: 'active' });
    expect(stub.executeQuery).toHaveBeenCalledWith({ status: 'active' });
  });

  it('refreshProfilePics → delegates', async () => {
    stub.refreshProfilePhotosOnDemand.mockResolvedValue({ refreshed: true, uploadedCount: 2 });
    expect(await controller.refreshProfilePics('111')).toEqual({ refreshed: true, uploadedCount: 2 });
    expect(stub.refreshProfilePhotosOnDemand).toHaveBeenCalledWith('111');
  });

  it('getPromoteClientDistribution → delegates', async () => {
    stub.getPromoteClientDistribution.mockResolvedValue({});
    await controller.getPromoteClientDistribution();
    expect(stub.getPromoteClientDistribution).toHaveBeenCalled();
  });

  it('getPromoteClientsByStatus → delegates', async () => {
    stub.getPromoteClientsByStatus.mockResolvedValue([]);
    await controller.getPromoteClientsByStatus('active' as any);
    expect(stub.getPromoteClientsByStatus).toHaveBeenCalledWith('active');
  });

  it('getPromoteClientsWithMessages → delegates', async () => {
    stub.getPromoteClientsWithMessages.mockResolvedValue([]);
    await controller.getPromoteClientsWithMessages();
    expect(stub.getPromoteClientsWithMessages).toHaveBeenCalled();
  });

  describe('updateStatus', () => {
    it('invalid status → BadRequest', async () => {
      await expect(
        controller.updateStatus('111', { status: 'weird' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('valid → delegates', async () => {
      stub.updateStatus.mockResolvedValue({});
      await controller.updateStatus('111', { status: 'inactive', message: 'm' } as any);
      expect(stub.updateStatus).toHaveBeenCalledWith('111', 'inactive', 'm');
    });
  });

  it('markAsActive → delegates (and default body)', async () => {
    stub.markAsActive.mockResolvedValue({});
    await controller.markAsActive('111', { message: 'hi' } as any);
    expect(stub.markAsActive).toHaveBeenCalledWith('111', 'hi');
    await controller.markAsActive('222');
    expect(stub.markAsActive).toHaveBeenLastCalledWith('222', undefined);
  });

  it('markAsInactive → delegates', async () => {
    stub.markAsInactive.mockResolvedValue({});
    await controller.markAsInactive('111', { reason: 'r' } as any);
    expect(stub.markAsInactive).toHaveBeenCalledWith('111', 'r');
  });

  it('markAsUsed → delegates (and default body)', async () => {
    stub.markAsUsed.mockResolvedValue({});
    await controller.markAsUsed('111', { message: 'm' } as any);
    expect(stub.markAsUsed).toHaveBeenCalledWith('111', 'm');
    await controller.markAsUsed('222');
    expect(stub.markAsUsed).toHaveBeenLastCalledWith('222', undefined);
  });

  it('resetFailedAttempts → updates and returns message', async () => {
    stub.update.mockResolvedValue({});
    const res = await controller.resetFailedAttempts('111');
    expect(stub.update).toHaveBeenCalledWith('111', { failedUpdateAttempts: 0, lastUpdateFailure: null });
    expect(res).toEqual({ message: 'Reset failed attempts for 111' });
  });

  it('updateLastUsed → delegates', async () => {
    stub.updateLastUsed.mockResolvedValue({});
    await controller.updateLastUsed('111');
    expect(stub.updateLastUsed).toHaveBeenCalledWith('111');
  });

  it('getLeastRecentlyUsed → default and explicit limit', async () => {
    stub.getLeastRecentlyUsedPromoteClients.mockResolvedValue([]);
    await controller.getLeastRecentlyUsed('cid');
    expect(stub.getLeastRecentlyUsedPromoteClients).toHaveBeenCalledWith('cid', 1);
    await controller.getLeastRecentlyUsed('cid', 5);
    expect(stub.getLeastRecentlyUsedPromoteClients).toHaveBeenLastCalledWith('cid', 5);
  });

  describe('getNextAvailable', () => {
    it('found → returns client', async () => {
      stub.getNextAvailablePromoteClient.mockResolvedValue({ mobile: '111' });
      expect(await controller.getNextAvailable('cid')).toEqual({ mobile: '111' });
    });
    it('null → NotFound', async () => {
      stub.getNextAvailablePromoteClient.mockResolvedValue(null);
      await expect(controller.getNextAvailable('cid')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('getUnusedPromoteClients → default and explicit hoursAgo', async () => {
    stub.getUnusedPromoteClients.mockResolvedValue([]);
    await controller.getUnusedPromoteClients(undefined, 'cid');
    expect(stub.getUnusedPromoteClients).toHaveBeenCalledWith(24, 'cid');
    await controller.getUnusedPromoteClients(48, 'cid');
    expect(stub.getUnusedPromoteClients).toHaveBeenLastCalledWith(48, 'cid');
  });

  it('getUsageStatistics → delegates', async () => {
    stub.getUsageStatistics.mockResolvedValue({} as any);
    await controller.getUsageStatistics('cid');
    expect(stub.getUsageStatistics).toHaveBeenCalledWith('cid');
  });
});
