// Account split reader switch, S2 accountHealth (tg-platform docs/design/2026-11-07-account-collection-split.md,
// "Readers to switch"): R7 ClientService.isSpamSafeForSwap (fresh-free probe skip, freshness by verdictAt) and
// R8/R9 readMainState + currentMeetsTier1 (own reader ids, one read). Flag ACCOUNT_HEALTH_READ off | shadow | on.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ sent: true })) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(async () => ({ client: {} })), unregisterClient: jest.fn(async () => undefined), hasClient: jest.fn(() => false) },
}));
const mockProbe = jest.fn();
jest.mock('../../Telegram/utils/spambot-probe', () => ({
  ...jest.requireActual('../../Telegram/utils/spambot-probe'),
  probeSpamBot: (...a: any[]) => mockProbe(...a),
}));

import { ClientService } from '../client.service';
import { WarmupPhase, MIN_CHANNELS_FOR_MATURING } from '../../shared/warmup-phases';
import {
  accountFacetReadMode,
  accountFacetReadStats,
  chooseAccountHealthView,
  flushAccountFacetShadowReads,
  healthViewFromPool,
  resetAccountFacetReadStats,
} from '../../shared/account-facet-read';
import * as facetRead from '../../shared/account-facet-read';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MOBILE = '919000000031';

function healthDb(docs: Record<string, Record<string, unknown>>) {
  const find = jest.fn((filter: any) => ({
    toArray: async () => (filter?._id?.$in ?? []).filter((id: string) => docs[id]).map((id: string) => ({ _id: id, ...docs[id] })),
  }));
  const other = { insertOne: jest.fn().mockResolvedValue({}), updateOne: jest.fn().mockResolvedValue({}), find: jest.fn(() => ({ toArray: async () => [] })) };
  const db = { collection: jest.fn((name: string) => (name === 'accountHealth' ? { find, updateOne: jest.fn().mockResolvedValue({}) } : other)) };
  return { db, find };
}

const saved = { read: process.env.ACCOUNT_HEALTH_READ, readers: process.env.ACCOUNT_HEALTH_READ_READERS };
beforeEach(() => {
  delete process.env.ACCOUNT_HEALTH_READ;
  delete process.env.ACCOUNT_HEALTH_READ_READERS;
  resetAccountFacetReadStats();
  mockProbe.mockReset();
});
afterAll(() => {
  if (saved.read === undefined) delete process.env.ACCOUNT_HEALTH_READ; else process.env.ACCOUNT_HEALTH_READ = saved.read;
  if (saved.readers === undefined) delete process.env.ACCOUNT_HEALTH_READ_READERS; else process.env.ACCOUNT_HEALTH_READ_READERS = saved.readers;
});

describe('R7 isSpamSafeForSwap: fresh free verdict skips the SpamBot probe', () => {
  // Pool doc: free, last checked 2 days ago (stale -> probe). accountHealth: a free verdict 1 h ago (newer).
  const candidate = () => ({ mobile: MOBILE, availableDate: '2026-11-01', spamStatus: 'free', spamCheckedAt: new Date(Date.now() - 2 * DAY) });
  const budget = () => ({ clientId: 'shruthi1', remaining: 3, spentMs: 0, skipped: [] as string[], moreCandidatesPending: false });
  function makeService() {
    const { db, find } = healthDb({ [MOBILE]: { spamStatus: 'free', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - 10 * DAY) } });
    const bufferClientService: any = { update: jest.fn().mockResolvedValue({}) };
    const service: any = new ClientService({ db } as any, {} as any, bufferClientService, {} as any);
    return { service, find };
  }

  it('off: probes as today and never reads accountHealth', async () => {
    mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
    const { service, find } = makeService();
    expect(await service.isSpamSafeForSwap(candidate(), budget(), {})).toBe(true);
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
  });

  it('off: adds no await (the resolver is never called)', async () => {
    mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
    const spy = jest.spyOn(facetRead, 'resolveAccountHealthView');
    try {
      const { service } = makeService();
      expect(await service.isSpamSafeForSwap(candidate(), budget(), {})).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('shadow: probes as today (old value), reads accountHealth and counts the difference', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
    const { service, find } = makeService();
    expect(await service.isSpamSafeForSwap(candidate(), budget(), {})).toBe(true);
    await flushAccountFacetShadowReads();
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R7).toMatchObject({ newerInHealth: 1, differs: 1 });
  });

  it('on: the newer accountHealth verdict is fresh, so no probe', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service, find } = makeService();
    const b = budget() as any;
    expect(await service.isSpamSafeForSwap(candidate(), b, {})).toBe(true);
    expect(mockProbe).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(1);
    expect(b.lastVerdict).toEqual({ status: 'free', limitedUntil: null });
  });

  it('on: freshness uses verdictAt, not the status-change spamCheckedAt (free for months, checked today)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service } = makeService(); // spamCheckedAt 10 d ago, verdictAt 1 h ago
    await service.isSpamSafeForSwap(candidate(), budget(), {});
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it('on: R7 not listed in ACCOUNT_HEALTH_READ_READERS stays off', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'R8';
    mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
    const { service, find } = makeService();
    await service.isSpamSafeForSwap(candidate(), budget(), {});
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
  });

  it('on: a missing accountHealth doc falls back to the pool fields (probe, as today)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    mockProbe.mockResolvedValue({ status: 'free', limitedUntil: null });
    const { db } = healthDb({});
    const service: any = new ClientService({ db } as any, {} as any, { update: jest.fn().mockResolvedValue({}) } as any, {} as any);
    await service.isSpamSafeForSwap(candidate(), budget(), {});
    expect(mockProbe).toHaveBeenCalledTimes(1);
  });
});

describe('R8/R9 readMainState + currentMeetsTier1', () => {
  const client: any = { clientId: 'shruthi1', mobile: MOBILE };
  // Pool doc: free, checked 1 day ago, a tier-1 main otherwise. accountHealth: harsh 1 h ago (e.g. a verdict the pool
  // doc missed).
  const buffer = () => ({
    mobile: MOBILE, clientId: 'shruthi1', status: 'active', warmupPhase: WarmupPhase.SESSION_ROTATED,
    channels: MIN_CHANNELS_FOR_MATURING + 10, createdAt: new Date(Date.now() - 400 * DAY),
    spamStatus: 'free', spamCheckedAt: new Date(Date.now() - DAY), limitedUntil: null,
  });
  function makeService(docs: Record<string, Record<string, unknown>>) {
    const { db, find } = healthDb(docs);
    const bufferClientService: any = { findOne: jest.fn(async () => buffer()) };
    const usersService: any = { findByMobileAnyStatus: jest.fn(async () => [{ expired: false }]) };
    const service: any = new ClientService({ db } as any, {} as any, bufferClientService, usersService);
    return { service, find };
  }
  const harshNow = () => ({ [MOBILE]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) } });

  it('off: today\'s answer (not limited, meets tier 1); accountHealth never read', async () => {
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
    expect(find).not.toHaveBeenCalled();
  });

  it('off: adds no await (the resolver is never called), also when _READERS lists neither R8 nor R9', async () => {
    const spy = jest.spyOn(facetRead, 'resolveAccountHealthViewsByReader');
    try {
      const { service } = makeService(harshNow());
      expect((await service.readMainState(client)).limited).toBe(false);
      process.env.ACCOUNT_HEALTH_READ = 'on';
      process.env.ACCOUNT_HEALTH_READ_READERS = 'R7';
      const state = await service.readMainState(client);
      expect(state.limited).toBe(false);
      expect(service.currentMeetsTier1(client, state)).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('shadow: today\'s answer, the difference is counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    await flushAccountFacetShadowReads();
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R8).toMatchObject({ newerInHealth: 1, differs: 1 });
  });

  it('on: the newer harsh verdict makes the main limited and not tier 1', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service } = makeService(harshNow());
    const state = await service.readMainState(client);
    expect(state.limited).toBe(true);
    expect(service.currentMeetsTier1(client, state)).toBe(false);
  });

  it('on: known gap, an unmirrored PATCH (same time, other status) keeps the pool value', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const b = buffer();
    const { service } = makeService({ [MOBILE]: { spamStatus: 'harsh', verdictAt: b.spamCheckedAt, spamCheckedAt: b.spamCheckedAt } });
    // findOne returns a fresh buffer() each call; pin the same time.
    service.bufferClientService.findOne = jest.fn(async () => b);
    const state = await service.readMainState(client);
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
  });

  it('on: missing doc falls back to the pool fields', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service } = makeService({});
    const state = await service.readMainState(client);
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
  });

  it('on: _READERS=R9 switches only R9 (tier 1 sees harsh; limited stays the pool answer)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'R9';
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(false);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('on: _READERS=R8 switches only R8 (limited sees harsh; tier 1 stays the pool answer)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'R8';
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    expect(state.limited).toBe(true);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('on: R8 and R9 together share ONE accountHealth read; counters per reader', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    expect(state.limited).toBe(true);
    expect(service.currentMeetsTier1(client, state)).toBe(false);
    expect(find).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R8).toMatchObject({ newerInHealth: 1 });
    expect(accountFacetReadStats().health.R9).toMatchObject({ newerInHealth: 1 });
  });

  it('shadow for R8 + R9 (lower-case, semicolon list): one read, today\'s answers, R9 counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'r8; r9';
    const { service, find } = makeService(harshNow());
    const state = await service.readMainState(client);
    await flushAccountFacetShadowReads();
    expect(state.limited).toBe(false);
    expect(service.currentMeetsTier1(client, state)).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R9).toMatchObject({ newerInHealth: 1 });
  });
});

describe('reader allowlist and merge (MIRROR of tg-db; the tg-platform mirror test compares both)', () => {
  it('F1: a set _READERS with no ids enables no reader; unset enables all', () => {
    expect(accountFacetReadMode('health', 'R7', { ACCOUNT_HEALTH_READ: 'on' })).toBe('on');
    for (const readers of ['', ' ', ',', ' , ']) {
      expect(accountFacetReadMode('health', 'R7', { ACCOUNT_HEALTH_READ: 'on', ACCOUNT_HEALTH_READ_READERS: readers })).toBe('off');
    }
  });

  it('F2: ids trimmed, case-insensitive, comma / semicolon / whitespace separated', () => {
    for (const readers of ['r9', ' R9 ', 'R8;R9', 'R8 r9', 'R8,\tR9']) {
      expect(accountFacetReadMode('health', 'R9', { ACCOUNT_HEALTH_READ: 'on', ACCOUNT_HEALTH_READ_READERS: readers })).toBe('on');
    }
    expect(accountFacetReadMode('health', 'R9', { ACCOUNT_HEALTH_READ: 'on', ACCOUNT_HEALTH_READ_READERS: 'R8' })).toBe('off');
  });

  it('F4: same status, newer verdictAt (limited re-verdict) returns the facet values; equal time + other status keeps the pool', () => {
    const t1 = new Date('2026-11-01T00:00:00Z');
    const t2 = new Date('2026-11-07T00:00:00Z');
    const until = new Date('2026-11-10T00:00:00Z');
    const r = chooseAccountHealthView(healthViewFromPool({ spamStatus: 'limited', limitedUntil: new Date('2026-11-03T00:00:00Z'), spamCheckedAt: t1 }),
      { spamStatus: 'limited', limitedUntil: until, verdictAt: t2, spamCheckedAt: t1 });
    expect(r.kind).toBe('newerInHealth');
    expect(r.view.limitedUntilMs).toBe(until.getTime());
    expect(chooseAccountHealthView(healthViewFromPool({ spamStatus: 'harsh', spamCheckedAt: t1 }), { spamStatus: 'free', verdictAt: t1, spamCheckedAt: t1 }).kind).toBe('mismatch');
  });
});

// ---- R3 (buildSpamEligibleFilter candidates), R5 (degraded tiers 3/4), R6 (return availableDate) ----

const candidateDoc = (mobile: string, over: Record<string, unknown> = {}) => ({
  mobile, clientId: 'shruthi1', status: 'active', warmupPhase: WarmupPhase.SESSION_ROTATED,
  channels: MIN_CHANNELS_FOR_MATURING + 10, availableDate: '2026-11-01', spamStatus: 'free', spamCheckedAt: new Date(Date.now() - 2 * DAY), limitedUntil: null, ...over,
});

describe('R3 recheckSpamEligible: drop-only accountHealth re-check of tier-1/2 candidates (old query unchanged)', () => {
  const A = '919000000041';
  const B = '919000000042';
  const C = '919000000043';
  // A: facet harsh 1 h ago (newer) -> dropped. B: facet limited until tomorrow (newer) -> dropped. C: no facet doc -> kept.
  const docs = () => ({
    [A]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) },
    [B]: { spamStatus: 'limited', limitedUntil: new Date(Date.now() + DAY), verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) },
  });
  function makeService() {
    const { db, find } = healthDb(docs());
    const service: any = new ClientService({ db } as any, {} as any, {} as any, {} as any);
    return { service, find };
  }
  const list = () => [candidateDoc(A), candidateDoc(B), candidateDoc(C)];

  it('shadow: every candidate kept (old answer), the facet read is counted under R3', async () => {
    const { service, find } = makeService();
    const kept = await service.recheckSpamEligible('shadow', list());
    await flushAccountFacetShadowReads();
    expect(kept.map((c: any) => c.mobile)).toEqual([A, B, C]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R3).toMatchObject({ newerInHealth: 2, missingInHealth: 1 });
  });

  it('on: drops the candidates a newer facet verdict excludes (harsh within the rest, limit not lifted); keeps the rest in order', async () => {
    const { service } = makeService();
    const kept = await service.recheckSpamEligible('on', list());
    expect(kept.map((c: any) => c.mobile)).toEqual([C]);
  });

  it('on: never adds or reorders; a harsh facet verdict past the 30-day rest and an older facet doc keep the candidate', async () => {
    const { db } = healthDb({
      [A]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - 31 * DAY), spamCheckedAt: new Date(Date.now() - 31 * DAY) },
      [B]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - 3 * DAY), spamCheckedAt: new Date(Date.now() - 3 * DAY) }, // older than the pool's 2 d
    });
    const service: any = new ClientService({ db } as any, {} as any, {} as any, {} as any);
    const kept = await service.recheckSpamEligible('on', [candidateDoc(B), candidateDoc(A)]);
    expect(kept.map((c: any) => c.mobile)).toEqual([B, A]);
  });

  it('on: an accountHealth read error keeps every candidate', async () => {
    const find = jest.fn(() => ({ toArray: async () => { throw new Error('down'); } }));
    const service: any = new ClientService({ db: { collection: jest.fn(() => ({ find })) } } as any, {} as any, {} as any, {} as any);
    expect((await service.recheckSpamEligible('on', list())).length).toBe(3);
  });

  describe('tier 2 sibling spares (findSiblingCandidate) use it', () => {
    function siblingService(env: Record<string, string>) {
      Object.assign(process.env, env);
      const { db, find } = healthDb(docs());
      const bufferClientService: any = { executeQuery: jest.fn(async () => [candidateDoc(A), candidateDoc(B), candidateDoc(C), candidateDoc('919000000044')]) };
      const usersService: any = { findByMobileAnyStatus: jest.fn(async (m: string) => [{ expired: false, twoFA: true, session: `backup-${m}` }]) };
      const service: any = new ClientService({ db } as any, {} as any, bufferClientService, usersService);
      service.findAll = jest.fn(async () => [{ clientId: 'sib1', dbcoll: 'shruthi', mobile: '919000000099' }]);
      const tried: string[][] = [];
      service.findSafeSetupBufferCandidate = jest.fn(async (rows: any[]) => { tried.push(rows.map((r) => r.mobile)); return null; });
      return { service, find, tried };
    }
    const existing = { clientId: 'shruthi1', dbcoll: 'shruthi', mobile: '919000000098', session: 's' };

    it('off: today\'s spares (4 rows), accountHealth never read', async () => {
      const { service, find, tried } = siblingService({});
      await service.findSiblingCandidate(existing, { remaining: 5 }, '2026-11-08', []);
      expect(find).not.toHaveBeenCalled();
      expect(tried[0]).toHaveLength(4 - 2); // SIBLING_MIN_SPARES_AFTER = 2 kept back
    });

    it('on: the facet-excluded spares are dropped before the spare count (fail closed: fewer lenders)', async () => {
      const { service, tried } = siblingService({ ACCOUNT_HEALTH_READ: 'on' });
      await service.findSiblingCandidate(existing, { remaining: 5 }, '2026-11-08', []);
      expect(tried).toEqual([]); // 2 spares left < SIBLING_MIN_SPARES_AFTER + 1
    });
  });
});

describe('R5 findDegradedCandidate tiers 3/4', () => {
  const L1 = '919000000051';
  const L2 = '919000000052';
  const L3 = '919000000053';
  const limitedDoc = (m: string, days: number) => candidateDoc(m, { spamStatus: 'limited', limitedUntil: new Date(Date.now() + days * DAY), spamCheckedAt: new Date(Date.now() - DAY) });
  function tierService(docs: Record<string, Record<string, unknown>>, rows: any[]) {
    const { db, find } = healthDb(docs);
    const bufferClientService: any = { executeQuery: jest.fn(async () => rows) };
    const usersService: any = { findByMobileAnyStatus: jest.fn(async () => [{ expired: false, twoFA: true, session: 'b' }]) };
    const service: any = new ClientService({ db } as any, {} as any, bufferClientService, usersService);
    const tried: string[][] = [];
    service.findSafeSetupBufferCandidate = jest.fn(async (r: any[]) => { tried.push(r.map((x) => x.mobile)); return null; });
    return { service, find, tried };
  }
  const existing = { clientId: 'shruthi1', mobile: '919000000098', session: 's' };
  // Facet: L1 harsh 1 h ago (tier 3 would reject it); L3's limit ends sooner than the pool says (re-verdict).
  const facet = () => ({
    [L1]: { spamStatus: 'harsh', verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) },
    [L3]: { spamStatus: 'limited', limitedUntil: new Date(Date.now() + HOUR), verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) },
  });
  const rows = () => [limitedDoc(L1, 1), limitedDoc(L2, 2), limitedDoc(L3, 3)];

  it('off: tier 3 tries the query order, accountHealth never read', async () => {
    const { service, find, tried } = tierService(facet(), rows());
    await service.findDegradedCandidate(existing, [3], { remaining: 5 }, '2026-11-08', []);
    expect(tried).toEqual([[L1, L2, L3]]);
    expect(find).not.toHaveBeenCalled();
  });

  it('shadow: tier 3 tries the query order; R5 counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { service, tried } = tierService(facet(), rows());
    await service.findDegradedCandidate(existing, [3], { remaining: 5 }, '2026-11-08', []);
    await flushAccountFacetShadowReads();
    expect(tried).toEqual([[L1, L2, L3]]);
    expect(accountFacetReadStats().health.R5).toMatchObject({ newerInHealth: 2, missingInHealth: 1 });
  });

  it('on: tier 3 drops the facet-harsh candidate and orders by the merged limitedUntil (within the scanned rows)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { service, tried } = tierService(facet(), rows());
    await service.findDegradedCandidate(existing, [3], { remaining: 5 }, '2026-11-08', []);
    expect(tried).toEqual([[L3, L2]]);
  });

  it('on: tier 4 is compare-only (tier 4 accepts any verdict): query order, nothing dropped', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const harshRows = [candidateDoc(L1, { spamStatus: 'harsh' }), candidateDoc(L2, { spamStatus: 'harsh' })];
    const { service, tried } = tierService({ [L1]: { spamStatus: 'free', verdictAt: new Date(), spamCheckedAt: new Date() } }, harshRows);
    await service.findDegradedCandidate(existing, [4], { remaining: 5 }, '2026-11-08', []);
    await flushAccountFacetShadowReads();
    expect(tried).toEqual([[L1, L2]]);
    expect(accountFacetReadStats().health.R5).toMatchObject({ newerInHealth: 1 });
  });
});

describe('R6 returnOldClientToBufferPool: availableDate never before a known limit end', () => {
  const OLDM = '919000000061';
  function returnService(docs: Record<string, Record<string, unknown>>, poolDoc: Record<string, unknown>) {
    const { db, find } = healthDb(docs);
    const createOrUpdate = jest.fn(async (_m: string, dto: any) => ({ clientId: 'shruthi1', status: dto.status }));
    const bufferClientService: any = { findOne: jest.fn(async () => poolDoc), createOrUpdate, update: jest.fn(async () => ({})) };
    const service: any = new ClientService({ db } as any, {} as any, bufferClientService, {} as any);
    service.assertDistinctUserBackupSession = jest.fn(async () => undefined);
    service.notify = jest.fn(async () => undefined);
    service.recordRoleEvent = jest.fn();
    return { service, find, createOrUpdate };
  }
  const dateIn = (ms: number) => new Date(Date.now() + ms).toISOString().slice(0, 10);
  const run = async (service: any) => service.returnOldClientToBufferPool({ clientId: 'shruthi1', session: 's' }, { tgId: '1' }, OLDM, 1, 'test', null);
  // Pool: free. accountHealth: limited for 10 days, verdict 1 h ago (newer).
  const facet = () => ({ [OLDM]: { spamStatus: 'limited', limitedUntil: new Date(Date.now() + 10 * DAY), verdictAt: new Date(Date.now() - HOUR), spamCheckedAt: new Date(Date.now() - HOUR) } });
  const pool = () => ({ mobile: OLDM, channels: 300, spamStatus: 'free', spamCheckedAt: new Date(Date.now() - DAY), limitedUntil: null });

  it('off: now + days, accountHealth never read', async () => {
    const { service, find, createOrUpdate } = returnService(facet(), pool());
    await run(service);
    expect(createOrUpdate.mock.calls[0][1].availableDate).toBe(dateIn(DAY));
    expect(find).not.toHaveBeenCalled();
  });

  it('shadow: now + days (old value), R6 counted', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { service, createOrUpdate } = returnService(facet(), pool());
    await run(service);
    await flushAccountFacetShadowReads();
    expect(createOrUpdate.mock.calls[0][1].availableDate).toBe(dateIn(DAY));
    expect(accountFacetReadStats().health.R6).toMatchObject({ newerInHealth: 1 });
  });

  it('on: the newer facet limit pushes availableDate to its end; a missing doc keeps today\'s date', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const on = returnService(facet(), pool());
    await run(on.service);
    expect(on.createOrUpdate.mock.calls[0][1].availableDate).toBe(dateIn(10 * DAY));
    const missing = returnService({}, pool());
    await run(missing.service);
    expect(missing.createOrUpdate.mock.calls[0][1].availableDate).toBe(dateIn(DAY));
  });
});
