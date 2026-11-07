// S3 snapshot-facet producers in CMS (tg-platform docs/design/2026-11-07-account-collection-split.md, "S3
// implementation"): buffer / promote update() and create(), auto-enrol, set-as, and the re-read hook the cutover uses.
// Each must mirror the AFTER pool doc into the facet collections with the right fields and producer id, and a failing
// or stalled facet write must never throw, delay or change the pool write's result.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(async () => undefined) },
}));
jest.mock('../../../utils/telegram-utils/channelinfo', () => ({ channelInfo: jest.fn(async () => ({ ids: ['a', 'b'] })) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));

import { connectionManager } from '../../Telegram/utils/connection-manager';
import { BaseClientService } from '../base-client.service';
import { mirrorPoolFacetsByQuerySoon } from '../account-pool-facets';
import { enrolPoolClientFromUser, type EnrolmentPort } from '../onboarding/enrolment';
import { setAsPoolClient, type SetAsPort } from '../onboarding/set-as';
import { BUFFER_PROFILE, PROMOTE_PROFILE } from '../onboarding/pool-profile';

const T1 = new Date('2026-11-07T10:00:00.000Z');
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Whatever `work` resolves to within 500 ms, else 'blocked'; the timer is always cleared (no open handle). */
async function within500<T>(work: Promise<T>): Promise<T | 'blocked'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<'blocked'>((resolve) => { timer = setTimeout(() => resolve('blocked'), 500); })]);
  } finally {
    clearTimeout(timer);
  }
}

type FacetMode = 'ok' | 'reject' | 'stall' | 'throw';

/** Only the facet collections fail per `mode`; the pool-claim lock and role events use the same db and stay healthy. */
const FACETS = new Set(['accountWarmup', 'accountMembership', 'accountIdentity']);

/** `db.collection(name)`: one recording mock per collection; facet writes behave per `mode`. */
function facetDb(mode: FacetMode = 'ok') {
  const cols: Record<string, any> = {};
  const collection = jest.fn((name: string) => {
    if (!cols[name]) {
      cols[name] = {
        updateOne: jest.fn(() => {
          if (!FACETS.has(name)) return Promise.resolve({ matchedCount: 1 });
          if (mode === 'reject') return Promise.reject(new Error('mongo down'));
          if (mode === 'stall') return new Promise(() => {});
          if (mode === 'throw') throw new Error('sync boom');
          return Promise.resolve({ matchedCount: 1 });
        }),
        insertOne: jest.fn(async () => ({})),
        createIndex: jest.fn(async () => 'x'),
        findOneAndUpdate: jest.fn(async () => ({})),
        findOne: jest.fn(async () => null),
      };
    }
    return cols[name];
  });
  const writes = (name: string) => (cols[name]?.updateOne.mock.calls ?? []).map((c: any[]) => ({ filter: c[0], update: c[1] }));
  return { db: { collection }, writes };
}

const AFTER = {
  mobile: '919000000301', tgId: '7301', username: 'shru_301', assignedFirstName: 'Shruthi', clientId: 'shruthi1', status: 'active', inUse: false, availableDate: '2026-11-08', lastUsed: T1,
  warmupPhase: 'maturing', warmupJitter: 1, enrolledAt: T1, lastChecked: T1, lastHealthCheckAttemptAt: T1, session: 'SECRET',
  updatedAt: T1,
};

/** A mongoose-like hydrated doc: the hook must use toObject(). */
const hydrated = (doc: Record<string, unknown>) => ({ ...doc, toObject: () => ({ ...doc }) });

function updateThis(kind: 'buffer' | 'promote', mode: FacetMode, after: unknown = hydrated(AFTER)) {
  const facets = facetDb(mode);
  const findOneAndUpdate = jest.fn(() => ({ exec: async () => after }));
  const self: any = {
    clientType: kind,
    model: { db: facets.db },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    canonicalMobile: (m: string) => m.replace(/^\+/, ''),
    normalizeSessionForWrite: (s: unknown) => (typeof s === 'string' ? s.trim() : undefined),
    getStoredActiveSession: jest.fn(async () => 'stored'),
    [kind === 'buffer' ? 'bufferClientModel' : 'promoteClientModel']: { findOneAndUpdate },
    mirrorAccountFacets: (BaseClientService.prototype as any).mirrorAccountFacets,
  };
  return { self, facets, findOneAndUpdate };
}

async function updateFn(kind: 'buffer' | 'promote') {
  const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
  const { PromoteClientService } = await import('../../promote-clients/promote-client.service');
  return (kind === 'buffer' ? BufferClientService : PromoteClientService).prototype.update as any;
}

describe('S3 producers: buffer / promote update() (every base-client flow writes through it)', () => {
  it.each(['buffer', 'promote'] as const)('%s: mirrors the AFTER doc into accountWarmup (_id <pool>:<mobile>, by cms:<pool>-update)', async (kind) => {
    const { self, facets } = updateThis(kind, 'ok');
    const result = await (await updateFn(kind)).call(self, '+919000000301', { lastHealthCheckAttemptAt: T1 });
    expect(result.mobile).toBe('919000000301');
    await flush();
    const [w] = facets.writes('accountWarmup');
    expect(w.filter).toEqual({ _id: `${kind}:919000000301`, $or: [{ sourceUpdatedAt: { $lte: T1 } }, { sourceUpdatedAt: null }] });
    expect(w.update.$set).toMatchObject({
      mobile: '919000000301', pool: kind, warmupPhase: 'maturing', lastChecked: T1, lastHealthCheckAttemptAt: T1, sourceUpdatedAt: T1, by: `cms:${kind}-update`,
    });
    expect(JSON.stringify(w.update)).not.toContain('SECRET');
    const [m] = facets.writes('accountMembership');
    expect(m.filter._id).toBe('919000000301');
    expect(m.update.$set[`pools.${kind}`]).toEqual({
      role: kind, clientId: 'shruthi1', status: 'active', inUse: false, availableDate: '2026-11-08', lastUsed: T1, message: null, sourceUpdatedAt: T1, by: `cms:${kind}-update`,
    });
    const [i] = facets.writes('accountIdentity');
    expect(i.filter._id).toBe('919000000301');
    expect(i.update.$set.profile).toEqual({
      pool: kind, tgId: '7301', username: 'shru_301', assignedFirstName: 'Shruthi', assignedLastName: null, assignedBio: null,
      assignedProfilePics: null, sourceUpdatedAt: T1, by: `cms:${kind}-update`,
    });
  });

  it.each(['buffer', 'promote'] as const)('%s: a failing / stalled / throwing facet write never blocks or changes the result', async (kind) => {
    for (const mode of ['reject', 'stall', 'throw'] as const) {
      const { self } = updateThis(kind, mode);
      const outcome = await within500((await updateFn(kind)).call(self, '919000000301', { lastUsed: T1 }));
      expect(outcome).not.toBe('blocked');
      expect((outcome as any).mobile).toBe('919000000301');
    }
  });

  it('not found: throws as before and mirrors nothing', async () => {
    const { self, facets } = updateThis('buffer', 'ok', null);
    await expect((await updateFn('buffer')).call(self, '919000000301', { lastUsed: T1 })).rejects.toThrow(/not found/);
    await flush();
    expect(facets.writes('accountWarmup')).toHaveLength(0);
  });
});

function createThis(kind: 'buffer' | 'promote', mode: FacetMode) {
  const facets = facetDb(mode);
  const saved = (data: Record<string, unknown>) => hydrated({ ...data, updatedAt: T1 });
  const promoteClientModel: any = jest.fn(function (this: any, data: Record<string, unknown>) { this.save = async () => saved(data); });
  promoteClientModel.findOne = jest.fn(() => ({ lean: () => ({ exec: async () => ({ _id: 'x' }) }) }));
  const self: any = {
    clientType: kind,
    model: { db: facets.db },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    canonicalMobile: (m: string) => m.replace(/^\+/, ''),
    normalizeSessionForWrite: (s: unknown) => (typeof s === 'string' ? s.trim() : undefined),
    withPoolClaimOrRefuse: (_m: string, fn: () => Promise<unknown>) => fn(),
    isMobileEnrolledAnywhere: jest.fn(async () => null),
    sendAccountNotice: jest.fn(async () => true),
    bufferClientModel: { create: jest.fn(async (data: Record<string, unknown>) => saved(data)) },
    promoteClientModel,
    recordRoleEvent: (BaseClientService.prototype as any).recordRoleEvent,
    mirrorAccountFacets: (BaseClientService.prototype as any).mirrorAccountFacets,
  };
  return { self, facets };
}

async function createFn(kind: 'buffer' | 'promote') {
  const { BufferClientService } = await import('../../buffer-clients/buffer-client.service');
  const { PromoteClientService } = await import('../../promote-clients/promote-client.service');
  return (kind === 'buffer' ? BufferClientService : PromoteClientService).prototype.create as any;
}

describe('S3 producers: buffer / promote create()', () => {
  it.each(['buffer', 'promote'] as const)('%s: mirrors the created doc (warmupPhase enrolled), by cms:<pool>-create', async (kind) => {
    const { self, facets } = createThis(kind, 'ok');
    await (await createFn(kind)).call(self, { mobile: '+919000000302', clientId: 'shruthi1', session: 'S', availableDate: '2026-11-09' });
    await flush();
    const [w] = facets.writes('accountWarmup');
    expect(w.filter._id).toBe(`${kind}:919000000302`);
    expect(w.update.$set).toMatchObject({ pool: kind, warmupPhase: 'enrolled', by: `cms:${kind}-create`, sourceUpdatedAt: T1 });
    expect(w.update.$set.enrolledAt).toBeInstanceOf(Date);
    const [m] = facets.writes('accountMembership');
    expect(m.filter._id).toBe('919000000302');
    expect(m.update.$set[`pools.${kind}`]).toMatchObject({ clientId: 'shruthi1', by: `cms:${kind}-create`, sourceUpdatedAt: T1 });
    expect(facets.writes('accountIdentity')[0].update.$set.profile).toMatchObject({ pool: kind, by: `cms:${kind}-create`, sourceUpdatedAt: T1 });
  });

  it.each(['buffer', 'promote'] as const)('%s: a failing / stalled facet write never blocks the create', async (kind) => {
    for (const mode of ['reject', 'stall', 'throw'] as const) {
      const { self } = createThis(kind, mode);
      expect(await within500((await createFn(kind)).call(self, { mobile: '919000000303', clientId: 'shruthi1', session: 'S' }))).not.toBe('blocked');
    }
  });
});

function onboardingModel(mode: FacetMode, after: unknown = hydrated({ ...AFTER, mobile: '919000000304', warmupPhase: 'enrolled' })) {
  const facets = facetDb(mode);
  return {
    facets,
    model: {
      db: facets.db,
      findOneAndUpdate: jest.fn(() => ({ exec: async () => after })),
      aggregate: jest.fn(async () => []),
    },
  };
}

function enrolPort(profile: typeof BUFFER_PROFILE, model: any): EnrolmentPort {
  return {
    profile,
    model,
    logger: { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    usersService: { search: jest.fn(async () => [{ session: 'user-session' }]), expireAccount: jest.fn() },
    canonicalMobile: (m: string) => m,
    isMobileEnrolledAnywhere: jest.fn(async () => null),
    updateUser2FAStatus: jest.fn(),
    sendAccountNotice: jest.fn(async () => true),
    handleError: jest.fn((e: unknown) => ({ message: String(e), status: 500, error: e })),
    safeUnregisterClient: jest.fn(async () => undefined),
    docExtras: () => ({}),
  } as unknown as EnrolmentPort;
}

function setAsPort(profile: typeof BUFFER_PROFILE, model: any): SetAsPort {
  return {
    profile,
    model,
    usersService: {
      search: jest.fn(async () => [{ tgId: 'tg-1', session: 'user-session' }]),
      executeQuery: jest.fn(async () => [{ tgId: 'tg-1' }]),
      expireAccount: jest.fn(),
    },
    clientService: { findAll: jest.fn(async () => [{ clientId: 'shruthi1', mobile: '919999999999' }]) },
    telegramService: { getChannelInfo: jest.fn(async () => ({ ids: ['a'] })) },
    canonicalMobile: (m: string) => m.replace(/^\+/, ''),
    mobilesMatch: (a: string | null | undefined, b: string) => a === b,
    findOne: jest.fn(async () => null),
    otherPoolExistsByMobile: jest.fn(async () => false),
    isMobileEnrolledAnywhere: jest.fn(async () => null),
    withPoolClaimOrRefuse: async <T>(_m: string, fn: () => Promise<T>) => fn(),
    safeUnregisterClient: jest.fn(async () => undefined),
    enrolmentInactiveSince: () => '2026-01-01',
  } as unknown as SetAsPort;
}

describe('S3 producers: auto-enrol and set-as', () => {
  beforeEach(() => {
    (connectionManager.getClient as jest.Mock).mockResolvedValue({ hasPassword: async () => false, client: {} });
  });

  it.each([[BUFFER_PROFILE, 'buffer'], [PROMOTE_PROFILE, 'promote']] as const)('auto-enrol %#: mirrors the AFTER doc, by cms:auto-enrol', async (profile, pool) => {
    const { model, facets } = onboardingModel('ok');
    expect(await enrolPoolClientFromUser(enrolPort(profile, model), { mobile: '919000000304', tgId: 'tg-1' }, 'shruthi1', '2026-11-07')).toBe(true);
    await flush();
    const [w] = facets.writes('accountWarmup');
    expect(w.filter._id).toBe(`${pool}:919000000304`);
    expect(w.update.$set).toMatchObject({ pool, warmupPhase: 'enrolled', by: 'cms:auto-enrol' });
    const [m] = facets.writes('accountMembership');
    expect(m.update.$set[`pools.${pool}`]).toMatchObject({ clientId: 'shruthi1', by: 'cms:auto-enrol' });
    expect(facets.writes('accountIdentity')[0].update.$set.profile).toMatchObject({ pool, by: 'cms:auto-enrol', tgId: '7301' });
  });

  it('set-as: mirrors the AFTER doc, by cms:set-as', async () => {
    const { model, facets } = onboardingModel('ok');
    await setAsPoolClient(setAsPort(PROMOTE_PROFILE, model), '+919000000304', 'shruthi1', '2026-11-08');
    await flush();
    const [w] = facets.writes('accountWarmup');
    expect(w.filter._id).toBe('promote:919000000304');
    expect(w.update.$set.by).toBe('cms:set-as');
    const [m] = facets.writes('accountMembership');
    expect(m.filter._id).toBe('919000000304');
    expect(m.update.$set['pools.promote'].by).toBe('cms:set-as');
    expect(facets.writes('accountIdentity')[0].update.$set.profile).toMatchObject({ pool: 'promote', by: 'cms:set-as' });
  });

  it('a failing / stalled facet write never delays or fails enrolment or set-as', async () => {
    for (const mode of ['reject', 'stall', 'throw'] as const) {
      const a = onboardingModel(mode);
      expect(await within500(enrolPoolClientFromUser(enrolPort(BUFFER_PROFILE, a.model), { mobile: '919000000305', tgId: 'tg-1' }, 'shruthi1'))).toBe(true);
      const b = onboardingModel(mode);
      expect(await within500(setAsPoolClient(setAsPort(BUFFER_PROFILE, b.model), '919000000305', 'shruthi1', '2026-11-08'))).not.toBe('blocked');
    }
  });
});

describe('S3 hook: mirrorPoolFacetsByQuerySoon (the cutover re-read)', () => {
  function readModel(mode: FacetMode, read: 'ok' | 'reject' | 'stall') {
    const facets = facetDb(mode);
    const maxTimeMS = jest.fn();
    const exec = jest.fn(() => {
      if (read === 'reject') return Promise.reject(new Error('read failed'));
      if (read === 'stall') return new Promise(() => {});
      return Promise.resolve([{ ...AFTER, mobile: '919000000306', inUse: true }, { ...AFTER, mobile: '919000000307' }]);
    });
    const find = jest.fn(() => ({ lean: () => ({ maxTimeMS, exec }) }));
    return { facets, model: { db: facets.db, find }, find, maxTimeMS };
  }

  it('reads the matching docs (lean, maxTimeMS) in the background and mirrors each', async () => {
    const { model, facets, find, maxTimeMS } = readModel('ok', 'ok');
    const filter = { $or: [{ clientId: 'shruthi1' }, { mobile: { $in: ['919000000306'] } }] };
    expect(mirrorPoolFacetsByQuerySoon(model, 'buffer', filter, 'cms:cutover')).toBeUndefined();
    await flush();
    await flush();
    expect(find).toHaveBeenCalledWith(filter);
    expect(maxTimeMS).toHaveBeenCalledWith(3_000);
    expect(facets.writes('accountWarmup').map((w: any) => [w.filter._id, w.update.$set.by])).toEqual([
      ['buffer:919000000306', 'cms:cutover'], ['buffer:919000000307', 'cms:cutover'],
    ]);
    expect(facets.writes('accountMembership').map((w: any) => [w.filter._id, w.update.$set['pools.buffer'].role])).toEqual([
      ['919000000306', 'main'], ['919000000307', 'buffer'],
    ]);
    expect(facets.writes('accountIdentity').map((w: any) => [w.filter._id, w.update.$set.profile.by])).toEqual([
      ['919000000306', 'cms:cutover'], ['919000000307', 'cms:cutover'],
    ]);
  });

  it('a failed read is one warn; a stalled read is cut by the deadline; neither throws', async () => {
    const warn = jest.fn();
    const failed = readModel('ok', 'reject');
    mirrorPoolFacetsByQuerySoon(failed.model, 'buffer', {}, 'cms:cutover', { warn });
    await flush();
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    const stalled = readModel('ok', 'stall');
    const warn2 = jest.fn();
    mirrorPoolFacetsByQuerySoon(stalled.model, 'buffer', {}, 'cms:cutover', { warn: warn2 }, 20);
    await new Promise((r) => setTimeout(r, 60));
    expect(warn2).toHaveBeenCalledTimes(1);
    expect(warn2.mock.calls[0][1]).toEqual({ error: expect.stringMatching(/deadline/) });
    expect(() => mirrorPoolFacetsByQuerySoon({ find: () => { throw new Error('x'); } }, 'buffer', {}, 'x')).not.toThrow();
    expect(() => mirrorPoolFacetsByQuerySoon(null, 'buffer', {}, 'x')).not.toThrow();
  });
});
