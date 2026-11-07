/**
 * tg-platform docs/design/2026-11-05-parked-account-responder.md, "P4 verification fixes" item 2 (L1 by tier).
 *
 * A buffer with an OPEN parkedAccounts episode (an old main resting after its swap) is skipped only by the
 * PREFERRED tier (the due scan). The rescue tier (permanent-replacement future fallback) and the degraded tiers
 * (2-4) may pick it: the cutover hook stops the parked pass first. Such a pick is logged. The open-episode read
 * runs ONCE per swap, and its time counts in the probe budget.
 *
 * Real ClientService + replica-set Mongo (degraded-swap fixture); Telegram/SpamBot/notices faked.
 */
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(() => Promise.resolve({ sent: true })) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(), hasClient: jest.fn(() => false), getClientState: jest.fn() },
}));
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(() => Promise.resolve()) }));
const mockProbe = jest.fn();
jest.mock('../../Telegram/utils/spambot-probe', () => ({
  ...jest.requireActual('../../Telegram/utils/spambot-probe'),
  probeSpamBot: (...a: any[]) => mockProbe(...a),
}));

import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { sendBotNotice } from '../../../utils/bot-notice';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';
import { CLIENT, DAY, MAIN, Fixture, deadReq, limited, makeFixture } from './degraded-swap.fixtures';

const PARKED = '919000917001';
const FREE = '919000917002';
const T3 = '919000917003';

describe('parked-episode exclusion by tier (P4 verification fix 2)', () => {
  let ctx: MongoTestContext;
  let fx: Fixture;
  let finds: jest.SpyInstance;
  let warn: jest.SpyInstance;
  const saved = { auto: process.env.AUTO_CLIENT_SETUP, tiers: process.env.DEGRADED_SWAP_TIERS };

  beforeAll(async () => { ctx = await startMongo('parkedL1Tiers', true); }, 120_000);
  afterAll(async () => {
    for (const [k, v] of [['AUTO_CLIENT_SETUP', saved.auto], ['DEGRADED_SWAP_TIERS', saved.tiers]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (ctx) await stopMongo(ctx);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProbe.mockReset();
    process.env.AUTO_CLIENT_SETUP = 'true';
    delete process.env.DEGRADED_SWAP_TIERS;
    fx = await makeFixture(ctx.connection, {
      probe: mockProbe, notice: sendBotNotice as jest.Mock, fetch: fetchWithTimeout as jest.Mock,
      connection: connectionManager as any,
    });
    const episodes = ctx.connection.collection('parkedAccounts');
    await episodes.deleteMany({});
    // Stored with '+' like a pre-canonical row: the match normalises it.
    // Final review M1(b): only an UNEXPIRED open episode excludes (expiresAt vs server $$NOW).
    const expiresAt = new Date(Date.now() + 3 * DAY);
    await episodes.insertMany([
      { _id: 'ep-parked' as any, app: 'tg-aut', mobile: `+${PARKED}`, open: true, expiresAt },
      { _id: 'ep-t3' as any, app: 'tg-aut', mobile: T3, open: true, expiresAt },
      { _id: 'ep-closed' as any, app: 'tg-aut', mobile: FREE, open: null, expiresAt },
    ]);
    // Review M8: episodes exclude only while parkedControl enables their app (tg-aut here).
    const control = ctx.connection.collection('parkedControl');
    await control.deleteMany({});
    await control.insertMany([{ _id: 'global' as any, enabled: true }, { _id: 'tg-aut' as any, enabled: true }]);
    finds = jest.spyOn(fx.clientModel.db.collection('parkedAccounts'), 'find');
    warn = jest.spyOn((fx.svc as any).logger, 'warn');
  });

  const warned = (re: RegExp) => warn.mock.calls.some(([m]) => typeof m === 'string' && re.test(m));

  test('preferred tier: the open-episode buffer is skipped, the free one is used', async () => {
    await fx.world();
    await fx.addBuffer(PARKED, { availableDate: '2025-12-01' }); // sorts first
    await fx.addBuffer(FREE);
    const out = await fx.svc.setupClient(CLIENT, deadReq());
    expect(out).toMatchObject({ swapped: true, newMobile: FREE });
    expect(warned(new RegExp(`Skipping setup candidate ••••${PARKED.slice(-4)}: open parked-responder episode`))).toBe(true);
    expect(finds).toHaveBeenCalledTimes(1);
  });

  test('degraded tier: an open-episode buffer may be picked (logged); one read per swap across all tiers', async () => {
    await fx.world();
    await fx.addBuffer(PARKED); // tier 1 only candidate: excluded there
    await fx.addBuffer(T3, limited(5)); // tier 3, open episode: allowed
    const out = await fx.svc.setupClient(CLIENT, deadReq());
    expect(out).toMatchObject({ swapped: true, newMobile: T3, degradedTier: 3 });
    expect(warned(new RegExp(`Skipping setup candidate ••••${PARKED.slice(-4)}: open parked-responder episode`))).toBe(true);
    expect(warned(new RegExp(`picked ••••${T3.slice(-4)} .*open parked-responder episode`))).toBe(true);
    expect(finds).toHaveBeenCalledTimes(1);
  });

  test('rescue tier (permanent-replacement future fallback): an open-episode buffer may be picked (logged)', async () => {
    await fx.world();
    const future = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    await fx.addBuffer(PARKED, { availableDate: future });
    const out = await fx.svc.setupClient(CLIENT, deadReq());
    expect(out).toMatchObject({ swapped: true, newMobile: PARKED });
    expect((await fx.client()).mobile).toBe(PARKED);
    expect(warned(new RegExp(`picked ••••${PARKED.slice(-4)} .*open parked-responder episode`))).toBe(true);
    expect(finds).toHaveBeenCalledTimes(1);
    expect(MAIN).not.toBe(PARKED);
  });

  test('review M8: tg-aut disabled in parkedControl → its open episode does not exclude the buffer', async () => {
    await ctx.connection.collection('parkedControl').updateOne({ _id: 'tg-aut' as any }, { $set: { enabled: false } });
    await fx.world();
    await fx.addBuffer(PARKED, { availableDate: '2025-12-01' }); // sorts first
    await fx.addBuffer(FREE);
    const out = await fx.svc.setupClient(CLIENT, deadReq());
    expect(out).toMatchObject({ swapped: true, newMobile: PARKED });
    expect(warned(/Skipping setup candidate .*open parked-responder episode/)).toBe(false);
  });
});
