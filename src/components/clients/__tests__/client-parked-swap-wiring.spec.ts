// P4 wiring (tg-platform design 2026-11-05 §7.3.2): handleReplacedClient opens the parked swap episode for the OLD
// main only after returnOldClientToBufferPool put it back as ACTIVE supply; never on a retire, a skipped/failed
// return, or without the cutover's swappedAt.
jest.mock('../parked-swap-episode', () => ({ openSwapEpisode: jest.fn().mockResolvedValue('inserted') }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn().mockResolvedValue({ data: {} }) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { hasClient: jest.fn(() => false), getClient: jest.fn(), unregisterClient: jest.fn().mockResolvedValue(undefined) },
}));

import { ClientService } from '../client.service';
import { openSwapEpisode } from '../parked-swap-episode';

const SWAPPED_AT = new Date('2026-11-06T06:00:00.000Z');
const existingClient = { clientId: 'shruthi1', mobile: '+919000080001', session: 'old-session', username: 'old_user', dbcoll: 'shruthi', deployKey: null };
const existingUser = { tgId: 'tg-old-1', mobile: '+919000080001', session: 'backup-session' };

function makeService(over: { createOrUpdate?: jest.Mock; users?: any[] } = {}) {
  const parkedCol = { name: 'parkedAccounts' };
  const controlCol = { name: 'parkedControl' };
  const roleEventsCol = { name: 'accountRoleEvents', insertOne: jest.fn().mockResolvedValue({}) };
  const clientModel = { db: { collection: jest.fn((name: string) => (name === 'parkedControl' ? controlCol : name === 'accountRoleEvents' ? roleEventsCol : parkedCol)) } };
  const bufferClientService = {
    update: jest.fn().mockResolvedValue({}),
    createOrUpdate: over.createOrUpdate ?? jest.fn().mockResolvedValue({ clientId: 'shruthi1', status: 'active' }),
    findOne: jest.fn().mockResolvedValue({ mobile: '919000080001', channels: 284 }),
  };
  const usersService = {
    search: jest.fn(async () => over.users ?? [existingUser]),
    expireAccount: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(1),
  };
  const telegramService = { updatePrivacyforDeletedAccount: jest.fn().mockResolvedValue(undefined) };
  const service = new ClientService(clientModel as any, telegramService as any, bufferClientService as any, usersService as any);
  jest.spyOn(service as any, 'assertDistinctUserBackupSession').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'notify').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'isAlreadyRetired').mockResolvedValue(false);
  return { service: service as any, parkedCol, controlCol, roleEventsCol, bufferClientService, usersService };
}

describe('handleReplacedClient → openSwapEpisode (P4)', () => {
  beforeEach(() => (openSwapEpisode as jest.Mock).mockClear());

  it('opens the episode for the OLD main (canonical mobile, clientId, dbcoll, reason, swappedAt) after an active pool return', async () => {
    const { service, parkedCol, controlCol, roleEventsCol } = makeService();
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    expect(openSwapEpisode).toHaveBeenCalledTimes(1);
    const [col, input, opts] = (openSwapEpisode as jest.Mock).mock.calls[0];
    expect(col).toBe(parkedCol);
    // Final review M1: the parkedControl collection is passed so the writer can gate on the kill switch.
    expect(opts.control).toBe(controlCol);
    // Split doc §4.2: accountRoleEvents handle for the parked / unparked events.
    expect(opts.roleEvents).toBe(roleEventsCol);
    expect(input).toEqual({ mobile: '919000080001', clientId: 'shruthi1', persona: 'shruthi', reason: 'POOL_REFILL', swappedAt: SWAPPED_AT, swapDays: 5 });
  });

  it('not on a permanent-reason retire', async () => {
    const { service } = makeService();
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'USER_DEACTIVATED', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    expect(openSwapEpisode).not.toHaveBeenCalled();
  });

  it('not when the pool return is skipped (returnOldToPool=false inactivates the account)', async () => {
    const { service } = makeService();
    await service.handleReplacedClient(existingClient, '+919000080001', false, false, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    expect(openSwapEpisode).not.toHaveBeenCalled();
  });

  it('not when the pool return failed', async () => {
    const { service } = makeService({ createOrUpdate: jest.fn().mockRejectedValue(new Error('mongo down')) });
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    expect(openSwapEpisode).not.toHaveBeenCalled();
  });

  it('not when the account returns inactive (days > 35)', async () => {
    const { service } = makeService();
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 40, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    expect(openSwapEpisode).not.toHaveBeenCalled();
  });

  it('not without the cutover swappedAt (older callers pass 6 args)', async () => {
    const { service } = makeService();
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL');
    expect(openSwapEpisode).not.toHaveBeenCalled();
  });

  it('P4 review nit: does not wait on the episode write (a stalled writer cannot delay the "Swap complete" notice)', async () => {
    (openSwapEpisode as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    const { service } = makeService();
    const outcome = await Promise.race([
      service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' }).then(() => 'returned'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 500)),
    ]);
    expect(outcome).toBe('returned');
    expect(openSwapEpisode).toHaveBeenCalledTimes(1);
  });

  it('a throwing writer never breaks the swap', async () => {
    (openSwapEpisode as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { service } = makeService();
    await expect(service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' })).resolves.toBeUndefined();
  });

  it('Low: a rejecting episode hook is caught and logged (masked mobile), never an unhandled rejection', async () => {
    const { service } = makeService();
    jest.spyOn(service, 'openParkedSwapEpisode').mockRejectedValueOnce(new Error('hook blew up'));
    const warn = jest.spyOn(service.logger, 'warn');
    await service.handleReplacedClient(existingClient, '+919000080001', false, true, 5, 'POOL_REFILL', { swappedAt: SWAPPED_AT, persona: 'shruthi' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith('[shruthi1] Parked swap episode hook rejected; the swap is unaffected', { oldMobile: '••••0001', error: 'hook blew up' });
  });

  it('review M3: the swap-episode hook failure log masks the old mobile', async () => {
    (openSwapEpisode as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { service } = makeService();
    const warn = jest.spyOn(service.logger, 'warn');
    await service.openParkedSwapEpisode('shruthi1', '+919000080001', SWAPPED_AT, 'shruthi', 'POOL_REFILL', 5);
    expect(warn).toHaveBeenCalledWith('[shruthi1] Parked swap episode hook failed; the swap is unaffected', { oldMobile: '••••0001', error: 'boom' });
  });
});

describe('prepareNewMainForLive (review M3)', () => {
  it('a throwing hook logs the new mobile masked', async () => {
    const { service } = makeService();
    service.clientModel.db.collection = jest.fn(() => { throw new Error('no db'); });
    const warn = jest.spyOn(service.logger, 'warn');
    await service.prepareNewMainForLive('shruthi1', '919000080002');
    expect(warn).toHaveBeenCalledWith('[shruthi1] Parked cutover hook failed; continuing the cutover', { newMobile: '••••0002', error: 'no db' });
  });
});
