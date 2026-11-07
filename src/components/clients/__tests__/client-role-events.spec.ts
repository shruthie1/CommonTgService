// accountRoleEvents producers in ClientService (tg-platform docs/design/2026-11-07-account-collection-split.md, S1):
// the cutover (became_main + swapped_out, incl. spam swap / permanent replace reasons and the degraded tier-2
// sibling move), a manual mobile change, the old main's pool return (returned / retired when skipped / returned on
// the transient-failure release). Every write is best-effort: a failing or stalled insert never throws and never
// delays the swap.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../parked-swap-episode', () => ({ openSwapEpisode: jest.fn().mockResolvedValue('inserted') }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn().mockResolvedValue({ data: {} }) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { hasClient: jest.fn(() => false), getClient: jest.fn(), unregisterClient: jest.fn().mockResolvedValue(undefined) },
}));

import { ClientService } from '../client.service';
import { connectionManager } from '../../Telegram/utils/connection-manager';

const OLD = '919000080001';
const NEW = '919000080002';
const existingClient = { clientId: 'shruthi1', mobile: OLD, session: 'old-session', username: 'old_user', name: 'Shruthi', dbcoll: 'shruthi', deployKey: null };
const existingUser = { tgId: 'tg-old-1', mobile: OLD, session: 'backup-session' };

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

function makeService(over: {
  insertOne?: jest.Mock;
  createOrUpdate?: jest.Mock;
  bufferUpdate?: jest.Mock;
  findOneAndUpdate?: jest.Mock;
  current?: Record<string, unknown> | null;
} = {}) {
  const insertOne = over.insertOne ?? jest.fn().mockResolvedValue({ acknowledged: true });
  const roleEvents = { insertOne };
  const other = { insertOne: jest.fn(), find: jest.fn(() => ({ toArray: async () => [] })), updateMany: jest.fn(), findOne: jest.fn() };
  const clientModel: any = {
    db: { collection: jest.fn((name: string) => (name === 'accountRoleEvents' ? roleEvents : other)) },
    findOne: jest.fn(() => ({ lean: () => ({ exec: async () => over.current ?? { mobile: OLD, session: 'old-session' } }) })),
    findOneAndUpdate: over.findOneAndUpdate ?? jest.fn(() => ({ lean: () => ({ exec: async () => ({ ...existingClient, mobile: NEW }) }) })),
  };
  const bufferClientService = {
    update: over.bufferUpdate ?? jest.fn().mockResolvedValue({}),
    createOrUpdate: over.createOrUpdate ?? jest.fn().mockResolvedValue({ clientId: 'shruthi1', status: 'active' }),
    findOne: jest.fn().mockResolvedValue({ mobile: NEW, username: 'new_user', channels: 284 }),
  };
  const usersService = {
    search: jest.fn(async () => [existingUser]),
    expireAccount: jest.fn().mockResolvedValue(undefined),
    findByMobileAnyStatus: jest.fn(async () => [existingUser]),
  };
  const telegramService = {
    updatePrivacyforDeletedAccount: jest.fn().mockResolvedValue(undefined),
    getActiveClientSetup: jest.fn(),
    clearActiveClientSetup: jest.fn(),
  };
  const service: any = new ClientService(clientModel, telegramService as any, bufferClientService as any, usersService as any);
  service.isInitialized = true;
  jest.spyOn(service, 'assertDistinctUserBackupSession').mockResolvedValue(undefined);
  jest.spyOn(service, 'notify').mockResolvedValue(undefined);
  jest.spyOn(service, 'notifyClientUpdate').mockResolvedValue(undefined);
  jest.spyOn(service, 'performPostUpdateTasks').mockImplementation(() => undefined);
  jest.spyOn(service, 'isAlreadyRetired').mockResolvedValue(false);
  jest.spyOn(service, 'prepareNewMainForLive').mockResolvedValue(undefined);
  return { service, insertOne, bufferClientService, usersService, telegramService, clientModel };
}

const events = (insertOne: jest.Mock) => insertOne.mock.calls.map((c) => c[0]);

function setupCutover(service: any, telegramService: any, reason?: string) {
  telegramService.getActiveClientSetup.mockReturnValue({
    archiveOld: true, clientId: 'shruthi1', existingMobile: OLD, formalities: false, newMobile: NEW, reason, days: 3,
  });
  (connectionManager.getClient as jest.Mock).mockResolvedValue({ getMe: async () => ({ username: 'new_user' }) });
  jest.spyOn(service, 'findOne').mockResolvedValue(existingClient);
  jest.spyOn(service, 'handleReplacedClient').mockResolvedValue(undefined);
}

describe('accountRoleEvents: cutover (updateClientSession)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('spam swap: became_main for the new main and swapped_out for the old, with the swap reason', async () => {
    const { service, insertOne, telegramService } = makeService();
    setupCutover(service, telegramService, 'harsh');
    const swappedAt = new Date('2026-11-07T06:30:00.000Z');
    jest.spyOn(service, 'commitClientCutover').mockResolvedValue({ ...existingClient, mobile: NEW, swappedAt });
    await service.updateClientSession('NEW-SESSION', NEW);
    await flush();
    const docs = events(insertOne);
    expect(docs).toHaveLength(2);
    const opId = `shruthi1:${swappedAt.getTime()}`;
    expect(docs[0]).toMatchObject({ v: 1, event: 'became_main', mobile: NEW, clientId: 'shruthi1', pool: 'main', by: 'cms:cutover', reason: 'harsh', reasonCode: 'spam_harsh', opId, fromMobile: OLD });
    expect(docs[1]).toMatchObject({ v: 1, event: 'swapped_out', mobile: OLD, clientId: 'shruthi1', pool: 'main', by: 'cms:cutover', reason: 'harsh', reasonCode: 'spam_harsh', opId, toMobile: NEW });
    // The old main's pool return is linked to the same operation.
    expect(service.handleReplacedClient.mock.calls[0][6]).toMatchObject({ swappedAt });
    expect(docs[0].at).toBeInstanceOf(Date);
    expect(JSON.stringify(docs)).not.toContain('NEW-SESSION');
  });

  it('permanent replace: the reason (e.g. USER_DEACTIVATED) is recorded on both events', async () => {
    const { service, insertOne, telegramService } = makeService();
    setupCutover(service, telegramService, 'USER_DEACTIVATED');
    jest.spyOn(service, 'commitClientCutover').mockResolvedValue({ ...existingClient, mobile: NEW });
    await service.updateClientSession('NEW-SESSION', NEW);
    await flush();
    const docs = events(insertOne);
    expect(docs.map((d) => [d.event, d.reason, d.reasonCode])).toEqual([
      ['became_main', 'USER_DEACTIVATED', 'deactivated_user'], ['swapped_out', 'USER_DEACTIVATED', 'deactivated_user'],
    ]);
    // No swappedAt on the committed doc: one generated opId still links the pair.
    expect(typeof docs[0].opId).toBe('string');
    expect(docs[0].opId.length).toBeGreaterThan(8);
    expect(docs[1].opId).toBe(docs[0].opId);
  });

  it('degraded tier-2 pick: became_main carries the sibling client it came from and the tier', async () => {
    const { service, insertOne, telegramService } = makeService();
    setupCutover(service, telegramService, 'POOL_REFILL');
    service.degradedPlans.set(`shruthi1:${NEW}`, { clientId: 'shruthi1', pickTier: 2, markerTier: 2, fromClientId: 'kavya1', since: new Date(), reason: 'empty pool' });
    jest.spyOn(service, 'commitClientCutover').mockResolvedValue({ ...existingClient, mobile: NEW });
    await service.updateClientSession('NEW-SESSION', NEW);
    await flush();
    expect(events(insertOne)[0]).toMatchObject({ event: 'became_main', fromClientId: 'kavya1', details: { tier: 2 } });
  });

  it('no event when the cutover commit fails', async () => {
    const { service, insertOne, telegramService } = makeService();
    setupCutover(service, telegramService, 'harsh');
    jest.spyOn(service, 'commitClientCutover').mockRejectedValue(new Error('conflict'));
    await expect(service.updateClientSession('NEW-SESSION', NEW)).rejects.toThrow('conflict');
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('a stalled insert never delays the swap; a failing insert never breaks it', async () => {
    for (const insertOne of [jest.fn(() => new Promise(() => {})), jest.fn().mockRejectedValue(new Error('mongo down'))]) {
      const { service, telegramService } = makeService({ insertOne });
      setupCutover(service, telegramService, 'harsh');
      jest.spyOn(service, 'commitClientCutover').mockResolvedValue({ ...existingClient, mobile: NEW });
      expect(await within500(service.updateClientSession('NEW-SESSION', NEW))).toBe('done');
      expect(service.handleReplacedClient).toHaveBeenCalledTimes(1);
    }
  });
});

describe('accountRoleEvents: manual mobile change (update)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a new mobile records became_main + swapped_out by cms:manual-update', async () => {
    const { service, insertOne } = makeService({ current: { mobile: OLD, session: 'old-session' } });
    service.clientsMap.set('shruthi1', existingClient);
    await service.update('shruthi1', { mobile: `+${NEW}` });
    await flush();
    const docs = events(insertOne);
    expect(docs.map((d) => [d.event, d.mobile, d.by, d.fromMobile ?? d.toMobile, d.reasonCode])).toEqual([
      ['became_main', NEW, 'cms:manual-update', OLD, 'manual'],
      ['swapped_out', OLD, 'cms:manual-update', NEW, 'manual'],
    ]);
    expect(typeof docs[0].opId).toBe('string');
    expect(docs[1].opId).toBe(docs[0].opId);
  });

  it('a session-only change or the same mobile records nothing', async () => {
    const { service, insertOne } = makeService({ current: { mobile: OLD, session: 'old-session' } });
    await service.update('shruthi1', { session: 'relogin-session' });
    await service.update('shruthi1', { mobile: OLD });
    await service.update('shruthi1', { name: 'x' });
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe('accountRoleEvents: old main after the cutover (handleReplacedClient)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returned to the pool as active supply: returned, pool buffer, status + days + availableDate', async () => {
    const { service, insertOne } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL');
    await flush();
    const docs = events(insertOne);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ event: 'returned', mobile: OLD, clientId: 'shruthi1', pool: 'buffer', by: 'cms:pool-return', reason: 'POOL_REFILL', reasonCode: 'refill', details: { status: 'active', days: 5 } });
    expect(typeof docs[0].details.availableDate).toBe('string');
    expect(docs[0]).not.toHaveProperty('opId');
  });

  it('with the cutover swappedAt: returned / retired carry the cutover opId (one operation)', async () => {
    const swappedAt = new Date('2026-11-07T06:30:00.000Z');
    const opId = `shruthi1:${swappedAt.getTime()}`;
    const a = makeService();
    await a.service.handleReplacedClient(existingClient, OLD, false, true, 5, 'harsh', { swappedAt, persona: 'shruthi' });
    const b = makeService();
    await b.service.handleReplacedClient(existingClient, OLD, false, false, 5, 'harsh', { swappedAt, persona: 'shruthi' });
    await flush();
    expect(events(a.insertOne)).toEqual([expect.objectContaining({ event: 'returned', opId, reasonCode: 'spam_harsh' })]);
    expect(events(b.insertOne)).toEqual([expect.objectContaining({ event: 'retired', opId, details: { permanent: false } })]);
  });

  it('returned inactive (days > 35) is still a return, with status inactive', async () => {
    const { service, insertOne } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 40, 'POOL_REFILL');
    await flush();
    expect(events(insertOne)[0]).toMatchObject({ event: 'returned', details: { status: 'inactive', days: 40 } });
  });

  it('pool return skipped (archiveOld false): retired, by cms:pool-return-skipped', async () => {
    const { service, insertOne } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, false, 5, 'POOL_REFILL');
    await flush();
    expect(events(insertOne)).toEqual([expect.objectContaining({ event: 'retired', mobile: OLD, pool: 'buffer', by: 'cms:pool-return-skipped', reason: 'POOL_REFILL' })]);
  });

  it('transient return failure: the release back to the pool is recorded as returned (retry)', async () => {
    const { service, insertOne } = makeService({ createOrUpdate: jest.fn().mockRejectedValue(new Error('socket hang up')) });
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL');
    await flush();
    expect(events(insertOne)).toEqual([expect.objectContaining({ event: 'returned', mobile: OLD, by: 'cms:pool-return-retry', details: expect.objectContaining({ status: 'active' }) })]);
  });

  it('transient return failure whose release also fails: nothing recorded', async () => {
    const { service, insertOne } = makeService({
      createOrUpdate: jest.fn().mockRejectedValue(new Error('socket hang up')),
      bufferUpdate: jest.fn().mockRejectedValue(new Error('still down')),
    });
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL');
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('permanent replace: no event here (expireAccount -> updateStatus records retired, see base-client spec)', async () => {
    const { service, insertOne, usersService } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'USER_DEACTIVATED');
    await flush();
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, 'USER_DEACTIVATED');
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('a stalled insert never delays the pool return', async () => {
    const { service } = makeService({ insertOne: jest.fn(() => new Promise(() => {})) });
    expect(await within500(service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL'))).toBe('done');
  });
});

describe('accountRoleEvents: new client (create)', () => {
  function makeCreateService(insertOne: jest.Mock, save: () => Promise<unknown>) {
    const roleEvents = { insertOne };
    const clientModel: any = jest.fn(function (this: any, data: Record<string, unknown>) {
      this.save = async () => { await save(); return { ...data, toObject: () => data }; };
    });
    clientModel.db = { collection: jest.fn(() => roleEvents) };
    const service: any = new ClientService(clientModel, {} as any, {} as any, {} as any);
    return service;
  }

  it('a new client: its first main records became_main (reasonCode manual, by cms:create)', async () => {
    const insertOne = jest.fn().mockResolvedValue({});
    const service = makeCreateService(insertOne, async () => undefined);
    await service.create({ clientId: 'newclient1', mobile: `+${NEW}`, session: 'S' });
    await flush();
    expect(events(insertOne)).toEqual([expect.objectContaining({
      event: 'became_main', mobile: NEW, clientId: 'newclient1', pool: 'main', by: 'cms:create', reasonCode: 'manual',
    })]);
    expect(JSON.stringify(events(insertOne))).not.toContain('"S"');
  });

  it('a failed create records nothing', async () => {
    const insertOne = jest.fn();
    const service = makeCreateService(insertOne, async () => { throw new Error('E11000 clientId'); });
    jest.spyOn(service, 'executeWithRetry').mockImplementation(async (fn: any) => fn());
    await expect(service.create({ clientId: 'newclient1', mobile: NEW, session: 'S' })).rejects.toThrow();
    await flush();
    expect(insertOne).not.toHaveBeenCalled();
  });
});

// S1 re-review fix A1: the old main's `retired` written through the expireAccount cascade carries the cutover opId.
describe('accountRoleEvents: permanent retire of the old main carries the cutover opId', () => {
  const swappedAt = new Date('2026-11-07T10:00:00.000Z');
  const opId = `shruthi1:${swappedAt.getTime()}`;

  it('permanent replace reason: expireAccount gets { opId }', async () => {
    const { service, usersService } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'USER_DEACTIVATED', { swappedAt, persona: 'shruthi' });
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, 'USER_DEACTIVATED', { opId });
  });

  it('user doc missing: expireAccount gets { opId }', async () => {
    const { service, usersService } = makeService();
    usersService.search.mockResolvedValueOnce([]);
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL', { swappedAt, persona: 'shruthi' });
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, expect.stringContaining('user document missing'), { opId });
  });

  it('permanent error while returning (outer catch): expireAccount gets { opId }', async () => {
    const { service, usersService } = makeService();
    usersService.search.mockRejectedValueOnce(new Error('USER_DEACTIVATED_BAN'));
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL', { swappedAt, persona: 'shruthi' });
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, expect.any(String), { opId });
  });

  it('permanent error inside the pool return: expireAccount gets { opId }', async () => {
    const { service, usersService } = makeService({ createOrUpdate: jest.fn().mockRejectedValue(new Error('USER_DEACTIVATED_BAN')) });
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL', { swappedAt, persona: 'shruthi' });
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, expect.any(String), { opId });
  });

  it('no swappedAt (no cutover opId): the 2-argument call is unchanged', async () => {
    const { service, usersService } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'USER_DEACTIVATED');
    expect(usersService.expireAccount).toHaveBeenCalledWith(OLD, 'USER_DEACTIVATED');
    expect(usersService.expireAccount.mock.calls[0]).toHaveLength(2);
  });
});

// S1 re-review fix A2: the pool return asks createOrUpdate not to record `enrolled` when it has to create the doc.
describe('accountRoleEvents: pool return writes only returned', () => {
  it('returnOldClientToBufferPool passes { suppressEnrolledEvent: true } to createOrUpdate', async () => {
    const { service, bufferClientService, insertOne } = makeService();
    await service.handleReplacedClient(existingClient, OLD, false, true, 5, 'POOL_REFILL');
    await flush();
    expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith(OLD, expect.objectContaining({ mobile: OLD }), { suppressEnrolledEvent: true });
    expect(events(insertOne).map((e) => e.event)).toEqual(['returned']);
  });
});
