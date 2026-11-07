// Account split reader switch, S2 accountHealth (tg-platform docs/design/2026-11-07-account-collection-split.md,
// "Readers to switch"): R2 buildBufferSupplyPlan -> classifyBufferForCap (R1 is that read's projection) and R4
// adjustSupplyDateForPoolState (R10 is the projection in calculateAvailabilityBasedNeedsForCurrentState that feeds it).
// Flag ACCOUNT_HEALTH_READ off | shadow | on (+ _READERS). Plain fakes, no Mongo.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ sent: true })) }));

import { BufferClientService } from '../buffer-client.service';
import { accountFacetReadStats, flushAccountFacetShadowReads, resetAccountFacetReadStats } from '../../shared/account-facet-read';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MOBILE = '919000000071';

function makeService(poolDocs: Array<Record<string, unknown>>, healthDocs: Record<string, Record<string, unknown>>) {
  const healthFind = jest.fn((filter: any) => ({
    toArray: async () => (filter?._id?.$in ?? []).filter((id: string) => healthDocs[id]).map((id: string) => ({ _id: id, ...healthDocs[id] })),
  }));
  const model: any = {
    find: jest.fn(() => ({ exec: async () => poolDocs })),
    aggregate: jest.fn(async () => []),
    countDocuments: jest.fn(async () => 0),
    db: { collection: jest.fn((name: string) => (name === 'accountHealth' ? { find: healthFind } : { find: jest.fn() })) },
  };
  const clientService: any = { findAll: jest.fn(async () => []) };
  const service: any = new BufferClientService(model, {} as any, {} as any, {} as any, clientService, {} as any, {} as any, {} as any, {} as any);
  return { service, healthFind };
}

const saved = { read: process.env.ACCOUNT_HEALTH_READ, readers: process.env.ACCOUNT_HEALTH_READ_READERS, mode: process.env.BUFFER_SUPPLY_MODE };
beforeEach(() => {
  delete process.env.ACCOUNT_HEALTH_READ;
  delete process.env.ACCOUNT_HEALTH_READ_READERS;
  delete process.env.BUFFER_SUPPLY_MODE;
  resetAccountFacetReadStats();
});
afterAll(() => {
  for (const [k, v] of [['ACCOUNT_HEALTH_READ', saved.read], ['ACCOUNT_HEALTH_READ_READERS', saved.readers], ['BUFFER_SUPPLY_MODE', saved.mode]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('R2 buildBufferSupplyPlan: supply counting (stale_free by the last verdict)', () => {
  // Graduated, above the floor, not in use. Pool: free, last checked 20 days ago (stale_free, freeFreshDays 14).
  // accountHealth: free, verdict 1 h ago (status unchanged for 60 days).
  const pool = () => [{ mobile: MOBILE, clientId: 'c1', status: 'active', warmupPhase: 'ready', channels: 300, inUse: false, failedUpdateAttempts: 0, spamStatus: 'free', spamCheckedAt: new Date(Date.now() - 20 * DAY), limitedUntil: null }];
  const facet = () => ({ [MOBILE]: { spamStatus: 'free', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - 60 * DAY) } });
  async function plan(service: any) {
    jest.spyOn(service, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 0, priority: 1, calculationReason: 'test' } as any);
    const result = await service.buildBufferSupplyPlan([{ clientId: 'c1' }]);
    return result.entries[0];
  }

  it('off: stale_free (pool spamCheckedAt), accountHealth never read', async () => {
    const { service, healthFind } = makeService(pool(), facet());
    const entry = await plan(service);
    expect(entry.excluded).toEqual({ stale_free: 1 });
    expect(entry.countedByKind.usable).toBe(0);
    expect(healthFind).not.toHaveBeenCalled();
  });

  it('shadow: stale_free (old answer), R2 counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { service } = makeService(pool(), facet());
    const entry = await plan(service);
    await flushAccountFacetShadowReads();
    expect(entry.excluded).toEqual({ stale_free: 1 });
    expect(accountFacetReadStats().health.R2).toMatchObject({ newerInHealth: 1 });
  });

  it('on: the newer verdict (verdictAt, not the 60-day-old status change) makes it usable supply', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service } = makeService(pool(), facet());
    const entry = await plan(service);
    expect(entry.countedByKind.usable).toBe(1);
    expect(entry.excluded).toEqual({});
  });

  it('on: a newer harsh verdict excludes it; a missing doc keeps the pool answer', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const harsh = makeService(pool(), { [MOBILE]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) } });
    expect((await plan(harsh.service)).excluded).toEqual({ harsh: 1 });
    const missing = makeService(pool(), {});
    expect((await plan(missing.service)).excluded).toEqual({ stale_free: 1 });
  });

  it('on: legacy supply mode reads no spam fields, so it never reads accountHealth', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.BUFFER_SUPPLY_MODE = 'legacy';
    const { service, healthFind } = makeService(pool(), facet());
    await plan(service);
    expect(healthFind).not.toHaveBeenCalled();
  });

  it('on: _READERS without R2 keeps it off', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'R1,R4';
    const { service, healthFind } = makeService(pool(), facet());
    expect((await plan(service)).excluded).toEqual({ stale_free: 1 });
    expect(healthFind).not.toHaveBeenCalled();
  });
});

describe('R4 adjustSupplyDateForPoolState (via calculateAvailabilityBasedNeedsForCurrentState)', () => {
  // Terminal, above the floor, due. Pool: free 1 day ago. accountHealth: harsh 1 h ago (newer).
  const pool = () => [{ mobile: MOBILE, clientId: 'c1', status: 'active', warmupPhase: 'session_rotated', channels: 300, availableDate: '2026-01-01', spamStatus: 'free', spamCheckedAt: new Date(Date.now() - DAY), limitedUntil: null }];
  const harshNow = () => ({ [MOBILE]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) } });
  async function adjustments(service: any) {
    const info = jest.spyOn(service.logger, 'info').mockImplementation(() => undefined);
    await service.calculateAvailabilityBasedNeedsForCurrentState('c1');
    const call = info.mock.calls.find((c: any[]) => String(c[0]).includes('Supply adjusted for pool state'));
    return call ? (call[1] as any) : null;
  }

  it('off: no adjustment (free), accountHealth never read', async () => {
    const { service, healthFind } = makeService(pool(), harshNow());
    expect(await adjustments(service)).toBeNull();
    expect(healthFind).not.toHaveBeenCalled();
  });

  it('shadow: no adjustment (old answer), R4 counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { service } = makeService(pool(), harshNow());
    expect(await adjustments(service)).toBeNull();
    await flushAccountFacetShadowReads();
    expect(accountFacetReadStats().health.R4).toMatchObject({ newerInHealth: 1 });
  });

  it('on: the newer harsh verdict (rest anchored on the last verdict) drops it from supply', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service } = makeService(pool(), harshNow());
    expect(await adjustments(service)).toMatchObject({ excluded: 1, deferred: 0 });
  });

  it('on: a newer limit defers the account to its lift date; a missing doc changes nothing', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const until = new Date(Date.now() + 5 * DAY);
    const limited = makeService(pool(), { [MOBILE]: { spamStatus: 'limited', limitedUntil: until, verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) } });
    expect(await adjustments(limited.service)).toMatchObject({ excluded: 0, deferred: 1 });
    const missing = makeService(pool(), {});
    expect(await adjustments(missing.service)).toBeNull();
  });
});
