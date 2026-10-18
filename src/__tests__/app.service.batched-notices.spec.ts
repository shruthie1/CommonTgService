import * as telegramHelpers from 'telegram/Helpers';
import * as utils from '../utils';
import { AppService } from '../app.service';
import { sendBotNotice } from '../utils/bot-notice';
import { pushDigestEntries } from '../utils/notice-digest';

jest.mock('../utils/bot-notice', () => ({ sendBotNotice: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock('../utils/notice-digest', () => ({
  ...jest.requireActual('../utils/notice-digest'),
  pushDigestEntries: jest.fn().mockResolvedValue(true),
}));
jest.mock('../utils/redisClient', () => ({ RedisClient: { getClient: jest.fn(() => ({})) } }));

const notice = sendBotNotice as jest.Mock;
const pushMock = pushDigestEntries as jest.Mock;

describe('AppService batched notices', () => {
  const fetchSpy = jest.spyOn(utils, 'fetchWithTimeout');
  const sleepSpy = jest.spyOn(telegramHelpers, 'sleep');

  beforeEach(() => {
    jest.clearAllMocks();
    notice.mockResolvedValue({ sent: true });
    sleepSpy.mockResolvedValue(undefined);
  });

  function makeService(clients: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}): any {
    return Object.assign(Object.create(AppService.prototype), {
      clientService: { findAll: jest.fn().mockResolvedValue(clients) },
      activeChannelsService: { getActiveChannels: jest.fn().mockResolvedValue([{ username: 'chan_one' }, { username: 'chan_two' }]) },
      joinChannelMap: new Map(),
      joinClientIds: new Map(),
      joinChannelQueue: jest.fn(),
      logger: { warn: jest.fn(), error: jest.fn() },
      ...overrides,
    });
  }

  describe('joinchannelForClients', () => {
    it('sends ONE message with a row per client instead of two notices per client', async () => {
      const clients = ['a1', 'b1', 'c1'].map((clientId) => ({ clientId, repl: `https://${clientId}.example` }));
      const service = makeService(clients);
      fetchSpy.mockImplementation((async (url: string) => ({
        data: { canSendTrueCount: url.startsWith('https://c1') ? 400 : 120, ids: [], canSendFalseChats: [] },
      })) as any);

      await service.joinchannelForClients();

      expect(notice).toHaveBeenCalledTimes(1);
      const [target, input] = notice.mock.calls[0];
      expect(target).toBe('pppl');
      expect(input.title).toBe('Channel join cycle');
      const table = input.tables[0];
      expect(table.columns).toEqual(['Client (3)', 'Can send', 'Channels (4)', 'Status']);
      expect(table.rows).toEqual([
        ['a1', 120, 2, 'joining'],
        ['b1', 120, 2, 'joining'],
        ['c1', 400, '-', 'ok'],
      ]);
      expect(input.summary).toBeUndefined(); // table only
      expect(input.fields).toBeUndefined(); // no "Service: ums" row
      // Behaviour unchanged: the two small clients were queued, the 400 one was not.
      expect([...service.joinChannelMap.keys()].sort()).toEqual(['https://a1.example', 'https://b1.example']);
      expect(service.joinChannelQueue).toHaveBeenCalled();
    });

    it('turns a per-client failure into a row, still sending the single summary', async () => {
      const service = makeService([
        { clientId: 'ok1', repl: 'https://ok1.example' },
        { clientId: 'bad1', repl: 'https://bad1.example' },
      ]);
      fetchSpy.mockImplementation((async (url: string) => {
        if (url.startsWith('https://bad1')) throw new Error('connect ECONNREFUSED');
        return { data: { canSendTrueCount: 500 } };
      }) as any);

      await service.joinchannelForClients();

      expect(notice).toHaveBeenCalledTimes(1);
      const input = notice.mock.calls[0][1];
      expect(input.severity).toBe('warning');
      const bad = input.tables[0].rows.find((r: unknown[]) => r[0] === 'bad1');
      expect(String(bad[3])).toMatch(/^error: .*ECONNREFUSED/);
    });

    it('sends the summary even when the queue start throws, and nothing when there are no clients', async () => {
      const service = makeService([{ clientId: 'a1', repl: 'https://a1.example' }], {
        joinChannelQueue: jest.fn(() => { throw new Error('queue boom'); }),
      });
      fetchSpy.mockResolvedValue({ data: { canSendTrueCount: 500 } } as any);
      await expect(service.joinchannelForClients()).rejects.toThrow('queue boom');
      expect(notice).toHaveBeenCalledTimes(1);

      notice.mockClear();
      await makeService([]).joinchannelForClients();
      expect(notice).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentStats stale-row reset', () => {
    it('reports N reset rows as ONE notice and keeps the response unchanged', async () => {
      const stale = (profile: string) => ({
        profile, chatId: 'chat-1', canReply: 1, lastMsgTimeStamp: Date.now() - 25 * 24 * 3600 * 1000,
        callTime: 0, videos: [],
      });
      const update = jest.fn().mockResolvedValue(undefined);
      const service = makeService([], {
        userDataService: {
          executeQuery: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([stale('p1'), stale('p2'), stale('p3')]),
          update,
        },
      });

      const resp = await service.getPaymentStats('chat-1', 'me');

      expect(update).toHaveBeenCalledTimes(3);
      expect(notice).toHaveBeenCalledTimes(1);
      const input = notice.mock.calls[0][1];
      expect(input.title).toBe('Resetting UserData');
      expect(input.tables[0].rows.map((r: unknown[]) => r[0])).toEqual(['p1', 'p2', 'p3']);
      expect(input.tables[0].columns[0]).toBe('Profile (3)');
      expect(input.summary).toBeUndefined();
      expect(resp).toEqual({ paid: 0, demoGiven: 0, secondShow: 0, fullShow: 0, latestCallTime: 0, canCall: true, videos: [] });
    });
  });
});

describe('AppService channel cycles driven through the notice digest', () => {
  const fetchSpy = jest.spyOn(utils, 'fetchWithTimeout');
  const sleepSpy = jest.spyOn(telegramHelpers, 'sleep');

  beforeEach(() => {
    jest.clearAllMocks();
    notice.mockResolvedValue({ sent: true });
    pushMock.mockResolvedValue(true);
    sleepSpy.mockResolvedValue(undefined);
  });

  function makeService(clients: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}): any {
    return Object.assign(Object.create(AppService.prototype), {
      clientService: { findAll: jest.fn().mockResolvedValue(clients) },
      joinChannelMap: new Map(),
      joinClientIds: new Map(),
      digestTimers: [],
      joinChannelQueueRunning: false,
      joinChannelIntervalId: null,
      logger: { warn: jest.fn(), error: jest.fn() },
      ...overrides,
    });
  }

  it('leave-all opts every client in (batchNotice=1) and sends no message of its own', async () => {
    const clients = ['a1', 'b1'].map((clientId) => ({ clientId, repl: `https://${clientId}.example` }));
    const service = makeService(clients);
    fetchSpy.mockResolvedValue(undefined as any);
    await service.leaveChannelsAll();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://a1.example/leavechannels?batchNotice=1',
      'https://b1.example/leavechannels?batchNotice=1',
    ]);
    expect(notice).not.toHaveBeenCalled();
  });

  describe('join queue', () => {
    async function runQueue(service: any) {
      service.joinChannelMap.set('https://a1.example', [{ username: 'chan_one' }, { username: 'chan_two' }]);
      service.joinChannelMap.set('https://b1.example', [{ username: 'chan_three' }]);
      service.joinChannelMap.set('https://c1.example', [{ username: 'chan_four' }]);
      for (const c of ['a1', 'b1', 'c1']) service.joinClientIds.set(`https://${c}.example`, c);
      let a1Calls = 0;
      fetchSpy.mockImplementation((async (url: string) => {
        if (url.startsWith('https://a1')) {
          return { data: { success: true, result: ++a1Calls === 1 ? { ok: true } : { ok: false, error: 'CHANNEL_INVALID' } } };
        }
        if (url.startsWith('https://b1')) return { data: { success: true } }; // old build
        return undefined; // c1 unreachable
      }) as any);
      await service.joinChannelQueue();
      for (let i = 0; i < 6; i++) await jest.advanceTimersByTimeAsync(3 * 60 * 1000);
    }

    it('queues each tick\'s client outcomes in the digest (restart-safe) instead of keeping them in memory', async () => {
      jest.useFakeTimers();
      try {
        const service = makeService([]);
        await runQueue(service);

        expect(fetchSpy.mock.calls.every((c) => new URL(String(c[0])).searchParams.get('batchNotice') === '1')).toBe(true);
        expect(fetchSpy.mock.calls[0][1]).toEqual({ notificationConfig: { enabled: false } });
        const pushed = pushMock.mock.calls.flatMap((c) => c[3] as any[]);
        // Same channel the per-channel client messages used; counters merged per client by the flusher.
        expect(pushMock.mock.calls.every((c) => c[1] === 'CHANNEL_NOTIFICATIONS' && c[2] === 'join-results')).toBe(true);
        expect(pushed.every((e) => e.merge === 'sum')).toBe(true);
        expect(pushed.map((e) => [e.clientId, e.row.Joined, e.row.Failed, e.row['Old build'], e.row['No response']])).toEqual([
          ['a1', 1, 0, 0, 0], ['b1', 0, 0, 1, 0], ['c1', 0, 0, 0, 1],
          ['a1', 0, 1, 0, 0],
        ]);
        expect(pushed[3].row['Last error']).toContain('CHANNEL_INVALID');
        expect(notice).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('when Redis refuses, a tick is sent as ONE table, never one message per row', async () => {
      jest.useFakeTimers();
      try {
        pushMock.mockResolvedValue(false);
        const botsService = { sendMessageByCategory: jest.fn().mockResolvedValue(true) };
        const service = makeService([], { botsService });
        await runQueue(service);
        const sends = botsService.sendMessageByCategory.mock.calls;
        expect(sends).toHaveLength(2); // two ticks had work: one table each, one row per client
        expect(sends.every((c) => c[0] === 'CHANNEL_NOTIFICATIONS')).toBe(true);
        expect(sends.every((c) => c[3] === false)).toBe(true); // no "UMS ·" heading prefix
        expect(sends[0][1].tables[0].columns[0]).toBe('Client (3)');
        expect(sends[0][1].tables[0].rows).toHaveLength(3);
        expect(sends[1][1].tables[0].rows).toHaveLength(1);
        expect(notice).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('the digest flusher is started only in the UMS-scheduler process', () => {
    const botsService = { sendMessageByCategory: jest.fn() };
    const ums = makeService([], { botsService });
    ums.startDigestFlusher();
    expect(ums.digestTimers).toHaveLength(2);
    ums.digestFlusher.send('CLIENT_UPDATES', { title: 'User stats' });
    expect(botsService.sendMessageByCategory).toHaveBeenCalledWith('CLIENT_UPDATES', { title: 'User stats' }, undefined, false);
    ums.digestTimers.forEach((t: NodeJS.Timeout) => clearTimeout(t));
  });
});
