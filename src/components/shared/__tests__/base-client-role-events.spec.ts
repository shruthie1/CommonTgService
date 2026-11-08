// accountRoleEvents producers in the shared pool service (tg-platform docs/design/2026-11-07-account-collection-split.md,
// S1): updateStatus (retired / reactivated; every deactivateClient, markAsInactive and the expireAccount cascade go
// through it, for buffer AND promote) and the warmup READY step. Best-effort: never throws, never delays.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));

import { BaseClientDocument, BaseClientService, ClientConfig, WarmupPhase } from '../base-client.service';
import { Client } from '../../clients';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** 'done' when `work` settles within 500 ms, else 'blocked'; the timer is always cleared (no open handle). */
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

class RoleEventsTestService extends BaseClientService<BaseClientDocument> {
  public readonly updateMock: jest.Mock;
  constructor(private readonly mockModel: any, private readonly kind: 'buffer' | 'promote', update?: jest.Mock) {
    super(
      {} as any,
      { expireAccount: jest.fn(async () => undefined), findByMobileAnyStatus: jest.fn(async () => []) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { sendMessageByCategory: jest.fn(async () => undefined) } as any,
      'RoleEventsTestService',
    );
    this.updateMock = update ?? jest.fn(async (mobile: string, dto: any) => ({ mobile, clientId: 'shruthi1', ...dto }));
  }
  protected otherPoolModel(): any { return null; }
  get model(): any { return this.mockModel; }
  get clientType(): 'buffer' | 'promote' { return this.kind; }
  get config(): ClientConfig { return {} as ClientConfig; }
  async updateUsername(): Promise<number> { return 0; }
  async findOne(mobile: string): Promise<any> { return { mobile, status: 'active', clientId: 'shruthi1' }; }
  async update(mobile: string, dto: any): Promise<any> { return this.updateMock(mobile, dto); }
}

function makeModel(insertOne: jest.Mock = jest.fn().mockResolvedValue({ acknowledged: true })) {
  const roleEvents = { insertOne };
  return { model: { db: { collection: jest.fn((name: string) => (name === 'accountRoleEvents' ? roleEvents : {})) } }, insertOne };
}

const docsOf = (insertOne: jest.Mock) => insertOne.mock.calls.map((c) => c[0]);

describe('accountRoleEvents: updateStatus', () => {
  it.each(['buffer', 'promote'] as const)('%s: inactive records retired with the pool, clientId from the updated doc, and the reason', async (kind) => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, kind);
    await service.updateStatus('919000000011', 'inactive', '[DEAD] USER_DEACTIVATED_BAN');
    await flush();
    expect(docsOf(insertOne)).toEqual([expect.objectContaining({
      v: 1, event: 'retired', mobile: '919000000011', clientId: 'shruthi1', pool: kind, by: 'cms:status', reason: '[DEAD] USER_DEACTIVATED_BAN',
      reasonCode: 'deactivated_user',
    })]);
    // A direct status call does not know whether the cause is permanent: no details.permanent.
    expect(docsOf(insertOne)[0]).not.toHaveProperty('details');
  });

  it('deactivateClient records details.permanent: true for a retirement, false for a temporary deactivation', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer');
    jest.spyOn(service as any, 'expireUserByMobile').mockResolvedValue(undefined);
    await (service as any).deactivateClient('919000000017', 'SESSION_REVOKED', { permanent: true });
    await (service as any).deactivateClient('919000000018', 'flood wait during warmup');
    await flush();
    expect(docsOf(insertOne).map((d) => [d.mobile, d.event, d.details, d.reasonCode])).toEqual([
      ['919000000017', 'retired', { permanent: true }, 'auth_error'],
      ['919000000018', 'retired', { permanent: false }, 'status_change'],
    ]);
  });

  it('active records reactivated', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer');
    await service.markAsActive('919000000012');
    await flush();
    expect(docsOf(insertOne)).toEqual([expect.objectContaining({ event: 'reactivated', mobile: '919000000012', pool: 'buffer', reasonCode: 'status_change' })]);
  });

  it('markAsInactive (the expireAccount cascade) records retired once; a no-op on an already-inactive doc records nothing', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'promote');
    await service.markAsInactive('919000000013', 'User expired');
    jest.spyOn(service, 'findOne').mockResolvedValueOnce({ mobile: '919000000013', status: 'inactive' } as any);
    await service.markAsInactive('919000000013', 'User expired');
    await flush();
    expect(docsOf(insertOne).map((d) => [d.event, d.pool])).toEqual([['retired', 'promote']]);
  });

  it('markAsInactive with a cutover opId (expireAccount cascade from a swap) stamps the retired event with it', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer');
    await service.markAsInactive('919000000019', 'USER_DEACTIVATED', { opId: 'shruthi1:1762509600000' });
    await service.markAsInactive('919000000020', 'User expired');
    await flush();
    expect(docsOf(insertOne).map((d) => [d.mobile, d.event, d.opId])).toEqual([
      ['919000000019', 'retired', 'shruthi1:1762509600000'],
      ['919000000020', 'retired', undefined],
    ]);
  });

  it('a failed status write records nothing (and still rethrows as before)', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer', jest.fn().mockRejectedValue(new Error('write failed')));
    await expect(service.updateStatus('919000000014', 'inactive', 'x')).rejects.toThrow('write failed');
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('a failing or stalled insert never throws and never delays the status write', async () => {
    for (const insertOne of [jest.fn().mockRejectedValue(new Error('mongo down')), jest.fn(() => new Promise(() => {}))]) {
      const { model } = makeModel(insertOne);
      const service = new RoleEventsTestService(model, 'buffer');
      expect(await within500(service.updateStatus('919000000015', 'inactive', 'x'))).toBe('done');
    }
  });

  it('a model without a db handle records nothing and does not throw', async () => {
    const service = new RoleEventsTestService({}, 'buffer');
    await expect(service.updateStatus('919000000016', 'inactive', 'x')).resolves.toBeTruthy();
  });
});

describe('accountRoleEvents: warmup READY', () => {
  const baseDoc = (over: Record<string, unknown> = {}): any => ({
    mobile: '919000000021', clientId: 'shruthi1', status: 'active', inUse: false, warmupPhase: WarmupPhase.MATURING,
    enrolledAt: new Date('2026-10-01'), failedUpdateAttempts: 0, channels: 300, ...over,
  });

  it('advance_to_ready records ready (pool, clientId, by cms:warmup)', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer');
    await service.processClient(baseDoc(), { clientId: 'shruthi1' } as Client, { phase: WarmupPhase.MATURING, action: 'advance_to_ready' } as any);
    await flush();
    expect(docsOf(insertOne)).toEqual([expect.objectContaining({ event: 'ready', mobile: '919000000021', clientId: 'shruthi1', pool: 'buffer', by: 'cms:warmup', reasonCode: 'warmup' })]);
  });

  it('a resolved phase change INTO ready also records ready, exactly once', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'promote');
    await service.processClient(baseDoc(), { clientId: 'shruthi1' } as Client, { phase: WarmupPhase.READY, action: 'wait' } as any);
    await flush();
    expect(docsOf(insertOne).map((d) => [d.event, d.pool])).toEqual([['ready', 'promote']]);
  });

  it('other phase changes record nothing', async () => {
    const { model, insertOne } = makeModel();
    const service = new RoleEventsTestService(model, 'buffer');
    await service.processClient(baseDoc({ warmupPhase: WarmupPhase.SETTLING }), { clientId: 'shruthi1' } as Client, { phase: WarmupPhase.IDENTITY, action: 'wait' } as any);
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe('accountRoleEvents: pool create (POST /bufferclients, /promoteclients and createOrUpdate create branch)', () => {
  // Real create() bodies on a minimal `this`: the pool write, the enrolment lock, the notice; the event goes through
  // the real BaseClientService.recordRoleEvent.
  function fakeThis(insertOne: jest.Mock, kind: 'buffer' | 'promote', fail = false) {
    const roleEvents = { insertOne };
    const save = async (data: Record<string, unknown>) => {
      if (fail) throw new Error('E11000 mobile');
      return { ...data };
    };
    const promoteClientModel: any = jest.fn(function (this: any, data: Record<string, unknown>) { this.save = () => save(data); });
    return {
      clientType: kind,
      model: { db: { collection: jest.fn(() => roleEvents) } },
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      canonicalMobile: (m: string) => m.replace(/^\+/, ''),
      normalizeSessionForWrite: (s: unknown) => (typeof s === 'string' ? s.trim() : undefined),
      withPoolClaimOrRefuse: (_m: string, fn: () => Promise<unknown>) => fn(),
      isMobileEnrolledAnywhere: jest.fn(async () => null),
      sendAccountNotice: jest.fn(async () => true),
      bufferClientModel: { create: jest.fn(save) },
      promoteClientModel,
      recordRoleEvent: (BaseClientService.prototype as any).recordRoleEvent,
      // accountHealth hook (a real private method of BufferClientService, covered by buffer-update-account-health.spec.ts).
      mirrorVerdictToAccountHealth: jest.fn(),
    };
  }

  it.each(['buffer', 'promote'] as const)('%s create records enrolled (pool, clientId, reasonCode enrolment)', async (kind) => {
    const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
    const { PromoteClientService } = await import('../../promote-clients/promote-client.service');
    const insertOne = jest.fn().mockResolvedValue({});
    const self = fakeThis(insertOne, kind);
    const create = (kind === 'buffer' ? BufferClientService : PromoteClientService).prototype.create as any;
    await create.call(self, { mobile: '+919000000141', clientId: 'shruthi1', session: 'S', availableDate: '2026-11-09' });
    await flush();
    expect(docsOf(insertOne)).toEqual([expect.objectContaining({
      event: 'enrolled', mobile: '919000000141', clientId: 'shruthi1', pool: kind, by: `cms:${kind}-create`, reasonCode: 'enrolment',
      details: { availableDate: '2026-11-09', status: 'active' },
    })]);
    expect(JSON.stringify(docsOf(insertOne))).not.toContain('"S"');
  });

  // S1 re-review fix A2: the old main's first return goes through createOrUpdate's create branch; it must write only
  // `returned` (cms:pool-return), not also `enrolled` (cms:buffer-create).
  it('buffer create with suppressEnrolledEvent (the pool return) records nothing; the pool write still happens', async () => {
    const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
    const insertOne = jest.fn().mockResolvedValue({});
    const self = fakeThis(insertOne, 'buffer');
    await (BufferClientService.prototype.create as any).call(self, { mobile: '919000000143', clientId: 'shruthi1', session: 'S' }, { suppressEnrolledEvent: true });
    await flush();
    expect(self.bufferClientModel.create).toHaveBeenCalledTimes(1);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('buffer createOrUpdate passes the option to its create branch only', async () => {
    const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
    const self: any = {
      canonicalMobile: (m: string) => m,
      existsByMobile: jest.fn(async () => false),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    };
    const createOrUpdate = BufferClientService.prototype.createOrUpdate as any;
    await createOrUpdate.call(self, '919000000144', { clientId: 'shruthi1' }, { suppressEnrolledEvent: true });
    expect(self.create).toHaveBeenCalledWith(expect.objectContaining({ mobile: '919000000144' }), { suppressEnrolledEvent: true });
    await createOrUpdate.call(self, '919000000145', { clientId: 'shruthi1' });
    expect(self.create).toHaveBeenLastCalledWith(expect.objectContaining({ mobile: '919000000145' }), undefined);
  });

  it('a failed create records nothing', async () => {
    const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
    const insertOne = jest.fn();
    const self = fakeThis(insertOne, 'buffer', true);
    await expect((BufferClientService.prototype.create as any).call(self, { mobile: '919000000142', session: 'S' })).rejects.toThrow();
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
