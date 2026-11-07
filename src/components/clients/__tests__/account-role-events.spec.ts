// accountRoleEvents writer (tg-platform docs/design/2026-11-07-account-collection-split.md, S1): document shape,
// best-effort contract (never throws, client-side deadline, fire-and-forget never blocks), handle lookup.
import {
  ACCOUNT_ROLE_EVENT_VERSION,
  accountRoleEventsCollectionOf,
  buildAccountRoleEvent,
  classifyRoleEventReason,
  recordAccountRoleEvent,
  recordAccountRoleEventSoon,
  unparkedReasonCode,
} from '../account-role-events';

const AT = new Date('2026-11-07T06:00:00.000Z');

describe('buildAccountRoleEvent', () => {
  it('writes the v1 shape: normalized mobiles, nulls for missing optional scalars, no _id', () => {
    const doc = buildAccountRoleEvent({
      mobile: '+919000000001', clientId: 'shruthi1', event: 'became_main', pool: 'main', by: 'cms:cutover',
      reason: 'POOL_REFILL', fromMobile: '+919000000002', fromClientId: 'kavya1', details: { tier: 2, degraded: true },
    }, AT);
    expect(doc).toEqual({
      v: ACCOUNT_ROLE_EVENT_VERSION, mobile: '919000000001', clientId: 'shruthi1', event: 'became_main', pool: 'main',
      at: AT, by: 'cms:cutover', reason: 'POOL_REFILL', reasonCode: 'refill', fromMobile: '919000000002', fromClientId: 'kavya1',
      details: { tier: 2, degraded: true },
    });
    expect(doc).not.toHaveProperty('_id');
  });

  it('defaults clientId/pool/reason to null and omits empty optional fields', () => {
    expect(buildAccountRoleEvent({ mobile: '919000000001', event: 'retired', by: 'cms:status' }, AT)).toEqual({
      v: 1, mobile: '919000000001', clientId: null, event: 'retired', pool: null, at: AT, by: 'cms:status', reason: null,
      reasonCode: 'other',
    });
  });

  it('opId is stored when given (trimmed) and omitted otherwise', () => {
    const base = { mobile: '919000000001', event: 'became_main' as const, by: 'cms:cutover' };
    expect(buildAccountRoleEvent({ ...base, opId: ' shruthi1:1762495200000 ' }, AT)).toMatchObject({ opId: 'shruthi1:1762495200000' });
    expect(buildAccountRoleEvent({ ...base, opId: '  ' }, AT)).not.toHaveProperty('opId');
    expect(buildAccountRoleEvent({ ...base, opId: null }, AT)).not.toHaveProperty('opId');
  });

  it('reasonCode: an explicit valid code wins; a missing or unknown one is derived from the reason', () => {
    const base = { mobile: '919000000001', event: 'swapped_out' as const, by: 'cms:cutover' };
    expect(buildAccountRoleEvent({ ...base, reason: 'harsh', reasonCode: 'manual' }, AT)!.reasonCode).toBe('manual');
    expect(buildAccountRoleEvent({ ...base, reason: 'harsh', reasonCode: 'bogus' as never }, AT)!.reasonCode).toBe('spam_harsh');
    expect(buildAccountRoleEvent({ ...base, reason: 'USER_DEACTIVATED' }, AT)!.reasonCode).toBe('deactivated_user');
  });

  it('details.permanent (boolean) is kept', () => {
    expect(buildAccountRoleEvent({ mobile: '919000000001', event: 'retired', by: 'cms:status', details: { permanent: false } }, AT)!.details)
      .toEqual({ permanent: false });
  });
});

describe('classifyRoleEventReason', () => {
  it.each([
    ['harsh', 'spam_harsh'],
    ['SpamBot harsh limit (indefinite)', 'spam_harsh'],
    ['limited', 'spam_limited'],
    ['Account limited until 2026-11-10 (3 days)', 'spam_limited'],
    ['USER_DEACTIVATED', 'deactivated_user'],
    ['[DEAD] USER_DEACTIVATED_BAN', 'deactivated_user'],
    ['PHONE_NUMBER_BANNED', 'deactivated_user'],
    ['AUTH_KEY_UNREGISTERED', 'auth_error'],
    ['[DEAD] SESSION_REVOKED', 'auth_error'],
    ['POOL_REFILL', 'refill'],
    ['DEAD_MAIN_RESCUE: USER_DEACTIVATED', 'rescue'],
    ['DEGRADED_UPGRADE', 'other'],
    ['Promotion health check failed: failStreak=9, totalFailed=30', 'other'],
    ['Deactivated during client swap (pool return skipped)', 'other'],
    [null, 'other'],
  ])('%s -> %s', (reason, code) => {
    expect(classifyRoleEventReason(reason)).toBe(code);
  });

  it('uses the fallback when nothing matches', () => {
    expect(classifyRoleEventReason('Enrolled for warmup', 'enrolment')).toBe('enrolment');
    expect(classifyRoleEventReason('harsh', 'status_change')).toBe('spam_harsh');
  });

  it('drops secret-looking detail keys and non-scalar values; truncates a long reason to 200', () => {
    const doc = buildAccountRoleEvent({
      mobile: '919000000001', event: 'returned', by: 'cms:pool-return', reason: 'x'.repeat(500),
      details: { session: 'S', newSession: 'S2', password: 'p', apiToken: 't', days: 5, obj: {} as never, nan: Number.NaN },
    }, AT)!;
    expect(doc.details).toEqual({ days: 5 });
    expect((doc.reason as string).length).toBe(200);
  });

  it('returns null without a usable mobile, event or producer', () => {
    expect(buildAccountRoleEvent({ mobile: '', event: 'retired', by: 'cms:status' }, AT)).toBeNull();
    expect(buildAccountRoleEvent({ mobile: '919000000001', event: 'retired', by: ' ' }, AT)).toBeNull();
    expect(buildAccountRoleEvent({ mobile: '919000000001', event: undefined as never, by: 'cms:x' }, AT)).toBeNull();
  });
});

describe('recordAccountRoleEvent (best-effort)', () => {
  const input = { mobile: '919000000001', clientId: 'c1', event: 'retired' as const, by: 'cms:status' };

  it('inserts once and reports written', async () => {
    const insertOne = jest.fn().mockResolvedValue({ acknowledged: true });
    await expect(recordAccountRoleEvent({ insertOne }, input, { now: () => AT })).resolves.toBe('written');
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0]).toMatchObject({ mobile: '919000000001', event: 'retired', at: AT });
  });

  it('a rejected insert never throws: failed + one warn', async () => {
    const logger = { warn: jest.fn() };
    await expect(recordAccountRoleEvent({ insertOne: jest.fn().mockRejectedValue(new Error('mongo down')) }, input, { logger })).resolves.toBe('failed');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][1]).toEqual({ error: 'mongo down' });
  });

  it('a duplicate of the same operation (E11000) is success: duplicate, no warn', async () => {
    const logger = { warn: jest.fn() };
    const dup = Object.assign(new Error('E11000 duplicate key error collection: accountRoleEvents'), { code: 11000 });
    await expect(recordAccountRoleEvent({ insertOne: jest.fn().mockRejectedValue(dup) }, { ...input, opId: 'op1' }, { logger })).resolves.toBe('duplicate');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('the warn log masks the mobile', async () => {
    const logger = { warn: jest.fn() };
    await recordAccountRoleEvent({ insertOne: jest.fn().mockRejectedValue(new Error('x')) }, input, { logger });
    expect(logger.warn.mock.calls[0][0]).not.toContain('919000000001');
    expect(logger.warn.mock.calls[0][0]).toContain('0001');
  });

  it('a synchronously throwing insert never throws', async () => {
    const insertOne = jest.fn(() => { throw new Error('sync boom'); });
    await expect(recordAccountRoleEvent({ insertOne }, input)).resolves.toBe('failed');
  });

  it('a stalled insert resolves failed at the client-side deadline', async () => {
    const started = Date.now();
    await expect(recordAccountRoleEvent({ insertOne: () => new Promise(() => {}) }, input, { deadlineMs: 50 })).resolves.toBe('failed');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('a throwing logger never throws either', async () => {
    const logger = { warn: () => { throw new Error('logger broken'); } };
    await expect(recordAccountRoleEvent({ insertOne: jest.fn().mockRejectedValue(new Error('x')) }, input, { logger })).resolves.toBe('failed');
  });

  it('no handle or no usable input: skipped, nothing written', async () => {
    await expect(recordAccountRoleEvent(null, input)).resolves.toBe('skipped');
    const insertOne = jest.fn();
    await expect(recordAccountRoleEvent({ insertOne }, { ...input, mobile: '' })).resolves.toBe('skipped');
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe('recordAccountRoleEventSoon', () => {
  it('returns synchronously even when the insert never settles', () => {
    const insertOne = jest.fn(() => new Promise(() => {}));
    expect(recordAccountRoleEventSoon({ insertOne }, { mobile: '919000000001', event: 'returned', by: 'cms:x' }, { deadlineMs: 20 })).toBeUndefined();
    expect(insertOne).toHaveBeenCalledTimes(0); // scheduled on a microtask, not run inline
  });

  it('a rejecting insert produces no unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      recordAccountRoleEventSoon({ insertOne: jest.fn().mockRejectedValue(new Error('boom')) }, { mobile: '919000000001', event: 'returned', by: 'cms:x' });
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('accountRoleEventsCollectionOf', () => {
  it('asks the model db for accountRoleEvents', () => {
    const col = { insertOne: jest.fn() };
    const collection = jest.fn(() => col);
    expect(accountRoleEventsCollectionOf({ db: { collection } })).toBe(col);
    expect(collection).toHaveBeenCalledWith('accountRoleEvents');
  });

  it('null for a model without db, a throwing db, or a handle without insertOne', () => {
    expect(accountRoleEventsCollectionOf({})).toBeNull();
    expect(accountRoleEventsCollectionOf(undefined)).toBeNull();
    expect(accountRoleEventsCollectionOf({ db: { collection: () => { throw new Error('x'); } } })).toBeNull();
    expect(accountRoleEventsCollectionOf({ db: { collection: () => ({}) } })).toBeNull();
  });
});

describe('unparkedReasonCode (MIRROR of tg-platform unparkedReasonCode)', () => {
  it('maps the causes the code set can name, everything else is other', () => {
    expect(unparkedReasonCode('harsh')).toBe('spam_harsh');
    expect(unparkedReasonCode('peer_flood')).toBe('spam_limited');
    expect(unparkedReasonCode('session_missing')).toBe('auth_error');
    expect(unparkedReasonCode('inactive')).toBe('status_change');
    for (const r of ['became_main', 'in_use', 'reassigned', 'reloaded', 'superseded', 'age_expired', 'shared_key', 'flood_cap', 'transient_cap', 'permanent_error', undefined, 7]) {
      expect(unparkedReasonCode(r)).toBe('other');
    }
  });
});
