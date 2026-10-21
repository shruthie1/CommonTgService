import { AppService } from '../app.service';

jest.mock('../utils/bot-notice', () => ({ sendBotNotice: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock('../utils/redisClient', () => ({ RedisClient: { getClient: jest.fn(() => ({})) } }));

const DAY = 24 * 60 * 60 * 1000;

/** getPaymentStats with the other-persona rows given (query1 = paid rows, query2 = all rows). */
async function stats(rows: Array<Record<string, unknown>>) {
  const service: any = Object.assign(Object.create(AppService.prototype), {
    userDataService: {
      executeQuery: jest.fn(async (query: Record<string, unknown>) => ('payAmount' in query ? [] : rows)),
      update: jest.fn().mockResolvedValue(undefined),
    },
    logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
  });
  return service.getPaymentStats('12345', 'own');
}

describe('getPaymentStats canCall: blocked on another persona', () => {
  it('a block on another persona stops the call however old it is (was: only if that row was written in the last 3 days)', async () => {
    const now = Date.now();
    expect((await stats([{ profile: 'other', canReply: 0, lastMsgTimeStamp: now - 10 * DAY, callTime: now - 10 * DAY }])).canCall).toBe(false);
    expect((await stats([{ profile: 'other', canReply: 0, lastMsgTimeStamp: now, callTime: now }])).canCall).toBe(false);
  });

  it('no block on any other persona: canCall stays true', async () => {
    const now = Date.now();
    expect((await stats([{ profile: 'other', canReply: 1, lastMsgTimeStamp: now, callTime: now }])).canCall).toBe(true);
    expect((await stats([])).canCall).toBe(true);
  });
});
