import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { ClientService } from '../components/clients/client.service';
import { UserDataService } from '../components/user-data/user-data.service';

jest.mock('../utils/bot-notice', () => ({ sendBotNotice: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock('../utils/redisClient', () => ({ RedisClient: { getClient: jest.fn(() => ({})) } }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

/**
 * GET /paymentstats gates paid video calls in vcui (Idle.tsx always sends both chatId and profile,
 * taken from its /:profile/:chatId route). A missing chatId used to reach Mongo as
 * {"profile":{"$exists":true}} — every userData row — and reset stale rows across all users.
 */
describe('GET /paymentstats query params', () => {
  let app: INestApplication;
  const executeQuery = jest.fn();
  const update = jest.fn();

  beforeAll(async () => {
    const appService: any = Object.assign(Object.create(AppService.prototype), {
      userDataService: { executeQuery, update },
      logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
      // Lifecycle hooks start schedulers; this spec only drives the HTTP route.
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
        { provide: ClientService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    executeQuery.mockReset();
    update.mockReset().mockResolvedValue(undefined);
    executeQuery.mockImplementation(async (q: Record<string, unknown>) => {
      if ('payAmount' in q) return [{ profile: 'kavya', chatId: '12345', payAmount: 50 }];
      return [
        { profile: 'kavya', chatId: '12345', canReply: 1, callTime: NOW - DAY, demoGiven: true, secondShow: true, fullShow: false, videos: [1, 1012] },
        { profile: 'nidhi', chatId: '12345', canReply: 0, callTime: NOW - 10 * DAY, lastMsgTimeStamp: NOW - 25 * DAY, videos: [3] },
      ];
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('valid call: response bytes unchanged, both filters scoped to chatId and other personas', async () => {
    const res = await request(app.getHttpServer()).get('/paymentstats?chatId=12345&profile=shruthi');
    expect(res.status).toBe(200);
    // Captured from HEAD (before the param check) — must stay byte-identical.
    expect(res.text).toBe('{"paid":1,"demoGiven":1,"secondShow":1,"fullShow":0,"latestCallTime":1799913600000,"canCall":false,"videos":[1,1012]}');
    expect(executeQuery.mock.calls.map((c) => c[0])).toEqual([
      { chatId: '12345', profile: { $exists: true, $ne: 'shruthi' }, payAmount: { $gte: 10 } },
      { chatId: '12345', profile: { $exists: true, $ne: 'shruthi' } },
    ]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0].slice(0, 2)).toEqual(['nidhi', '12345']);
  });

  it.each([
    ['chatId missing', '/paymentstats?profile=shruthi'],
    ['profile missing', '/paymentstats?chatId=12345'],
    ['both missing', '/paymentstats'],
    ['chatId empty', '/paymentstats?chatId=&profile=shruthi'],
    ['profile empty', '/paymentstats?chatId=12345&profile='],
    ['chatId blank', '/paymentstats?chatId=%20%20&profile=shruthi'],
    ['chatId repeated (array)', '/paymentstats?chatId=1&chatId=2&profile=shruthi'],
  ])('%s: 400 and no userData query or reset', async (_name, url) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(400);
    expect(executeQuery).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * POST /getviddata writes body onto the row (profile|clientId, body.chatId). With chatId missing,
 * mongoose dropped the undefined key and findOneAndUpdate({profile}) overwrote an arbitrary user's row.
 */
describe('POST /getviddata params', () => {
  let app: INestApplication;
  const findOneAndUpdate = jest.fn();
  const findOne = jest.fn();
  const updated = { _id: 'abc', profile: 'shruthi', chatId: '12345', payAmount: 30, videos: [1, 2] };

  beforeAll(async () => {
    const model: any = {
      findOneAndUpdate,
      findOne,
      db: { collection: () => ({ find: () => ({ toArray: async () => [{ clientId: 'shruthi1', dbcoll: 'shruthi' }] }) }) },
    };
    const userDataService = new UserDataService(model);
    const appService: any = Object.assign(Object.create(AppService.prototype), {
      userDataService,
      logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
        { provide: ClientService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findOneAndUpdate.mockReset().mockReturnValue({ lean: () => ({ exec: async () => updated }) });
    findOne.mockReset().mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => null }) }) });
  });

  it('valid call by profile: response bytes unchanged, filter scoped to profile+chatId', async () => {
    const res = await request(app.getHttpServer()).post('/getviddata?profile=shruthi').send({ chatId: '12345', payAmount: 30 });
    expect(res.status).toBe(201);
    expect(res.text).toBe('{"_id":"abc","profile":"shruthi","chatId":"12345","payAmount":30,"videos":[1,2]}');
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ profile: 'shruthi', chatId: '12345' });
    expect(findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { payAmount: 30 } });
  });

  it('valid call by clientId (digits stripped) and numeric chatId: unchanged', async () => {
    const res = await request(app.getHttpServer()).post('/getviddata?clientId=shruthi1').send({ chatId: 12345, demoGiven: true });
    expect(res.status).toBe(201);
    expect(res.text).toBe('{"_id":"abc","profile":"shruthi","chatId":"12345","payAmount":30,"videos":[1,2]}');
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ profile: 'shruthi', chatId: 12345 });
  });

  it.each([
    ['chatId missing', '/getviddata?profile=shruthi', { payAmount: 0 }],
    ['chatId empty', '/getviddata?profile=shruthi', { chatId: '', payAmount: 0 }],
    ['chatId blank', '/getviddata?profile=shruthi', { chatId: '  ', payAmount: 0 }],
    ['chatId null', '/getviddata?profile=shruthi', { chatId: null, payAmount: 0 }],
    ['chatId object', '/getviddata?profile=shruthi', { chatId: { $ne: 'x' }, payAmount: 0 }],
    ['profile and clientId missing', '/getviddata', { chatId: '12345', payAmount: 0 }],
    ['profile empty, clientId digits only', '/getviddata?profile=&clientId=123', { chatId: '12345', payAmount: 0 }],
  ])('%s: 400 and no userData write', async (_name, url, body) => {
    const res = await request(app.getHttpServer()).post(url).send(body);
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
