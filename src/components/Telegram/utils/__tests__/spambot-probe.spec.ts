const mockGetReuseState = jest.fn();
const mockGetLastUsed = jest.fn();
const mockGetClient = jest.fn();
const mockUnregister = jest.fn();
jest.mock('../connection-manager', () => ({
  connectionManager: {
    getReuseState: (...a: any[]) => mockGetReuseState(...a),
    getLastUsed: (...a: any[]) => mockGetLastUsed(...a),
    getClient: (...a: any[]) => mockGetClient(...a),
    unregisterClient: (...a: any[]) => mockUnregister(...a),
  },
}));

import { Api } from 'telegram';
import { Logger } from '../../../../utils/logger';
import { classifySpamBotReply, parseLimitedUntil, probeSpamBot } from '../spambot-probe';

const NOW = new Date('2026-10-10T12:00:00Z');

const FREE = 'Good news, no limits are currently applied to your account. You’re free as a bird!';
const LIMITED_FULL = 'Unfortunately, some phone numbers may trigger a harsh response from our anti-spam systems. Your account is limited until 12 Oct 2026, 15:58 UTC. While the account is limited, you will not be able to send messages to people who do not have your number in their contacts.';
const LIMITED_AUTO = 'Your account was limited. It will be automatically released on Oct 12, 2026.';
const HARSH = 'Unfortunately, some phone numbers may trigger a harsh response from our anti-spam systems. While the account is limited, you will not be able to send messages to people who do not have your number in their contacts.';

describe('classifySpamBotReply', () => {
  test('good news -> free', () => {
    expect(classifySpamBotReply(FREE, NOW)).toMatchObject({ status: 'free', limitedUntil: null });
  });

  test('limited until with full date -> limited, parsed to the minute in UTC', () => {
    const r = classifySpamBotReply(LIMITED_FULL, NOW);
    expect(r.status).toBe('limited');
    expect(r.limitedUntil?.toISOString()).toBe('2026-10-12T15:58:00.000Z');
  });

  test('"Oct 12, 2026" and day-month-only formats parse', () => {
    expect(classifySpamBotReply(LIMITED_AUTO, NOW).limitedUntil?.toISOString().slice(0, 10)).toBe('2026-10-12');
    const r = classifySpamBotReply('Your account is limited until 12 Oct', NOW);
    expect(r.status).toBe('limited');
    expect(r.limitedUntil?.toISOString()).toBe('2026-10-12T23:59:59.000Z');
  });

  test('a day-month already past rolls to next year', () => {
    expect(parseLimitedUntil('limited until 2 Jan', NOW)?.toISOString().slice(0, 10)).toBe('2027-01-02');
  });

  test('harsh response / limited with no date -> harsh', () => {
    expect(classifySpamBotReply(HARSH, NOW)).toMatchObject({ status: 'harsh', limitedUntil: null });
  });

  test('unrecognized or empty -> unknown', () => {
    expect(classifySpamBotReply('Hello! Choose a language', NOW).status).toBe('unknown');
    expect(classifySpamBotReply('', NOW).status).toBe('unknown');
  });
});

describe('probeSpamBot', () => {
  const fast = { pollIntervalMs: 1, pollTimeoutMs: 50, totalTimeoutMs: 500 };
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReuseState.mockReturnValue('none');
    mockGetLastUsed.mockReturnValue(1000);
    mockUnregister.mockResolvedValue(undefined);
  });

  function tgWith(messages: any[][]) {
    const getMessages = jest.fn();
    messages.forEach((m) => getMessages.mockResolvedValueOnce(m));
    getMessages.mockResolvedValue(messages[messages.length - 1] ?? []);
    return { sendMessage: jest.fn().mockResolvedValue({ id: 100 }), getMessages };
  }

  test('sends /start to @SpamBot, ignores older/outgoing messages, classifies the newest reply and releases', async () => {
    const tg = tgWith([[
      { id: 90, out: false, message: LIMITED_FULL }, // older than our /start: ignored
      { id: 100, out: true, message: '/start' },
      { id: 101, out: false, message: FREE },
    ]]);
    mockGetClient.mockResolvedValue({ client: tg });

    const r = await probeSpamBot('9100', fast);

    expect(tg.sendMessage).toHaveBeenCalledWith('@SpamBot', { message: '/start' });
    expect(r.status).toBe('free');
    expect(mockUnregister).toHaveBeenCalledWith('9100');
  });

  test('keeps polling past a greeting until the verdict arrives', async () => {
    const tg = tgWith([
      [{ id: 101, out: false, message: 'Hello!' }],
      [{ id: 101, out: false, message: 'Hello!' }, { id: 102, out: false, message: LIMITED_FULL }],
    ]);
    mockGetClient.mockResolvedValue({ client: tg });
    expect((await probeSpamBot('9101', fast)).status).toBe('limited');
  });

  test('no reply before the timeout -> unknown, connection still released', async () => {
    mockGetClient.mockResolvedValue({ client: tgWith([[]]) });
    const r = await probeSpamBot('9102', fast);
    expect(r.status).toBe('unknown');
    expect(mockUnregister).toHaveBeenCalledWith('9102');
  });

  test('connection failure -> unknown (never throws)', async () => {
    mockGetClient.mockRejectedValue(new Error('SESSION_REVOKED'));
    const r = await probeSpamBot('9103', fast);
    expect(r).toMatchObject({ status: 'unknown', error: 'SESSION_REVOKED' });
  });

  test('reuses a healthy existing connection and never unregisters it', async () => {
    mockGetReuseState.mockReturnValue('healthy');
    mockGetClient.mockResolvedValue({ client: tgWith([[{ id: 101, out: false, message: FREE }]]) });
    expect((await probeSpamBot('9104', fast)).status).toBe('free');
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  test('REVIEW B1/B2: a mobile another flow is building or holds unhealthy is not touched at all', async () => {
    mockGetReuseState.mockReturnValue('busy');
    const r = await probeSpamBot('9105', fast);
    expect(r).toMatchObject({ status: 'unknown', busy: true });
    expect(r.connectFailed).toBeUndefined();
    expect(mockGetClient).not.toHaveBeenCalled(); // getClient would join the build or tear the client down
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  test('a connection another flow started using during the probe is left to idle cleanup', async () => {
    mockGetLastUsed.mockReturnValueOnce(1000).mockReturnValue(2000); // lastUsed moved after we acquired
    mockGetClient.mockResolvedValue({ client: tgWith([[{ id: 101, out: false, message: FREE }]]) });
    expect((await probeSpamBot('9111', fast)).status).toBe('free');
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  test('REVIEW B3: PEER_FLOOD on /start -> sendFailed (not safe), connection still released', async () => {
    const tg = { sendMessage: jest.fn().mockRejectedValue(new Error('PEER_FLOOD')), getMessages: jest.fn() };
    mockGetClient.mockResolvedValue({ client: tg });
    const r = await probeSpamBot('9112', fast);
    expect(r).toMatchObject({ status: 'unknown', sendFailed: true, error: 'PEER_FLOOD' });
    expect(mockUnregister).toHaveBeenCalledWith('9112');
  });

  test('a read error while polling -> sendFailed', async () => {
    const tg = { sendMessage: jest.fn().mockResolvedValue({ id: 100 }), getMessages: jest.fn().mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED')) };
    mockGetClient.mockResolvedValue({ client: tg });
    expect(await probeSpamBot('9113', fast)).toMatchObject({ status: 'unknown', sendFailed: true });
  });

  test('connect error -> connectFailed, nothing unregistered by the probe', async () => {
    mockGetClient.mockRejectedValue(new Error('SESSION_REVOKED'));
    const r = await probeSpamBot('9106', fast);
    expect(r).toMatchObject({ status: 'unknown', connectFailed: true });
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  test('connect timeout -> connectFailed, and a connect that lands later is disconnected at once', async () => {
    let resolveConnect!: (v: any) => void;
    mockGetClient.mockReturnValue(new Promise((r) => { resolveConnect = r; }));
    const r = await probeSpamBot('9107', { ...fast, totalTimeoutMs: 20 });
    expect(r).toMatchObject({ status: 'unknown', connectFailed: true });
    expect(mockUnregister).not.toHaveBeenCalled();
    resolveConnect({ client: tgWith([[]]) });
    await new Promise((res) => setTimeout(res, 5));
    expect(mockUnregister).toHaveBeenCalledWith('9107'); // never left connected for idle cleanup
  });

  test('a timed-out connect that later fails needs no disconnect', async () => {
    let rejectConnect!: (e: any) => void;
    mockGetClient.mockReturnValue(new Promise((_, rej) => { rejectConnect = rej; }));
    await probeSpamBot('9114', { ...fast, totalTimeoutMs: 20 });
    rejectConnect(new Error('SESSION_REVOKED'));
    await new Promise((res) => setTimeout(res, 5));
    expect(mockUnregister).not.toHaveBeenCalled();
  });

  test('connected but silent SpamBot is NOT connectFailed', async () => {
    mockGetClient.mockResolvedValue({ client: tgWith([[]]) });
    const r = await probeSpamBot('9108', fast);
    expect(r.status).toBe('unknown');
    expect(r.connectFailed).toBeUndefined();
    expect(r.sendFailed).toBeUndefined();
  });

  describe('missing sent.id', () => {
    const nowSec = () => Math.floor(Date.now() / 1000);
    test('replies are matched by timestamp, not id > 0', async () => {
      const tg = {
        sendMessage: jest.fn().mockResolvedValue({}),
        getMessages: jest.fn().mockResolvedValue([
          { id: 5, out: false, date: nowSec() - 3600, message: LIMITED_FULL }, // old reply: must be ignored
        ]),
      };
      mockGetClient.mockResolvedValue({ client: tg });
      const r = await probeSpamBot('9109', fast);
      expect(r.status).toBe('unknown');
    });
    test('a reply dated after the send is accepted', async () => {
      const tg = {
        sendMessage: jest.fn().mockResolvedValue({}),
        getMessages: jest.fn().mockResolvedValue([
          { id: 5, out: false, date: nowSec() - 3600, message: LIMITED_FULL },
          { id: 6, out: false, date: nowSec() + 1, message: FREE },
        ]),
      };
      mockGetClient.mockResolvedValue({ client: tg });
      expect((await probeSpamBot('9110', fast)).status).toBe('free');
    });
  });
});

describe('probeSpamBot: @SpamBot blocked by the account (YOU_BLOCKED_USER)', () => {
  const fast = { pollIntervalMs: 1, pollTimeoutMs: 50, totalTimeoutMs: 500 };
  const SPAMBOT_PEER = { className: 'InputPeerUser', userId: 178220800 };
  // gramjs RPCError shape: errorMessage plus "400: YOU_BLOCKED_USER (caused by ...)" as message.
  const blockedError = () => Object.assign(new Error('400: YOU_BLOCKED_USER (caused by messages.SendMessage)'), { code: 400, errorMessage: 'YOU_BLOCKED_USER' });
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReuseState.mockReturnValue('none');
    mockGetLastUsed.mockReturnValue(1000);
    mockUnregister.mockResolvedValue(undefined);
  });

  function blockedTg(overrides: Partial<Record<'sendMessage' | 'getMessages' | 'invoke' | 'getInputEntity', jest.Mock>> = {}) {
    return {
      sendMessage: jest.fn().mockRejectedValueOnce(blockedError()).mockResolvedValue({ id: 100 }),
      getMessages: jest.fn().mockResolvedValue([{ id: 101, out: false, message: FREE }]),
      invoke: jest.fn().mockResolvedValue(true),
      getInputEntity: jest.fn().mockResolvedValue(SPAMBOT_PEER),
      ...overrides,
    };
  }

  test('unblocks @SpamBot once, resends /start once, and the verdict is parsed', async () => {
    const tg = blockedTg();
    mockGetClient.mockResolvedValue({ client: tg });

    const r = await probeSpamBot('919876543210', fast);

    expect(r).toMatchObject({ status: 'free' });
    expect(r.sendFailed).toBeUndefined();
    expect(tg.invoke).toHaveBeenCalledTimes(1);
    const req = tg.invoke.mock.calls[0][0];
    expect(req).toBeInstanceOf(Api.contacts.Unblock);
    expect(req.id).toBe(SPAMBOT_PEER);
    expect(tg.getInputEntity).toHaveBeenCalledWith('@SpamBot');
    expect(tg.sendMessage).toHaveBeenCalledTimes(2);
    expect(tg.sendMessage).toHaveBeenNthCalledWith(2, '@SpamBot', { message: '/start' });
    expect(mockUnregister).toHaveBeenCalledWith('919876543210');
  });

  test('logs one unblock line with the mobile masked to the last 4 digits', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      mockGetClient.mockResolvedValue({ client: blockedTg() });
      await probeSpamBot('919876543210', fast);
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => /unblock/i.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('3210');
      expect(lines[0]).not.toContain('9198765');
    } finally {
      spy.mockRestore();
    }
  });

  test('unblock fails -> rejected exactly as before (sendFailed, YOU_BLOCKED_USER), no resend', async () => {
    const tg = blockedTg({ invoke: jest.fn().mockRejectedValue(new Error('FLOOD_WAIT_30')) });
    mockGetClient.mockResolvedValue({ client: tg });

    const r = await probeSpamBot('9120', fast);

    expect(r).toMatchObject({ status: 'unknown', sendFailed: true, error: '400: YOU_BLOCKED_USER (caused by messages.SendMessage)' });
    expect(tg.invoke).toHaveBeenCalledTimes(1);
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockUnregister).toHaveBeenCalledWith('9120');
  });

  test('resend fails -> rejected (sendFailed), no second unblock and no third send', async () => {
    const tg = blockedTg({ sendMessage: jest.fn().mockRejectedValueOnce(blockedError()).mockRejectedValueOnce(blockedError()) });
    mockGetClient.mockResolvedValue({ client: tg });

    const r = await probeSpamBot('9121', fast);

    expect(r).toMatchObject({ status: 'unknown', sendFailed: true });
    expect(r.error).toContain('YOU_BLOCKED_USER');
    expect(tg.invoke).toHaveBeenCalledTimes(1);
    expect(tg.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('a non-blocked send error (PEER_FLOOD) makes no unblock call', async () => {
    const tg = blockedTg({ sendMessage: jest.fn().mockRejectedValue(new Error('PEER_FLOOD')) });
    mockGetClient.mockResolvedValue({ client: tg });

    const r = await probeSpamBot('9122', fast);

    expect(r).toMatchObject({ status: 'unknown', sendFailed: true, error: 'PEER_FLOOD' });
    expect(tg.invoke).not.toHaveBeenCalled();
    expect(tg.getInputEntity).not.toHaveBeenCalled();
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('a hung unblock is cut at the per-probe deadline -> rejected as before, connection released', async () => {
    const tg = blockedTg({ invoke: jest.fn().mockReturnValue(new Promise(() => undefined)) });
    mockGetClient.mockResolvedValue({ client: tg });

    const t0 = Date.now();
    const r = await probeSpamBot('9123', { ...fast, totalTimeoutMs: 80 });
    const elapsed = Date.now() - t0;

    expect(r).toMatchObject({ status: 'unknown', sendFailed: true });
    expect(r.error).toContain('YOU_BLOCKED_USER');
    expect(elapsed).toBeLessThan(80 + 100);
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockUnregister).toHaveBeenCalledWith('9123');
  });

  test('a hung resend is cut at the per-probe deadline', async () => {
    const tg = blockedTg({ sendMessage: jest.fn().mockRejectedValueOnce(blockedError()).mockReturnValue(new Promise(() => undefined)) });
    mockGetClient.mockResolvedValue({ client: tg });

    const t0 = Date.now();
    const r = await probeSpamBot('9124', { ...fast, totalTimeoutMs: 80 });

    expect(Date.now() - t0).toBeLessThan(80 + 100);
    expect(r).toMatchObject({ status: 'unknown', sendFailed: true, error: 'send /start timed out' });
  });

  test('time spent unblocking comes out of the same budget: polling stops at the original deadline', async () => {
    const tg = blockedTg({
      invoke: jest.fn().mockImplementation(() => new Promise((res) => setTimeout(() => res(true), 60))),
      getMessages: jest.fn().mockResolvedValue([]), // SpamBot silent: poll runs until the deadline
    });
    mockGetClient.mockResolvedValue({ client: tg });

    const t0 = Date.now();
    const r = await probeSpamBot('9125', { pollIntervalMs: 5, pollTimeoutMs: 10_000, totalTimeoutMs: 120 });
    const elapsed = Date.now() - t0;

    expect(r).toMatchObject({ status: 'unknown', error: 'no SpamBot reply before timeout' });
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(120 + 100);
  });
});
