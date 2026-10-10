import { ClientService } from '../client.service';
import { buildSpamEligibleFilter } from '../../buffer-clients/schemas/buffer-client.schema';

jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(), hasClient: jest.fn(), getClientState: jest.fn() },
}));
const mockProbe = jest.fn();
jest.mock('../../Telegram/utils/spambot-probe', () => ({
  ...jest.requireActual('../../Telegram/utils/spambot-probe'),
  probeSpamBot: (...a: any[]) => mockProbe(...a),
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('spam-aware setupClient swap', () => {
  let bufferClientService: any;

  function makeService() {
    const existingClient = { clientId: 'c1', mobile: '911', session: 'main-session', username: 'u' };
    const clientModel = {
      findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(existingClient) }) }),
    };
    const svc = new ClientService(
      clientModel as any,
      { setActiveClientSetup: jest.fn(), clearActiveClientSetup: jest.fn() } as any,
      bufferClientService,
      { search: jest.fn(), update: jest.fn(), expireAccount: jest.fn() } as any,
    );
    (svc as any).isInitialized = true;
    jest.spyOn(svc as any, 'updateClientSession').mockResolvedValue(undefined);
    return svc;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    bufferClientService = {
      executeQuery: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      createOrUpdate: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      getOrEnsureDistinctUsersBackupSession: jest.fn(async (mobile: string) => ({ tgId: `tg-${mobile}`, mobile, session: `backup-${mobile}` })),
    };
  });

  const cand = (mobile: string, extra: Record<string, unknown> = {}) => ({
    mobile, session: `s-${mobile}`, availableDate: '2026-10-01', ...extra,
  });

  describe('picker query', () => {
    test('due and permanent-future queries both exclude harsh and future-limited accounts', async () => {
      bufferClientService.executeQuery.mockResolvedValue([]);
      await (makeService() as any).handleSetupClient('c1', { days: 0, archiveOld: false, formalities: false, reason: 'FROZEN_METHOD_INVALID' });

      expect(bufferClientService.executeQuery).toHaveBeenCalledTimes(2);
      for (const [query] of bufferClientService.executeQuery.mock.calls) {
        const [notHarsh, notLimited] = query.$and;
        expect(notHarsh.$or).toEqual(expect.arrayContaining([
          { spamStatus: { $ne: 'harsh' } }, { spamCheckedAt: { $lte: expect.any(Date) } },
        ]));
        expect(notLimited.$or).toEqual(expect.arrayContaining([
          { limitedUntil: { $exists: false } }, { limitedUntil: null }, { limitedUntil: { $lte: expect.any(Date) } },
        ]));
      }
    });

    test('filter keeps accounts without spam fields eligible (shape)', () => {
      const f = buildSpamEligibleFilter(new Date('2026-10-10T00:00:00Z'));
      expect(JSON.stringify(f)).toContain('"$exists":false');
    });
  });

  describe('probe before swap', () => {
    test('limited candidate is skipped, persisted with pushed availableDate, next candidate used', async () => {
      const until = new Date(Date.now() + 3 * DAY);
      mockProbe
        .mockResolvedValueOnce({ status: 'limited', limitedUntil: until })
        .mockResolvedValueOnce({ status: 'free', limitedUntil: null });
      const got = await (makeService() as any).findSafeSetupBufferCandidate([cand('901'), cand('902')], 'main-session');

      expect(got.mobile).toBe('902');
      expect(bufferClientService.update).toHaveBeenNthCalledWith(1, '901', expect.objectContaining({
        spamStatus: 'limited', limitedUntil: until, spamCheckSource: 'cms-probe',
        spamCheckedAt: expect.any(Date), availableDate: until.toISOString().slice(0, 10),
      }));
      expect(bufferClientService.update).toHaveBeenNthCalledWith(2, '902', expect.objectContaining({
        spamStatus: 'free', limitedUntil: null, spamCheckSource: 'cms-probe',
      }));
    });

    test('harsh candidate is skipped and persisted without touching availableDate', async () => {
      mockProbe.mockResolvedValueOnce({ status: 'harsh', limitedUntil: null });
      const got = await (makeService() as any).findSafeSetupBufferCandidate([cand('903')], 'main-session');
      expect(got).toBeNull();
      const patch = bufferClientService.update.mock.calls[0][1];
      expect(patch).toMatchObject({ spamStatus: 'harsh', limitedUntil: null });
      expect(patch).not.toHaveProperty('availableDate');
    });

    test('unknown probe result allows the candidate and persists nothing', async () => {
      mockProbe.mockResolvedValueOnce({ status: 'unknown', limitedUntil: null, error: 'timeout' });
      const got = await (makeService() as any).findSafeSetupBufferCandidate([cand('904')], 'main-session');
      expect(got.mobile).toBe('904');
      expect(bufferClientService.update).not.toHaveBeenCalled();
    });

    test('fresh free (<6h) is not re-probed; stale free (>6h) is', async () => {
      const svc = makeService() as any;
      const fresh = cand('905', { spamStatus: 'free', spamCheckedAt: new Date(Date.now() - 1 * HOUR) });
      expect((await svc.findSafeSetupBufferCandidate([fresh], 'main-session')).mobile).toBe('905');
      expect(mockProbe).not.toHaveBeenCalled();

      mockProbe.mockResolvedValueOnce({ status: 'free', limitedUntil: null });
      const stale = cand('906', { spamStatus: 'free', spamCheckedAt: new Date(Date.now() - 7 * HOUR) });
      expect((await svc.findSafeSetupBufferCandidate([stale], 'main-session')).mobile).toBe('906');
      expect(mockProbe).toHaveBeenCalledTimes(1);
    });

    test('at most 3 probes per setup request; the budget is shared across due and fallback scans', async () => {
      mockProbe.mockResolvedValue({ status: 'limited', limitedUntil: new Date(Date.now() + DAY) });
      const svc = makeService() as any;
      const budget = { clientId: 'c1', remaining: 3, spentMs: 0, skipped: [] };
      const got = await svc.findSafeSetupBufferCandidate(
        ['1', '2', '3', '4', '5'].map((n) => cand(`91${n}`)), 'main-session', budget,
      );
      expect(got).toBeNull();
      expect(mockProbe).toHaveBeenCalledTimes(3);
      expect(budget.remaining).toBe(0);
    });

    test('stale harsh (>30d) candidate is re-probed like any non-fresh-free account', async () => {
      mockProbe.mockResolvedValueOnce({ status: 'free', limitedUntil: null });
      const stale = cand('920', { spamStatus: 'harsh', spamCheckedAt: new Date(Date.now() - 31 * DAY) });
      expect((await (makeService() as any).findSafeSetupBufferCandidate([stale], 'main-session')).mobile).toBe('920');
      expect(mockProbe).toHaveBeenCalledTimes(1);
      expect(bufferClientService.update).toHaveBeenCalledWith('920', expect.objectContaining({ spamStatus: 'free' }));
    });

    test('connect-failed probe rejects the candidate', async () => {
      mockProbe.mockResolvedValueOnce({ status: 'unknown', limitedUntil: null, connectFailed: true, error: 'connect timed out' });
      const budget = { clientId: 'c1', remaining: 3, spentMs: 0, skipped: [] as string[] };
      const got = await (makeService() as any).findSafeSetupBufferCandidate([cand('921')], 'main-session', budget);
      expect(got).toBeNull();
      expect(budget.skipped).toEqual(['921 connect failed']);
      expect(bufferClientService.update).not.toHaveBeenCalled();
    });

    test('REVIEW B3: a probe that could not message SpamBot (PEER_FLOOD) rejects the candidate', async () => {
      mockProbe.mockResolvedValueOnce({ status: 'unknown', limitedUntil: null, sendFailed: true, error: 'PEER_FLOOD' });
      const budget = { clientId: 'c1', remaining: 3, spentMs: 0, skipped: [] as string[] };
      expect(await (makeService() as any).findSafeSetupBufferCandidate([cand('922')], 'main-session', budget)).toBeNull();
      expect(budget.skipped).toEqual(['922 probe failed: PEER_FLOOD']);
      expect(bufferClientService.update).not.toHaveBeenCalled();
    });

    test('REVIEW B1/B2: a busy candidate is skipped without spending budget and flags a retry', async () => {
      mockProbe
        .mockResolvedValueOnce({ status: 'unknown', limitedUntil: null, busy: true, error: 'connection in use by another flow' })
        .mockResolvedValueOnce({ status: 'free', limitedUntil: null });
      const budget: any = { clientId: 'c1', remaining: 3, spentMs: 0, skipped: [] as string[] };
      const got = await (makeService() as any).findSafeSetupBufferCandidate([cand('923'), cand('924')], 'main-session', budget);
      expect(got.mobile).toBe('924');
      expect(budget.remaining).toBe(2); // only the real probe counted
      expect(budget.moreCandidatesPending).toBe(true);
      expect(budget.skipped).toEqual(['923 busy (not probed)']);
    });

    test('REVIEW F: each probe is capped to the remaining request budget; none starts with under 8s left', async () => {
      mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
      const svc = makeService() as any;
      const partly: any = { clientId: 'c1', remaining: 3, spentMs: 30_000, skipped: [] as string[] };
      await svc.findSafeSetupBufferCandidate([cand('925')], 'main-session', partly);
      expect(mockProbe).toHaveBeenCalledWith('925', { totalTimeoutMs: 15_000 });
      const nearlySpent: any = { clientId: 'c1', remaining: 3, spentMs: 40_000, skipped: [] as string[] };
      expect(await svc.findSafeSetupBufferCandidate([cand('926')], 'main-session', nearlySpent)).toBeNull();
      expect(mockProbe).toHaveBeenCalledTimes(1);
      expect(nearlySpent.moreCandidatesPending).toBe(true);
    });

    test('exhausted budget with unprobed candidates -> no_candidate + moreCandidatesPending, no swap', async () => {
      bufferClientService.executeQuery.mockResolvedValue(['1', '2', '3', '4'].map((n) => cand(`93${n}`)));
      mockProbe.mockResolvedValue({ status: 'limited', limitedUntil: new Date(Date.now() + DAY) });
      const svc = makeService() as any;
      const res = await svc.handleSetupClient('c1', { days: 0, archiveOld: false, formalities: false, reason: 'x' });
      expect(mockProbe).toHaveBeenCalledTimes(3);
      expect(res).toMatchObject({ status: 'no_candidate', swapped: false, moreCandidatesPending: true });
      expect(res.message).toMatch(/more unprobed candidates remain/);
    });

    test('no pending flag when every candidate was probed', async () => {
      bufferClientService.executeQuery.mockResolvedValue([cand('941')]);
      mockProbe.mockResolvedValue({ status: 'harsh', limitedUntil: null });
      const res = await (makeService() as any).handleSetupClient('c1', { days: 0, archiveOld: false, formalities: false, reason: 'x' });
      expect(res.status).toBe('no_candidate');
      expect(res.moreCandidatesPending).toBeUndefined();
    });

    test('permanent fallback scan has its own probe budget (due-scan exhaustion does not starve it)', async () => {
      const due = ['1', '2', '3', '4'].map((n) => cand(`95${n}`));
      const future = [cand('961')];
      bufferClientService.executeQuery.mockResolvedValueOnce(due).mockResolvedValueOnce(future);
      mockProbe.mockImplementation(async (m: string) =>
        m === '961' ? { status: 'free', limitedUntil: null } : { status: 'limited', limitedUntil: new Date(Date.now() + DAY) });
      const svc = makeService() as any;
      svc.telegramService.setActiveClientSetup = jest.fn();
      const { connectionManager } = jest.requireMock('../../Telegram/utils/connection-manager');
      connectionManager.getClient.mockResolvedValue({});
      const retire = jest.spyOn(svc, 'retireReplacedMobile').mockResolvedValue(undefined);

      const res = await svc.handleSetupClient('c1', { days: 0, archiveOld: false, formalities: false, reason: 'FROZEN_METHOD_INVALID' });

      expect(mockProbe).toHaveBeenCalledTimes(4); // 3 due + 1 fallback
      expect(mockProbe).toHaveBeenLastCalledWith('961', { totalTimeoutMs: 25_000 });
      expect(res).toMatchObject({ status: 'swapped', newMobile: '961', usedFutureAvailableFallback: true });
      expect(retire).not.toHaveBeenCalled();
    });

    test('skipped candidates are reported in the Swap started notification', async () => {
      const { fetchWithTimeout } = jest.requireMock('../../../utils/fetchWithTimeout');
      bufferClientService.executeQuery.mockResolvedValue([cand('907'), cand('908')]);
      mockProbe
        .mockResolvedValueOnce({ status: 'limited', limitedUntil: new Date('2099-01-02T10:00:00Z') })
        .mockResolvedValueOnce({ status: 'free', limitedUntil: null });
      const svc = makeService() as any;
      (svc as any).telegramService.setActiveClientSetup = jest.fn();
      const { connectionManager } = jest.requireMock('../../Telegram/utils/connection-manager');
      connectionManager.getClient.mockResolvedValue({});

      const res = await svc.handleSetupClient('c1', { days: 0, archiveOld: false, formalities: false, reason: 'x' });

      expect(res).toMatchObject({ status: 'swapped', newMobile: '908' });
      const texts = (fetchWithTimeout as jest.Mock).mock.calls.map((c) => decodeURIComponent(c[0]));
      expect(texts.some((t) => t.includes('Swap started c1') && t.includes('Skipped (SpamBot): 907 limited until 2099-01-02 10:00 UTC'))).toBe(true);
    });
  });

  describe('returnOldClientToBufferPool', () => {
    const oldClient = { clientId: 'c1', session: 'old-session' } as any;
    const oldUser = { tgId: 'tg-old' } as any;

    function releaseService(bufferDoc: any) {
      bufferClientService.findOne.mockResolvedValue(bufferDoc);
      const svc = makeService() as any;
      jest.spyOn(svc, 'assertDistinctUserBackupSession').mockResolvedValue({});
      return svc;
    }

    test('limited account returns with availableDate at limitedUntil when later than now+days; spam fields not written', async () => {
      const until = new Date(Date.now() + 20 * DAY);
      const svc = releaseService({ channels: 300, spamStatus: 'limited', limitedUntil: until });
      await svc.returnOldClientToBufferPool(oldClient, oldUser, '911', 5);
      const dto = bufferClientService.createOrUpdate.mock.calls[0][1];
      expect(dto.availableDate).toBe(until.toISOString().slice(0, 10));
      for (const k of ['spamStatus', 'limitedUntil', 'spamCheckedAt', 'spamCheckSource']) expect(dto).not.toHaveProperty(k);
    });

    test('earlier limitedUntil, harsh, or no spam data keep the normal now+days date', async () => {
      const expected = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
      for (const doc of [
        { channels: 300, spamStatus: 'limited', limitedUntil: new Date(Date.now() + DAY) },
        { channels: 300, spamStatus: 'harsh', limitedUntil: null },
        { channels: 300 },
        null,
      ]) {
        bufferClientService.createOrUpdate.mockClear();
        await releaseService(doc).returnOldClientToBufferPool(oldClient, oldUser, '911', 5);
        const dto = bufferClientService.createOrUpdate.mock.calls[0][1];
        expect(dto.availableDate).toBe(expected);
        expect(dto).not.toHaveProperty('spamStatus');
      }
    });
  });
});
