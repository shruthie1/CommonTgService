// accountHealth producers in CMS (tg-platform docs/design/2026-11-07-account-collection-split.md, S2 + "S2 review
// fixes"): the swap SpamBot probe persist (ClientService.isSpamSafeForSwap) is mirrored; the pool health-check stamps
// (BaseClientService.performHealthCheck) are NOT accountHealth fields any more and write nothing there. Dual-write: the
// existing pool write is unchanged; the mirror is fire-and-forget and never throws or delays.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ sent: true })) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(async () => ({ client: {} })), unregisterClient: jest.fn(async () => undefined), hasClient: jest.fn(() => false) },
}));
jest.mock('../organic-activity', () => ({ ...jest.requireActual('../organic-activity'), performOrganicActivity: jest.fn(async () => undefined) }));
jest.mock('../../../utils/telegram-utils/channelinfo', () => ({ channelInfo: jest.fn(async () => ({ ids: ['a', 'b', 'c'] })) }));
const mockProbe = jest.fn();
jest.mock('../../Telegram/utils/spambot-probe', () => ({
  ...jest.requireActual('../../Telegram/utils/spambot-probe'),
  probeSpamBot: (...a: any[]) => mockProbe(...a),
}));

import { ClientService } from '../../clients/client.service';
import { BaseClientDocument, BaseClientService, ClientConfig } from '../base-client.service';

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function within500(work: Promise<unknown>): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then(() => 'done'),
      new Promise<string>((resolve) => { timer = setTimeout(() => resolve('blocked'), 500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function dbWith(updateOne: jest.Mock) {
  const health = { updateOne };
  const other = { insertOne: jest.fn().mockResolvedValue({}), updateOne: jest.fn() };
  return { collection: jest.fn((name: string) => (name === 'accountHealth' ? health : other)) };
}

describe('accountHealth: CMS swap SpamBot probe (cms:swap-probe)', () => {
  function makeService(updateOne: jest.Mock, bufferUpdate: jest.Mock = jest.fn().mockResolvedValue({})) {
    const clientModel: any = { db: dbWith(updateOne) };
    const bufferClientService: any = { update: bufferUpdate };
    const service: any = new ClientService(clientModel, {} as any, bufferClientService, {} as any);
    return { service, bufferClientService };
  }
  const budget = () => ({ clientId: 'shruthi1', remaining: 3, spentMs: 0, skipped: [] as string[], moreCandidatesPending: false });
  const candidate = { mobile: '919000000021', availableDate: '2026-11-01' };

  beforeEach(() => mockProbe.mockReset());

  it('a definitive verdict is mirrored with verdictAt = the spamCheckedAt of the bufferClients write', async () => {
    const until = new Date('2026-11-10T00:00:00.000Z');
    mockProbe.mockResolvedValue({ status: 'limited', limitedUntil: until });
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 });
    const { service, bufferClientService } = makeService(updateOne);
    await service.isSpamSafeForSwap(candidate, budget(), {});
    await flush();
    const patch = bufferClientService.update.mock.calls[0][1];
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter._id).toBe('919000000021');
    expect(options).toEqual({ upsert: true, maxTimeMS: 2_500 });
    expect(update[0].$set).toMatchObject({
      spamStatus: { $literal: 'limited' }, limitedUntil: until, spamCheckSource: { $literal: 'cms-probe' }, spamCheckBy: { $literal: 'cms:swap-probe' },
    });
    expect(update[0].$set.verdictAt).toEqual(patch.spamCheckedAt);
    expect(update[1]).toEqual({ $unset: ['daysLeft', 'daysLeftBy'] });
  });

  it('an inconclusive probe (unknown) mirrors nothing (the pool doc is not written either)', async () => {
    mockProbe.mockResolvedValue({ status: 'unknown', limitedUntil: null });
    const updateOne = jest.fn();
    const { service, bufferClientService } = makeService(updateOne);
    await service.isSpamSafeForSwap(candidate, budget(), {});
    await flush();
    expect(bufferClientService.update).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('a failing or stalled mirror never throws and never delays the swap decision', async () => {
    for (const updateOne of [jest.fn().mockRejectedValue(new Error('mongo down')), jest.fn(() => new Promise(() => {}))]) {
      mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
      const { service } = makeService(updateOne);
      let result: unknown;
      expect(await within500(service.isSpamSafeForSwap(candidate, budget(), {}).then((r: unknown) => { result = r; }))).toBe('done');
      expect(result).toBe(true);
    }
  });

  it('when the bufferClients write fails, nothing is mirrored (accountHealth never gets ahead of the old field)', async () => {
    mockProbe.mockResolvedValue({ status: 'harsh', limitedUntil: null });
    const updateOne = jest.fn();
    const { service } = makeService(updateOne, jest.fn().mockRejectedValue(new Error('write failed')));
    await service.isSpamSafeForSwap(candidate, budget(), {});
    await flush();
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe('accountHealth: pool health check stamps stay on the pool doc (no cms:health-check producer)', () => {
  class HealthTestService extends BaseClientService<BaseClientDocument> {
    public readonly updateMock: jest.Mock;
    constructor(private readonly mockModel: any, private readonly kind: 'buffer' | 'promote', update?: jest.Mock) {
      super({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { sendMessageByCategory: jest.fn(async () => undefined) } as any, 'HealthTestService');
      this.updateMock = update ?? jest.fn(async (mobile: string, dto: any) => ({ mobile, ...dto }));
    }
    protected otherPoolModel(): any { return null; }
    get model(): any { return this.mockModel; }
    get clientType(): 'buffer' | 'promote' { return this.kind; }
    get config(): ClientConfig { return {} as ClientConfig; }
    async updateUsername(): Promise<number> { return 0; }
    async findOne(mobile: string): Promise<any> { return { mobile, status: 'active' }; }
    async update(mobile: string, dto: any): Promise<any> { return this.updateMock(mobile, dto); }
  }

  it.each(['buffer', 'promote'] as const)('%s: the health check still stamps the pool doc and writes nothing to accountHealth', async (kind) => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 });
    const service = new HealthTestService({ db: dbWith(updateOne) }, kind);
    const result = await (service as any).performHealthCheck('919000000031', 0, Date.now());
    await flush();
    expect(result).toEqual({ passed: true, performed: true });
    expect(service.updateMock.mock.calls[0][1].lastHealthCheckAttemptAt).toBeInstanceOf(Date);
    expect(service.updateMock.mock.calls[1][1].lastChecked).toBeInstanceOf(Date);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('a failing or stalled mirror never throws and never delays the health check', async () => {
    for (const updateOne of [jest.fn().mockRejectedValue(new Error('mongo down')), jest.fn(() => new Promise(() => {}))]) {
      const service = new HealthTestService({ db: dbWith(updateOne) }, 'buffer');
      expect(await within500((service as any).performHealthCheck('919000000033', 0, Date.now()))).toBe('done');
    }
  });
});
