import { BotsController } from '../bots.controller';
import { ChannelCategory } from '../channel-category.enum';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBotDto } from '../dto/create-bot.dto';

function makeService(overrides: any = {}) {
  return {
    createBot: jest.fn().mockResolvedValue({ _id: '1' }),
    validateAndReplaceBots: jest.fn().mockResolvedValue({ checked: 0, dryRun: false }),
    getBots: jest.fn().mockResolvedValue([]),
    getBotById: jest.fn().mockResolvedValue({ category: ChannelCategory.PROM_LOGS2 }),
    updateBot: jest.fn().mockResolvedValue({ _id: '1' }),
    deleteBot: jest.fn().mockResolvedValue(undefined),
    sendMessageByBotId: jest.fn().mockResolvedValue(true),
    sendMessageByCategory: jest.fn().mockResolvedValue(true),
    sendPhotoByCategory: jest.fn().mockResolvedValue(true),
    sendVideoByCategory: jest.fn().mockResolvedValue(true),
    sendAudioByCategory: jest.fn().mockResolvedValue(true),
    sendDocumentByCategory: jest.fn().mockResolvedValue(true),
    sendVoiceByCategory: jest.fn().mockResolvedValue(true),
    sendAnimationByCategory: jest.fn().mockResolvedValue(true),
    sendStickerByCategory: jest.fn().mockResolvedValue(true),
    sendMediaGroupByCategory: jest.fn().mockResolvedValue(true),
    getBotStatsByCategory: jest.fn().mockResolvedValue({ totalBots: 1 }),
    ...overrides,
  };
}

describe('BotsController - management', () => {
  test('createBot', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.createBot({ token: 't', category: ChannelCategory.PROM_LOGS2, channelId: '-1' } as any);
    expect(svc.createBot).toHaveBeenCalled();
  });

  test('getBots with and without category', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.getBots(ChannelCategory.PROM_LOGS2);
    await c.getBots();
    expect(svc.getBots).toHaveBeenCalledTimes(2);
  });

  test('validate-and-replace forwards dryRun without requiring async mode', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.validateAndReplace(undefined, 'true');
    expect(svc.validateAndReplaceBots).toHaveBeenCalledWith({ dryRun: true });
  });

  test('async validate-and-replace logs the run result (the reply says to read the logs)', async () => {
    const result = { checked: 3, dryRun: true, proposedActions: ['add a repair admin'], managerCoverage: 'Own repair admin (besides @myvcacc) in 1/2 chats' };
    const svc = makeService({ validateAndReplaceBots: jest.fn().mockResolvedValue(result) });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const c = new BotsController(svc as any);
    expect(await c.validateAndReplace('true', 'true')).toMatchObject({ started: true, mode: 'async', dryRun: true });
    await new Promise(r => setImmediate(r));
    expect(log).toHaveBeenCalledWith(`[BotHealth] run done dryRun=true ${JSON.stringify(result)}`);
    log.mockRestore();
  });

  test('getBotById', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.getBotById('1');
    expect(svc.getBotById).toHaveBeenCalledWith('1');
  });

  test('updateBot', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.updateBot('1', { channelId: 'x' });
    expect(svc.updateBot).toHaveBeenCalledWith('1', { channelId: 'x' });
  });

  test('deleteBot', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.deleteBot('1');
    expect(svc.deleteBot).toHaveBeenCalledWith('1');
  });

  test('getBotStats', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    const r = await c.getBotStats(ChannelCategory.PROM_LOGS2);
    expect(r.totalBots).toBe(1);
  });
});

describe('BotsController - send message routes', () => {
  test('sendMessageByCategory with botId matching category → sendMessageByBotId', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.sendMessageByCategory(ChannelCategory.PROM_LOGS2, 'bid', { message: 'hi', options: undefined } as any);
    // The HTTP body is free-form text: the controller structures it before the (structured-only) service.
    expect(svc.sendMessageByBotId).toHaveBeenCalledWith('bid', expect.objectContaining({ title: 'hi' }), undefined);
  });

  test('sendMessageByCategory with botId category mismatch → throws', async () => {
    const svc = makeService({ getBotById: jest.fn().mockResolvedValue({ category: ChannelCategory.UNVDS }) });
    const c = new BotsController(svc as any);
    await expect(
      c.sendMessageByCategory(ChannelCategory.PROM_LOGS2, 'bid', { message: 'hi' } as any),
    ).rejects.toThrow('does not belong to category');
  });

  test('sendMessageByCategory without botId → sendMessageByCategory', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.sendMessageByCategory(ChannelCategory.PROM_LOGS2, undefined as any, { message: 'hi' } as any);
    expect(svc.sendMessageByCategory).toHaveBeenCalled();
  });

  test('free-form HTTP text is structured: first line title, Key: value lines become fields, HTML decoded', async () => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await c.sendMessageByCategory(ChannelCategory.PROM_LOGS2, undefined as any, { message: '<b>Paid</b>\nAmount: 100', options: { parseMode: 'HTML' } } as any);
    const notice = (svc.sendMessageByCategory as jest.Mock).mock.calls[0][1];
    expect(notice.title).toBe('Paid');
    expect(notice.fields).toEqual([{ label: 'Amount', value: '100', code: false }]);
  });
});

// Parametrized coverage of all media category endpoints (success + mismatch branches)
describe('BotsController - media category routes', () => {
  const cases: Array<[string, string, any]> = [
    ['sendPhotoByCategory', 'sendPhotoByCategory', { photo: 'p' }],
    ['sendVideoByCategory', 'sendVideoByCategory', { video: 'v' }],
    ['sendAudioByCategory', 'sendAudioByCategory', { audio: 'a' }],
    ['sendDocumentByCategory', 'sendDocumentByCategory', { document: 'd' }],
    ['sendVoiceByCategory', 'sendVoiceByCategory', { voice: 'vo' }],
    ['sendAnimationByCategory', 'sendAnimationByCategory', { animation: 'an' }],
    ['sendStickerByCategory', 'sendStickerByCategory', { sticker: 's' }],
    ['sendMediaGroupByCategory', 'sendMediaGroupByCategory', { media: [{ type: 'photo', media: 'p' }] }],
  ];

  test.each(cases)('%s with matching botId calls service', async (method, svcMethod, body) => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await (c as any)[method](ChannelCategory.PROM_LOGS2, 'bid', body);
    expect(svc[svcMethod]).toHaveBeenCalled();
    expect(svc.getBotById).toHaveBeenCalledWith('bid');
  });

  test.each(cases)('%s without botId calls service', async (method, svcMethod, body) => {
    const svc = makeService();
    const c = new BotsController(svc as any);
    await (c as any)[method](ChannelCategory.PROM_LOGS2, undefined, body);
    expect(svc[svcMethod]).toHaveBeenCalled();
  });

  test.each(cases)('%s with botId category mismatch throws', async (method) => {
    const svc = makeService({ getBotById: jest.fn().mockResolvedValue({ category: ChannelCategory.UNVDS }) });
    const c = new BotsController(svc as any);
    await expect((c as any)[method](ChannelCategory.PROM_LOGS2, 'bid', { photo: 'p', video: 'v', audio: 'a', document: 'd', voice: 'vo', animation: 'an', sticker: 's', media: [] })).rejects.toThrow('does not belong to category');
  });
});

describe('BotsController - reconcile-pending input validation', () => {
  const svc = () => makeService({ reconcilePendingAdminBotsNow: jest.fn().mockResolvedValue({ failures: [], proposedActions: [], dryRun: false }) });

  test('rejects a non-numeric or non-positive limit', async () => {
    const s = svc(); const c = new BotsController(s as any);
    await expect(c.reconcilePending('abc')).rejects.toThrow(/limit/);
    await expect(c.reconcilePending('0')).rejects.toThrow(/limit/);
    expect(s.reconcilePendingAdminBotsNow).not.toHaveBeenCalled();
  });

  test('rejects an operator object or unknown category (qs `category[$ne]=x`)', async () => {
    const s = svc(); const c = new BotsController(s as any);
    await expect(c.reconcilePending('3', { $ne: 'x' } as any)).rejects.toThrow(/category/);
    await expect(c.reconcilePending('3', 'NOT_A_CATEGORY')).rejects.toThrow(/category/);
    expect(s.reconcilePendingAdminBotsNow).not.toHaveBeenCalled();
  });

  test('passes a valid category and limit through', async () => {
    const s = svc(); const c = new BotsController(s as any);
    await c.reconcilePending('3', ChannelCategory.VC_NOTIFICATIONS, 'true');
    expect(s.reconcilePendingAdminBotsNow).toHaveBeenCalledWith({ dryRun: true, pendingLimit: 3, pendingCategory: ChannelCategory.VC_NOTIFICATIONS });
  });
});

describe('UNWANTED_UPDATES category (bot channel, same handling as UNVDS)', () => {
  test('reconcile-pending accepts category=UNWANTED_UPDATES', async () => {
    const s = makeService({ reconcilePendingAdminBotsNow: jest.fn().mockResolvedValue({ failures: [], proposedActions: [], dryRun: true }) });
    const c = new BotsController(s as any);
    await c.reconcilePending('1', 'UNWANTED_UPDATES', 'true');
    expect(s.reconcilePendingAdminBotsNow).toHaveBeenCalledWith({ dryRun: true, pendingLimit: 1, pendingCategory: 'UNWANTED_UPDATES' });
  });

  test('POST /bots DTO validation accepts UNWANTED_UPDATES and still rejects unknown categories', async () => {
    const ok = await validate(plainToInstance(CreateBotDto, { token: 't', category: 'UNWANTED_UPDATES', channelId: '-1004464574947' }));
    expect(ok).toHaveLength(0);
    const bad = await validate(plainToInstance(CreateBotDto, { token: 't', category: 'NOT_A_CATEGORY', channelId: '-1' }));
    expect(bad.map(e => e.property)).toEqual(['category']);
  });

  test('existing categories are unchanged (UNWANTED_UPDATES is appended)', () => {
    const values = Object.values(ChannelCategory) as string[];
    expect(values.slice(0, 22)).toEqual([
      'CLIENT_UPDATES', 'USER_WARNINGS', 'VC_WARNINGS', 'USER_REQUESTS', 'VC_NOTIFICATIONS', 'CHANNEL_NOTIFICATIONS',
      'ACCOUNT_NOTIFICATIONS', 'ACCOUNT_LOGIN_FAILURES', 'ACCOUNT_LOGINS', 'PROMOTION_ACCOUNT', 'CLIENT_ACCOUNT',
      'PAYMENT_FAIL_QUERIES', 'FAILED_PAYMENTS', 'WEB_TELEMETRY', 'SAVED_MESSAGES', 'HTTP_FAILURES', 'UNVDS',
      'PROM_LOGS1', 'PROM_LOGS2', 'UNAUTH_CALLS', 'CLIENT_PROMOTIONS_1', 'CLIENT_PROMOTIONS_2',
    ]);
    expect(values).toContain('UNWANTED_UPDATES');
  });
});
