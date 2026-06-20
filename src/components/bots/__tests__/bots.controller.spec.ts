import { BotsController } from '../bots.controller';
import { ChannelCategory } from '../bots.service';

function makeService(overrides: any = {}) {
  return {
    createBot: jest.fn().mockResolvedValue({ _id: '1' }),
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
    expect(svc.sendMessageByBotId).toHaveBeenCalledWith('bid', 'hi', undefined);
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
