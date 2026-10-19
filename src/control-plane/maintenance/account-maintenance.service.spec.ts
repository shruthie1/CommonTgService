jest.mock('telegram/Helpers', () => ({
  ...jest.requireActual('telegram/Helpers'),
  sleep: jest.fn(async () => undefined),
}));

import { AccountMaintenanceService } from './account-maintenance.service';
import { connectionManager } from '../../components';
import { Api } from 'telegram';
import * as authOps from '../../components/Telegram/manager/auth-operations';
import * as tgConfig from '../../components/Telegram/utils/tg-config';

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
    // '3' (left) and '4' (private) are this account's access only: never written to the shared pool.
    expect(activeChannelsService.createMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ channelId: '1', canSendMsgs: true }),
    ]);
    const persisted = activeChannelsService.createMultiple.mock.calls[0][0][0];
    expect(persisted).toHaveProperty('private', false);
    expect(persisted).toHaveProperty('forbidden', false);
  });

  describe('updateUser online presence', () => {
    function makeManager(overrides: Record<string, unknown> = {}) {
      const dialogs: any = [];
      dialogs.total = 7;
      return {
        getLastActiveTime: jest.fn().mockResolvedValue('2026-10-19'),
        getLastForeignActiveDate: jest.fn().mockResolvedValue('2026-10-19'),
        getMe: jest.fn().mockResolvedValue({ phone: '10000000009', firstName: 'A', lastName: 'B', username: 'u', id: { toString: () => '99' } }),
        getSelfMSgsInfo: jest.fn().mockResolvedValue({ total: 3, ownPhotoCount: 0, movieCount: 0, otherPhotoCount: 0, otherVideoCount: 0, ownVideoCount: 0 }),
        getDialogs: jest.fn().mockResolvedValue(dialogs),
        getContacts: jest.fn().mockResolvedValue({ savedCount: 4 }),
        hasPassword: jest.fn().mockResolvedValue(true),
        getCallLogStats: jest.fn().mockResolvedValue(null),
        setOnlineStatus: jest.fn().mockResolvedValue(undefined),
        client: { sendMessage: jest.fn().mockResolvedValue(undefined) },
        ...overrides,
      };
    }

    function setup(manager: any) {
      const { service } = createService();
      const usersService = { updateByFilter: jest.fn().mockResolvedValue(1), delete: jest.fn() };
      (service as any).usersService = usersService;
      const persist = jest.spyOn(service as any, 'persistDiscoveredChannels').mockResolvedValue(undefined);
      jest.spyOn(connectionManager, 'getClient').mockResolvedValue(manager);
      jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
      return { service, usersService, persist };
    }

    afterEach(() => jest.restoreAllMocks());

    it('marks the account online via account.UpdateStatus instead of sending "." to Saved Messages', async () => {
      const manager = makeManager();
      const { service, usersService } = setup(manager);

      await (service as any).updateUser({ mobile: '10000000009', tgId: '99' });

      expect(manager.setOnlineStatus).toHaveBeenCalledTimes(1);
      expect(manager.client.sendMessage).not.toHaveBeenCalled();
      expect(usersService.updateByFilter).toHaveBeenCalledWith(
        { $or: [{ tgId: '99' }, { mobile: '10000000009' }] },
        expect.objectContaining({ lastActive: '2026-10-19', totalChats: 7, contacts: 4, twoFA: true, msgs: 3 }),
      );
    });

    it('a failed status call does not fail the refresh or skip channel discovery', async () => {
      const manager = makeManager({ setOnlineStatus: jest.fn().mockRejectedValue(new Error('500: INTERDC_4_CALL_ERROR')) });
      const { service, usersService, persist } = setup(manager);

      await expect((service as any).updateUser({ mobile: '10000000009', tgId: '99' })).resolves.toBeUndefined();

      expect(manager.setOnlineStatus).toHaveBeenCalledTimes(1);
      expect(usersService.updateByFilter).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(usersService.delete).not.toHaveBeenCalled();
      expect(connectionManager.unregisterClient).toHaveBeenCalledWith('10000000009');
    });

    describe('lastActive refresh', () => {
      const today = () => new Date().toISOString().split('T')[0];
      const auth = (props: Record<string, unknown>) =>
        Object.assign(Object.create(Api.Authorization.prototype), { hash: { toString: () => 'h' }, ...props });
      // Manager whose auth methods are the real auth-operations over a fake GetAuthorizations.
      function managerWithAuths(invoke: jest.Mock) {
        const ctx: any = {
          client: { invoke },
          phoneNumber: '10000000009',
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        };
        return makeManager({
          getLastActiveTime: jest.fn(() => authOps.getLastActiveTime(ctx)),
          getLastForeignActiveDate: jest.fn(() => (authOps as any).getLastForeignActiveDate(ctx)),
        });
      }
      const payload = (usersService: any) => usersService.updateByFilter.mock.calls[0][1];

      beforeEach(() => jest.spyOn(tgConfig, 'isAuthFingerprintMatch').mockReturnValue(false));

      it('keeps the stored lastActive when we hold the only session (no foreign auth)', async () => {
        const manager = managerWithAuths(jest.fn().mockResolvedValue({ authorizations: [auth({ current: true, dateActive: 5000 })] }));
        const { service, usersService } = setup(manager);
        await (service as any).updateUser({ mobile: '10000000009', tgId: '99', lastActive: '2026-01-02' });
        expect(usersService.updateByFilter).toHaveBeenCalledTimes(1);
        expect(payload(usersService)).not.toHaveProperty('lastActive');
        expect(payload(usersService)).toEqual(expect.objectContaining({ totalChats: 7, contacts: 4, twoFA: true, msgs: 3, tgId: '99' }));
      });

      it('keeps the stored lastActive when the authorization lookup fails', async () => {
        const manager = managerWithAuths(jest.fn().mockRejectedValue(new Error('500: INTERDC_4_CALL_ERROR')));
        const { service, usersService } = setup(manager);
        await (service as any).updateUser({ mobile: '10000000009', tgId: '99', lastActive: '2026-01-02' });
        expect(usersService.updateByFilter).toHaveBeenCalledTimes(1);
        expect(payload(usersService)).not.toHaveProperty('lastActive');
      });

      it('writes the real foreign-session date when one exists', async () => {
        const manager = managerWithAuths(jest.fn().mockResolvedValue({
          authorizations: [auth({ current: true, dateActive: 9_999_999_999 }), auth({ current: false, dateActive: 1_700_000_000 })],
        }));
        const { service, usersService } = setup(manager);
        await (service as any).updateUser({ mobile: '10000000009', tgId: '99', lastActive: '2026-01-02' });
        expect(payload(usersService).lastActive).toBe(new Date(1_700_000_000 * 1000).toISOString().split('T')[0]);
      });

      it('still writes today for a user with no stored lastActive and no foreign auth (unchanged)', async () => {
        const manager = managerWithAuths(jest.fn().mockResolvedValue({ authorizations: [auth({ current: true, dateActive: 5000 })] }));
        const { service, usersService } = setup(manager);
        await (service as any).updateUser({ mobile: '10000000009', tgId: '99' });
        expect(payload(usersService).lastActive).toBe(today());
      });
    });

    it('still expires the user on a permanent error (unchanged)', async () => {
      const manager = makeManager({ getMe: jest.fn().mockRejectedValue(Object.assign(new Error('401: SESSION_REVOKED'), { errorMessage: 'SESSION_REVOKED' })) });
      const { service, usersService } = setup(manager);

      await (service as any).updateUser({ mobile: '10000000009', tgId: '99' });

      expect(usersService.delete).toHaveBeenCalledWith('99');
    });
  });
});
