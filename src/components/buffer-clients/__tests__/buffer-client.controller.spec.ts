/**
 * BufferClientController unit tests.
 *
 * Controller is instantiated directly with a stub service (plain object of
 * jest.fn()). No Mongo, no Nest TestingModule. Every route method is exercised,
 * including query/bulk/error/fire-and-forget branches.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BufferClientController } from '../buffer-client.controller';

const flushMicrotasks = async () => {
  await new Promise((r) => setImmediate(r));
  await Promise.resolve();
};

function makeStub() {
  return {
    create: jest.fn(),
    search: jest.fn(),
    updateInfo: jest.fn(),
    joinchannelForBufferClients: jest.fn(),
    checkBufferClients: jest.fn(),
    updateAllClientSessions: jest.fn(),
    diagnoseWarmupPipeline: jest.fn(),
    diagnoseEnrollmentDecision: jest.fn(),
    addNewUserstoBufferClients: jest.fn(),
    findAll: jest.fn(),
    setAsBufferClient: jest.fn(),
    executeQuery: jest.fn(),
    refreshProfilePhotosOnDemand: jest.fn(),
    getBufferClientDistribution: jest.fn(),
    getBufferClientsByClientId: jest.fn(),
    updateStatus: jest.fn(),
    markAsActive: jest.fn(),
    markAsInactive: jest.fn(),
    markAsUsed: jest.fn(),
    update: jest.fn(),
    getNextAvailableBufferClient: jest.fn(),
    getUnusedBufferClients: jest.fn(),
    findOne: jest.fn(),
    createOrUpdate: jest.fn(),
    healDeadSessions: jest.fn(),
    remove: jest.fn(),
  };
}

describe('BufferClientController', () => {
  let stub: ReturnType<typeof makeStub>;
  let controller: BufferClientController;

  beforeEach(() => {
    stub = makeStub();
    controller = new BufferClientController(stub as any);
    jest.spyOn((controller as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create → delegates', async () => {
    const dto: any = { mobile: '111' };
    stub.create.mockResolvedValue({ id: 1 });
    const res = await controller.create(dto);
    expect(stub.create).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ id: 1 });
  });

  it('search → strips apiKey before delegating', async () => {
    stub.search.mockResolvedValue([]);
    await controller.search({ mobile: '111', apiKey: 'secret' } as any);
    expect(stub.search).toHaveBeenCalledWith({ mobile: '111' });
    expect(stub.search.mock.calls[0][0]).not.toHaveProperty('apiKey');
  });

  describe('updateInfo (fire-and-forget)', () => {
    it('resolves → returns initiated string', async () => {
      stub.updateInfo.mockResolvedValue(undefined);
      const res = await controller.updateInfo();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });

    it('rejects → still returns string and logs error', async () => {
      stub.updateInfo.mockRejectedValue(new Error('boom'));
      const res = await controller.updateInfo();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });

    it('rejects with a message-less value → logs the raw error (|| fallback)', async () => {
      // Some upstream failures throw a bare string (no .message). The logger
      // line must fall back to the raw value instead of logging "undefined".
      stub.updateInfo.mockRejectedValue('disk full');
      const res = await controller.updateInfo();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('updateInfo failed: disk full');
    });
  });

  it('joinChannelsforBufferClients → delegates with and without clientId', async () => {
    stub.joinchannelForBufferClients.mockResolvedValue('ok');
    await controller.joinChannelsforBufferClients('cid');
    expect(stub.joinchannelForBufferClients).toHaveBeenCalledWith(true, 'cid');
    await controller.joinChannelsforBufferClients();
    expect(stub.joinchannelForBufferClients).toHaveBeenCalledWith(true, undefined);
  });

  describe('checkbufferClients (fire-and-forget)', () => {
    it('resolves → returns string', async () => {
      stub.checkBufferClients.mockResolvedValue(undefined);
      const res = await controller.checkbufferClients();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });

    it('rejects → returns string and logs', async () => {
      stub.checkBufferClients.mockRejectedValue(new Error('x'));
      const res = await controller.checkbufferClients();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });

    it('rejects with a message-less value → logs raw error (|| fallback)', async () => {
      stub.checkBufferClients.mockRejectedValue('warmup aborted');
      const res = await controller.checkbufferClients();
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('checkBufferClients failed: warmup aborted');
    });
  });

  describe('refreshBufferSessions', () => {
    it('apply !== true → dry-run with trimmed mobile', async () => {
      stub.updateAllClientSessions.mockResolvedValue({ dryRun: true });
      const res = await controller.refreshBufferSessions({ apply: false, mobile: '  999  ' });
      expect(stub.updateAllClientSessions).toHaveBeenCalledWith({ dryRun: true, mobile: '999' });
      expect(res).toEqual({ dryRun: true });
    });

    it('default body {} → dry-run, mobile undefined', async () => {
      stub.updateAllClientSessions.mockResolvedValue({ dryRun: true });
      await controller.refreshBufferSessions();
      expect(stub.updateAllClientSessions).toHaveBeenCalledWith({ dryRun: true, mobile: undefined });
    });

    it('blank/non-string mobile → undefined', async () => {
      stub.updateAllClientSessions.mockResolvedValue({});
      await controller.refreshBufferSessions({ apply: false, mobile: '   ' });
      expect(stub.updateAllClientSessions).toHaveBeenCalledWith({ dryRun: true, mobile: undefined });
      await controller.refreshBufferSessions({ apply: false, mobile: 123 as any });
      expect(stub.updateAllClientSessions).toHaveBeenLastCalledWith({ dryRun: true, mobile: undefined });
    });

    it('apply === true → returns initiated object', async () => {
      stub.updateAllClientSessions.mockResolvedValue(undefined);
      const res = await controller.refreshBufferSessions({ apply: true, mobile: '555' });
      expect(stub.updateAllClientSessions).toHaveBeenCalledWith({ dryRun: false, mobile: '555' });
      expect(res).toEqual({ initiated: true, dryRun: false, mobile: '555' });
    });

    it('apply === true with no mobile → mobile null in response', async () => {
      stub.updateAllClientSessions.mockResolvedValue(undefined);
      const res = await controller.refreshBufferSessions({ apply: true });
      expect(res).toEqual({ initiated: true, dryRun: false, mobile: null });
    });

    it('apply === true reject → console.error catch fires', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      stub.updateAllClientSessions.mockRejectedValue(new Error('fail'));
      const res = await controller.refreshBufferSessions({ apply: true, mobile: '555' });
      expect(res).toEqual({ initiated: true, dryRun: false, mobile: '555' });
      await flushMicrotasks();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  it('diagnoseWarmup → delegates', async () => {
    stub.diagnoseWarmupPipeline.mockResolvedValue({ ok: 1 });
    expect(await controller.diagnoseWarmup()).toEqual({ ok: 1 });
    expect(stub.diagnoseWarmupPipeline).toHaveBeenCalled();
  });

  it('diagnoseEnrollment → delegates', async () => {
    stub.diagnoseEnrollmentDecision.mockResolvedValue({ ok: 2 });
    expect(await controller.diagnoseEnrollment()).toEqual({ ok: 2 });
    expect(stub.diagnoseEnrollmentDecision).toHaveBeenCalled();
  });

  describe('addNewUserstoBufferClients', () => {
    it('null body → BadRequest', async () => {
      await expect(controller.addNewUserstoBufferClients(null as any)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('goodIds not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoBufferClients({ goodIds: 'x', badIds: [] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('badIds not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoBufferClients({ goodIds: [], badIds: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('clientsNeedingBufferClients present but not array → BadRequest', async () => {
      await expect(
        controller.addNewUserstoBufferClients({ goodIds: [], badIds: [], clientsNeedingBufferClients: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('valid with clientsNeedingBufferClients → delegates', async () => {
      stub.addNewUserstoBufferClients.mockResolvedValue(undefined);
      const res = await controller.addNewUserstoBufferClients({
        goodIds: ['g'],
        badIds: ['b'],
        clientsNeedingBufferClients: ['c'],
      } as any);
      expect(res).toBe('initiated Checking');
      expect(stub.addNewUserstoBufferClients).toHaveBeenCalledWith(['b'], ['g'], ['c'], undefined);
    });
    it('valid without clientsNeedingBufferClients → defaults to []', async () => {
      stub.addNewUserstoBufferClients.mockResolvedValue(undefined);
      await controller.addNewUserstoBufferClients({ goodIds: ['g'], badIds: ['b'] } as any);
      expect(stub.addNewUserstoBufferClients).toHaveBeenCalledWith(['b'], ['g'], [], undefined);
    });
    it('reject → logs error', async () => {
      stub.addNewUserstoBufferClients.mockRejectedValue(new Error('x'));
      const res = await controller.addNewUserstoBufferClients({ goodIds: [], badIds: [] } as any);
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('reject with message-less value → logs raw error (|| fallback)', async () => {
      stub.addNewUserstoBufferClients.mockRejectedValue('enrollment crashed');
      const res = await controller.addNewUserstoBufferClients({ goodIds: [], badIds: [] } as any);
      expect(res).toBe('initiated Checking');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('addNewUserstoBufferClients failed: enrollment crashed');
    });
  });

  it('findAll → delegates with status', async () => {
    stub.findAll.mockResolvedValue([]);
    await controller.findAll('active' as any);
    expect(stub.findAll).toHaveBeenCalledWith('active');
  });

  it('setAsBufferClient → delegates', async () => {
    stub.setAsBufferClient.mockResolvedValue('ok');
    await controller.setAsBufferClient('111', 'cid');
    expect(stub.setAsBufferClient).toHaveBeenCalledWith('111', 'cid');
  });

  it('executeQuery → delegates', async () => {
    stub.executeQuery.mockResolvedValue([]);
    await controller.executeQuery({ status: 'active' });
    expect(stub.executeQuery).toHaveBeenCalledWith({ status: 'active' });
  });

  it('refreshProfilePics → delegates', async () => {
    stub.refreshProfilePhotosOnDemand.mockResolvedValue({ refreshed: true, uploadedCount: 3 });
    expect(await controller.refreshProfilePics('111')).toEqual({ refreshed: true, uploadedCount: 3 });
    expect(stub.refreshProfilePhotosOnDemand).toHaveBeenCalledWith('111');
  });

  it('getBufferClientDistribution → delegates', async () => {
    stub.getBufferClientDistribution.mockResolvedValue({});
    await controller.getBufferClientDistribution();
    expect(stub.getBufferClientDistribution).toHaveBeenCalled();
  });

  it('getBufferClientsByClientId → delegates', async () => {
    stub.getBufferClientsByClientId.mockResolvedValue([]);
    await controller.getBufferClientsByClientId('cid', 'active' as any);
    expect(stub.getBufferClientsByClientId).toHaveBeenCalledWith('cid', 'active');
  });

  it('getBufferClientsByStatus → delegates findAll', async () => {
    stub.findAll.mockResolvedValue([]);
    await controller.getBufferClientsByStatus('inactive' as any);
    expect(stub.findAll).toHaveBeenCalledWith('inactive');
  });

  describe('updateStatus', () => {
    it('invalid status → BadRequest', async () => {
      await expect(
        controller.updateStatus('111', { status: 'weird', message: 'm' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    it('valid → delegates', async () => {
      stub.updateStatus.mockResolvedValue({});
      await controller.updateStatus('111', { status: 'active', message: 'm' } as any);
      expect(stub.updateStatus).toHaveBeenCalledWith('111', 'active', 'm');
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

  describe('getNextAvailable', () => {
    it('found → returns client', async () => {
      stub.getNextAvailableBufferClient.mockResolvedValue({ mobile: '111' });
      expect(await controller.getNextAvailable('cid')).toEqual({ mobile: '111' });
    });
    it('null → NotFound', async () => {
      stub.getNextAvailableBufferClient.mockResolvedValue(null);
      await expect(controller.getNextAvailable('cid')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('getUnusedBufferClients → default and explicit hoursAgo', async () => {
    stub.getUnusedBufferClients.mockResolvedValue([]);
    await controller.getUnusedBufferClients(undefined, 'cid');
    expect(stub.getUnusedBufferClients).toHaveBeenCalledWith(24, 'cid');
    await controller.getUnusedBufferClients(48, 'cid');
    expect(stub.getUnusedBufferClients).toHaveBeenLastCalledWith(48, 'cid');
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
      const res = await controller.healDeadSessions();
      expect(res).toBe('Session healing initiated for buffer clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).not.toHaveBeenCalled();
    });
    it('rejects → logs', async () => {
      stub.healDeadSessions.mockRejectedValue(new Error('x'));
      const res = await controller.healDeadSessions();
      expect(res).toBe('Session healing initiated for buffer clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalled();
    });
    it('rejects with message-less value → logs raw error (|| fallback)', async () => {
      stub.healDeadSessions.mockRejectedValue('session pool locked');
      const res = await controller.healDeadSessions();
      expect(res).toBe('Session healing initiated for buffer clients');
      await flushMicrotasks();
      expect((controller as any).logger.error).toHaveBeenCalledWith('healDeadSessions failed: session pool locked');
    });
  });

  it('remove → delegates', async () => {
    stub.remove.mockResolvedValue(undefined);
    await controller.remove('111');
    expect(stub.remove).toHaveBeenCalledWith('111');
  });
});
