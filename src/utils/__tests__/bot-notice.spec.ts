jest.mock('axios');
import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const httpError = (status: number) => Object.assign(new Error('x'), { response: { status, data: { ok: false, description: 'Bad Request' } } });

describe('sendBotNotice', () => {
  const ORIGINAL_ENV = process.env;
  let sendBotNotice: typeof import('../bot-notice').sendBotNotice;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, BOT_TOKENS: 'tok1,tok2' };
    delete process.env.accountsChannel;
    process.env.updatesChannel = '-100999'; // no hard-coded updates chat since 2026-11-23
    delete process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES;
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    sendBotNotice = require('../bot-notice').sendBotNotice;
  });
  afterEach(() => errSpy.mockRestore());
  afterAll(() => { process.env = ORIGINAL_ENV; });

  test('posts a rich message to the default accounts chat with the rotating token', async () => {
    (require('axios') as jest.Mocked<typeof axios>).post.mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } });
    const ax = require('axios') as jest.Mocked<typeof axios>;
    const res = await sendBotNotice('notif', { title: 'Hello', fields: [{ label: 'Mobile', value: '91123' }] });
    expect(res.sent).toBe(true);
    const [url, body] = ax.post.mock.calls[0] as any[];
    expect(url).toBe('https://api.telegram.org/bottok1/sendRichMessage');
    expect(body.chat_id).toBe('-1001801844217');
    expect(body.rich_message.html).toContain('<tr><th colspan="2">Hello</th></tr>');
    expect(body.rich_message.html).toContain('<code>91123</code>');
    await sendBotNotice('notif', { title: 'again' });
    expect((ax.post.mock.calls[1] as any[])[0]).toContain('bottok2');
  });

  test('pppl uses the updates chat; explicit chat and token override both', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    ax.post.mockResolvedValue({ data: { ok: true } });
    process.env.updatesChannel = '-1003980548286';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendBotNotice('pppl', { title: 'x' });
    expect((ax.post.mock.calls[0] as any[])[1].chat_id).toBe('-1003980548286');
    await sendBotNotice('pppl', { title: 'x' }, { chatId: '-5', token: 'mine' });
    expect((ax.post.mock.calls[1] as any[])[0]).toContain('botmine/sendRichMessage');
    expect((ax.post.mock.calls[1] as any[])[1].chat_id).toBe('-5');
  });

  test('HTTP 400 resends once as a classic sendMessage (HTML) with the same token and chat', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    ax.post.mockRejectedValueOnce(httpError(400)).mockResolvedValueOnce({ data: { ok: true } });
    const res = await sendBotNotice('notif', { title: 'Plain text A&B', fields: [{ label: 'Status', value: 'ok', code: false }] });
    expect(res.sent).toBe(true);
    expect(ax.post).toHaveBeenCalledTimes(2);
    const [url, body] = ax.post.mock.calls[1] as any[];
    expect(url).toBe('https://api.telegram.org/bottok1/sendMessage');
    expect(body.chat_id).toBe('-1001801844217');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('Plain text A&amp;B</b>');
    expect(body.text).toContain('<b>Status:</b> ok');
  });

  test('HTTP 404 also falls back; a failed fallback reports not sent without throwing', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    ax.post.mockRejectedValue(httpError(404));
    const res = await sendBotNotice('pppl', { title: 'T', fields: [{ label: 'K', value: 'v' }] });
    expect(res.sent).toBe(false);
    expect(ax.post).toHaveBeenCalledTimes(2);
    expect((ax.post.mock.calls[1] as any[])[0]).toMatch(/\/sendMessage$/);
  });

  test('network error / 429: single attempt, no fallback, never throws', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    ax.post.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    expect((await sendBotNotice('notif', { title: 'x' })).sent).toBe(false);
    ax.post.mockRejectedValue(httpError(429));
    expect((await sendBotNotice('notif', { title: 'x' })).sent).toBe(false);
    expect(ax.post).toHaveBeenCalledTimes(2); // one attempt each, no classic resend
  });

  const rejection = (status: number, description: string) => Object.assign(new Error('x'), { response: { status, data: { ok: false, description } } });

  test('2026-11-23 review: a token/chat rejection (PEER_ID_INVALID) tries the next token of the same rotation once', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ax.post.mockRejectedValueOnce(rejection(400, 'Bad Request: PEER_ID_INVALID')).mockResolvedValueOnce({ data: { ok: true } });
    const res = await sendBotNotice('notif', { title: 'x' });
    expect(res.sent).toBe(true);
    expect(ax.post.mock.calls.map((c: any[]) => c[0])).toEqual([
      'https://api.telegram.org/bottok1/sendRichMessage',
      'https://api.telegram.org/bottok2/sendRichMessage',
    ]);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining('[bot-notice] kind=retry_next_token target=notif')]);
    warn.mockRestore();
  });

  test('2026-11-23 review: pppl to the CLIENT_UPDATES channel retries with its next CLIENT_UPDATES bot; both rejected logs all_tokens_failed', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES = '-100777::CLIENT_UPDATES::11:cuA,22:cuB';
    delete process.env.updatesChannel;
    ax.post.mockRejectedValue(rejection(403, 'Forbidden: bot is not a member of the channel chat'));
    const res = await sendBotNotice('pppl', { title: 'x' });
    expect(res.sent).toBe(false);
    expect(ax.post.mock.calls.map((c: any[]) => c[0])).toEqual([
      'https://api.telegram.org/bot11:cuA/sendRichMessage',
      'https://api.telegram.org/bot22:cuB/sendRichMessage',
    ]);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines[0]).toContain('kind=retry_next_token target=pppl chat=-100777 failed_bot=11 next_bot=22');
    expect(lines[1]).toContain('kind=all_tokens_failed reason=rejected');
    expect(lines.join(' ')).not.toMatch(/cuA|cuB/);
    warn.mockRestore();
  });

  test('2026-11-23 review: an explicit token is never swapped; a payload 400 still falls back with the same token', async () => {
    const ax = require('axios') as jest.Mocked<typeof axios>;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    ax.post.mockRejectedValueOnce(rejection(401, 'Unauthorized'));
    expect((await sendBotNotice('notif', { title: 'x' }, { token: 'mine' })).sent).toBe(false);
    expect(ax.post).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('kind=all_tokens_failed reason=explicit_token');
    warn.mockRestore();
  });

  test('missing BOT_TOKENS: skipped without throwing', async () => {
    delete process.env.BOT_TOKENS;
    jest.resetModules();
    const fresh = require('../bot-notice').sendBotNotice;
    expect((await fresh('notif', 'x')).sent).toBe(false);
  });
});
void mockedAxios;
