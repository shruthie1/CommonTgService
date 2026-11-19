/**
 * Cutover revalidation (review item 7) and retirement retry over promoteClients (review "Extra").
 *
 * Real: ClientService, BufferClientService ownership methods, the cutover transaction on an in-memory replica set.
 * Faked at the boundary (degraded-swap.fixtures.ts): Telegram, SpamBot probe, notices, users docs.
 *
 * Item 7: a replacement candidate that is retired, or whose session rotates, between selection and the cutover
 * commit must not be reactivated or copied with the stale session. The commit aborts and leaves the row as is.
 * Extra: a retirement whose promoteClients cascade failed must run again on retry.
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
import { CLIENT, MAIN, Fixture, limitedReq, makeFixture } from './degraded-swap.fixtures';

const CAND = '919000917777';

describe('cutover revalidates the candidate; retirement retry checks promoteClients', () => {
  let ctx: MongoTestContext;
  let fx: Fixture;
  const savedAuto = process.env.AUTO_CLIENT_SETUP;

  beforeAll(async () => { ctx = await startMongo('cutoverRevalidation', true); }, 120_000);
  afterAll(async () => {
    if (savedAuto === undefined) delete process.env.AUTO_CLIENT_SETUP; else process.env.AUTO_CLIENT_SETUP = savedAuto;
    if (ctx) await stopMongo(ctx);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProbe.mockReset();
    process.env.AUTO_CLIENT_SETUP = 'true';
    fx = await makeFixture(ctx.connection, {
      probe: mockProbe, notice: sendBotNotice as jest.Mock, fetch: fetchWithTimeout as jest.Mock,
      connection: connectionManager as any,
    });
    await fx.world();
    await fx.addBuffer(CAND);
  });

  /** Run `change` on the candidate row once, after selection registered the setup and before the cutover commit. */
  const changeAfterSelection = (change: Record<string, unknown>) => {
    const original = (connectionManager.getClient as jest.Mock).getMockImplementation()!;
    let done = false;
    (connectionManager.getClient as jest.Mock).mockImplementation(async (mobile: string, ...rest: any[]) => {
      if (!done && mobile === CAND && fx.tg.setups.has(CAND)) {
        done = true;
        await fx.bufferModel.updateOne({ mobile: CAND }, { $set: change });
      }
      return original(mobile, ...rest);
    });
  };

  test('control: an unchanged candidate is swapped in with its selected session', async () => {
    const out = await fx.svc.setupClient(CLIENT, limitedReq());
    expect(out).toMatchObject({ status: 'swapped', newMobile: CAND });
    expect(await fx.client()).toMatchObject({ mobile: CAND, session: `s-${CAND}` });
    expect(await fx.buf(CAND)).toMatchObject({ status: 'active', inUse: true });
  });

  test('a candidate retired after selection is not reactivated or made the main', async () => {
    changeAfterSelection({ status: 'inactive', message: 'retired elsewhere' });
    const out = await fx.svc.setupClient(CLIENT, limitedReq());
    expect(out.swapped).toBe(false);
    expect(await fx.client()).toMatchObject({ mobile: MAIN, session: `main-${MAIN}` });
    expect(await fx.buf(CAND)).toMatchObject({ status: 'inactive', inUse: false, message: 'retired elsewhere' });
    expect(await fx.buf(MAIN)).toMatchObject({ inUse: true });
  });

  test('a candidate whose session changed after selection is not copied with the stale session', async () => {
    changeAfterSelection({ session: `rotated-${CAND}` });
    const out = await fx.svc.setupClient(CLIENT, limitedReq());
    expect(out.swapped).toBe(false);
    const client = await fx.client();
    expect(client).toMatchObject({ mobile: MAIN, session: `main-${MAIN}` });
    const cand = await fx.buf(CAND);
    expect(cand).toMatchObject({ status: 'active', inUse: false, session: `rotated-${CAND}` });
    // Clean abort: the changed candidate is not pushed 3 days out as if it had failed.
    expect(cand.availableDate).toBe('2026-01-01');
  });

  test('retirement retry: users expired + buffer inactive but promoteClients still active -> retire runs again', async () => {
    const OLD = '919000918888';
    fx.users.set(OLD, { mobile: OLD, session: 'x', expired: true });
    await fx.addBuffer(OLD, { status: 'inactive' }, null);
    await ctx.connection.collection('promoteClients').insertOne({ mobile: OLD, status: 'active', clientId: CLIENT });
    await (fx.svc as any).retireReplacedMobile(OLD, 'USER_DEACTIVATED_BAN');
    expect(fx.usersService.expireAccount).toHaveBeenCalledWith(OLD, 'USER_DEACTIVATED_BAN');
  });

  test('retirement retry: every record retired, promoteClients inactive too -> not retired again', async () => {
    const OLD = '919000918889';
    fx.users.set(OLD, { mobile: OLD, session: 'x', expired: true });
    await fx.addBuffer(OLD, { status: 'inactive' }, null);
    await ctx.connection.collection('promoteClients').insertOne({ mobile: OLD, status: 'inactive', clientId: CLIENT });
    await (fx.svc as any).retireReplacedMobile(OLD, 'USER_DEACTIVATED_BAN');
    expect(fx.usersService.expireAccount).not.toHaveBeenCalled();
  });
});
