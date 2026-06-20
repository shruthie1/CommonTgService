// Mock the Redis client (true I/O boundary) and the logger.
jest.mock('../redisClient', () => ({
  RedisClient: {
    getObject: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('../logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import { getCredentialsForMobile } from '../tg-apps';
import { RedisClient } from '../redisClient';

const mockedRedis = RedisClient as jest.Mocked<typeof RedisClient>;

const KNOWN_API_IDS = [27919939, 25328268, 12777557, 27565391, 27586636, 29210552];

describe('getCredentialsForMobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns cached credentials without picking new ones', async () => {
    const cached = { apiId: 111, apiHash: 'cachedhash' };
    mockedRedis.getObject.mockResolvedValue(cached);

    const result = await getCredentialsForMobile('919999999999');

    expect(result).toBe(cached);
    expect(mockedRedis.getObject).toHaveBeenCalledWith('tg:credentials:919999999999');
    expect(mockedRedis.set).not.toHaveBeenCalled();
  });

  test('picks a random valid credential and stores it when not cached', async () => {
    mockedRedis.getObject.mockResolvedValue(null);
    mockedRedis.set.mockResolvedValue(undefined as any);

    const result = await getCredentialsForMobile('918888888888');

    expect(KNOWN_API_IDS).toContain(result.apiId);
    expect(typeof result.apiHash).toBe('string');
    expect(result.apiHash.length).toBeGreaterThan(0);
    expect(mockedRedis.set).toHaveBeenCalledWith(
      'tg:credentials:918888888888',
      result,
      24 * 60 * 60 * 60,
    );
  });

  test('passes through a custom ttl', async () => {
    mockedRedis.getObject.mockResolvedValue(null);
    mockedRedis.set.mockResolvedValue(undefined as any);

    await getCredentialsForMobile('917777777777', 100);

    expect(mockedRedis.set).toHaveBeenCalledWith(
      'tg:credentials:917777777777',
      expect.objectContaining({ apiId: expect.any(Number) }),
      100,
    );
  });

  test('selects the first credential set when Math.random is 0', async () => {
    mockedRedis.getObject.mockResolvedValue(null);
    mockedRedis.set.mockResolvedValue(undefined as any);
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = await getCredentialsForMobile('916666666666');

    expect(result.apiId).toBe(KNOWN_API_IDS[0]);
    spy.mockRestore();
  });
});
