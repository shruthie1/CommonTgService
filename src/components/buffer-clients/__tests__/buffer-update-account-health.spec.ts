// accountHealth S2 (tg-platform docs/design/2026-11-07-account-collection-split.md): every BufferClientService write
// that carries a spam field (PATCH /bufferclients/:mobile, PUT createOrUpdate, the swap SpamBot probe) mirrors the AFTER
// doc's verdict into accountHealth through ONE helper. Additive: the pool write is unchanged; the mirror is
// fire-and-forget and never throws or delays.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/mock-bot') }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ sent: true })) }));
jest.mock('../../Telegram/utils/connection-manager', () => ({
  connectionManager: { getClient: jest.fn(async () => ({ client: {} })), unregisterClient: jest.fn(async () => undefined), hasClient: jest.fn(() => false) },
}));

import { NotFoundException } from '@nestjs/common';
import { BufferClientService } from '../buffer-client.service';
import { __resetEnrollmentLocks } from '../../shared/enrollment-lock';

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

const M = '919000000041';
const CHECKED = new Date('2026-11-08T06:00:00.000Z');
const UNTIL = new Date('2026-11-12T00:00:00.000Z');

function makeService(opts: { after?: Record<string, unknown> | null; updateOne?: jest.Mock; findOneAndUpdate?: jest.Mock } = {}) {
  const updateOne = opts.updateOne ?? jest.fn().mockResolvedValue({ upsertedCount: 1 });
  const other = { insertOne: jest.fn().mockResolvedValue({}), updateOne: jest.fn().mockResolvedValue({}) };
  const db = { collection: jest.fn((name: string) => (name === 'accountHealth' ? { updateOne } : other)) };
  const after = opts.after === undefined ? { mobile: M } : opts.after;
  const findOneAndUpdate = opts.findOneAndUpdate ?? jest.fn(() => ({ exec: jest.fn(async () => after) }));
  const model: any = {
    db,
    findOneAndUpdate,
    create: jest.fn(async (doc: Record<string, unknown>) => ({ ...doc, toObject() { return { ...doc }; } })),
    findOne: jest.fn(() => ({ exec: jest.fn(async () => null), lean: () => ({ exec: async () => null }) })),
  };
  const service: any = new BufferClientService(
    model, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    { sendMessageByCategory: jest.fn(async () => undefined) } as any,
  );
  service.withPoolClaimOrRefuse = async (_m: string, fn: () => Promise<unknown>) => fn();
  service.isMobileEnrolledAnywhere = async () => null;
  service.sendAccountNotice = jest.fn(async () => true);
  return { service, model, updateOne };
}

describe('BufferClientService: spam-field writes mirror into accountHealth', () => {
  beforeEach(() => __resetEnrollmentLocks?.());

  it('update() with spam fields: one accountHealth write from the AFTER doc, by cms:buffer-update, one $set stage', async () => {
    const after = { mobile: M, spamStatus: 'limited', limitedUntil: UNTIL, spamCheckedAt: CHECKED, spamCheckSource: 'tg-aut' };
    const { service, updateOne } = makeService({ after });
    const doc = await service.update(M, { spamStatus: 'limited', limitedUntil: UNTIL, spamCheckedAt: CHECKED, spamCheckSource: 'tg-aut' });
    await flush();
    expect(doc).toBe(after);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter._id).toBe(M);
    expect(options).toEqual({ upsert: true, maxTimeMS: 2_500 });
    expect(update).toHaveLength(1);
    expect(update[0].$set).toMatchObject({
      spamStatus: { $literal: 'limited' }, limitedUntil: UNTIL, verdictAt: CHECKED,
      spamCheckSource: { $literal: 'tg-aut' }, spamCheckBy: { $literal: 'cms:buffer-update' },
    });
  });

  it('a PATCH of spamStatus only mirrors the AFTER doc (stored spamCheckedAt / source)', async () => {
    const after = { mobile: M, spamStatus: 'harsh', limitedUntil: null, spamCheckedAt: CHECKED, spamCheckSource: 'cms-probe' };
    const { service, updateOne } = makeService({ after });
    await service.update(M, { spamStatus: 'harsh' });
    await flush();
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.calls[0][1][0].$set).toMatchObject({
      spamStatus: { $literal: 'harsh' }, limitedUntil: null, verdictAt: CHECKED, spamCheckSource: { $literal: 'cms-probe' },
    });
  });

  it('an AFTER doc without spamCheckSource falls back to source cms-patch', async () => {
    const { service, updateOne } = makeService({ after: { mobile: M, spamStatus: 'free', spamCheckedAt: CHECKED } });
    await service.update(M, { spamStatus: 'free' });
    await flush();
    expect(updateOne.mock.calls[0][1][0].$set.spamCheckSource).toEqual({ $literal: 'cms-patch' });
  });

  it('an update without a spam key writes nothing to accountHealth', async () => {
    const { service, updateOne } = makeService({ after: { mobile: M, spamStatus: 'free', spamCheckedAt: CHECKED, spamCheckSource: 'tg-aut' } });
    await service.update(M, { channels: 3 });
    await flush();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('not found: throws as before and writes nothing to accountHealth', async () => {
    const { service, updateOne } = makeService({ after: null });
    await expect(service.update(M, { spamStatus: 'free', spamCheckedAt: CHECKED })).rejects.toBeInstanceOf(NotFoundException);
    await flush();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('a failing pool write rejects and writes nothing to accountHealth', async () => {
    const findOneAndUpdate = jest.fn(() => ({ exec: jest.fn(async () => { throw new Error('pool write failed'); }) }));
    const { service, updateOne } = makeService({ findOneAndUpdate });
    await expect(service.update(M, { spamStatus: 'free', spamCheckedAt: CHECKED })).rejects.toThrow('pool write failed');
    await flush();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('an AFTER doc without spamCheckedAt (nothing to guard on) writes nothing', async () => {
    const { service, updateOne } = makeService({ after: { mobile: M, spamStatus: 'free', spamCheckSource: 'tg-aut' } });
    await service.update(M, { spamStatus: 'free' });
    await flush();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('opts.accountHealthBy names the producer (the swap probe passes cms:swap-probe)', async () => {
    const after = { mobile: M, spamStatus: 'free', limitedUntil: null, spamCheckedAt: CHECKED, spamCheckSource: 'cms-probe' };
    const { service, updateOne } = makeService({ after });
    await service.update(M, { spamStatus: 'free', limitedUntil: null, spamCheckedAt: CHECKED, spamCheckSource: 'cms-probe' }, { accountHealthBy: 'cms:swap-probe' });
    await flush();
    expect(updateOne.mock.calls[0][1][0].$set.spamCheckBy).toEqual({ $literal: 'cms:swap-probe' });
  });

  it('a failing or stalled accountHealth write never throws and never delays update()', async () => {
    for (const updateOne of [jest.fn().mockRejectedValue(new Error('mongo down')), jest.fn(() => new Promise(() => {}))]) {
      const after = { mobile: M, spamStatus: 'free', spamCheckedAt: CHECKED, spamCheckSource: 'tg-aut' };
      const { service } = makeService({ after, updateOne });
      let result: unknown;
      expect(await within500(service.update(M, { spamStatus: 'free' }).then((r: unknown) => { result = r; }))).toBe('done');
      expect(result).toBe(after);
      expect(updateOne).toHaveBeenCalledTimes(1);
    }
  });

  it('create() with spam fields mirrors by cms:buffer-create; without, nothing', async () => {
    const withSpam = makeService();
    await withSpam.service.create({
      mobile: M, status: 'inactive', clientId: 'shruthi1', spamStatus: 'harsh', spamCheckedAt: CHECKED, spamCheckSource: 'tg-aut',
    } as any);
    await flush();
    expect(withSpam.updateOne).toHaveBeenCalledTimes(1);
    expect(withSpam.updateOne.mock.calls[0][1][0].$set).toMatchObject({
      spamStatus: { $literal: 'harsh' }, verdictAt: CHECKED, spamCheckBy: { $literal: 'cms:buffer-create' },
    });

    const plain = makeService();
    await plain.service.create({ mobile: '919000000042', status: 'inactive', clientId: 'shruthi1' } as any);
    await flush();
    expect(plain.updateOne).not.toHaveBeenCalled();
  });
});
