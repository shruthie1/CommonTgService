import { Logger } from '@nestjs/common';
import mongoose, { Connection, Model as MongooseModel } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PromoteStatPipelineUpdateError, PromoteStatSchema, stripTgOwnedFromBulkOps, stripTgOwnedPaths } from '../schemas/promote-stat.schema';

/**
 * tg-aut promotion-health cycle (tg-platform 2026-11-20): promoteStats.promoHealthPause (with nested retryBase) is
 * written only by tg-aut through the raw driver, each write conditional on the cycle it read. CMS declares it
 * additively (optional, no default, no validator, Mixed: never cast) and read-only: no CMS model update can write it.
 */
describe('PromoteStat schema: promoHealthPause (tg-written, read-only for CMS)', () => {
  const Model = mongoose.model('PromoteStatPromoHealthSpec', PromoteStatSchema);
  const sample = {
    client: 'c1', data: { ch: 1 }, totalCount: 1, uniqueChannels: 1, releaseDay: 1, isActive: true,
    lastUpdatedTimeStamp: 1, channels: ['ch'],
  };
  const cycle = {
    mobile: '919000000000', pausedAt: 100, until: 1900, failedRetries: 2, retriedAt: 1900,
    retryBase: { proc: '123:abc:def', success: 4, failed: 9 },
  };

  /** The update a CMS model query would send, after Mongoose's own casting and the schema's pre hooks. */
  async function sentUpdate(op: 'updateOne' | 'updateMany' | 'findOneAndUpdate', update: Record<string, unknown>) {
    const query = (Model as any)[op]({ client: 'c1' }, update);
    // Run this schema's own query pre hooks for the op (exec() runs them before sending), then Mongoose's update cast.
    const own = ((PromoteStatSchema as any).s.hooks._pres.get(op) ?? []).filter((hook: any) => hook.fn.name === 'stripTgOwned');
    expect(own).toHaveLength(1);
    for (const hook of own) await hook.fn.call(query);
    return query._castUpdate(query.getUpdate());
  }

  it('declares the path as optional, default-free, validator-free Mixed', () => {
    const schemaType = PromoteStatSchema.path('promoHealthPause') as any;
    expect(schemaType).toBeDefined();
    expect(schemaType.instance).toBe('Mixed');
    expect(schemaType.isRequired).toBeFalsy();
    expect(schemaType.defaultValue).toBeUndefined();
    expect(schemaType.validators).toHaveLength(0);
  });

  it('hydrates a stored cycle (retryBase included) and a null cycle unchanged; validation is unchanged', () => {
    const doc = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, promoHealthPause: cycle });
    expect(doc.toObject().promoHealthPause).toEqual(cycle);
    expect(doc.validateSync()).toBeUndefined();
    const none = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, promoHealthPause: null });
    expect(none.get('promoHealthPause')).toBeNull();
    expect(new Model(sample).validateSync()).toBeUndefined();
    expect(new Model(sample).toObject()).not.toHaveProperty('promoHealthPause');
  });

  it.each(['updateOne', 'updateMany', 'findOneAndUpdate'] as const)('%s: a CMS update cannot write promoHealthPause or a path under it', async (op) => {
    const plain = await sentUpdate(op, { isActive: false, promoHealthPause: null });
    expect(JSON.stringify(plain)).not.toContain('promoHealthPause');
    expect(JSON.stringify(plain)).toContain('isActive');
    const operators = await sentUpdate(op, {
      $set: { isActive: true, 'promoHealthPause.failedRetries': 0, 'promoHealthPause.retryBase': null },
      $unset: { promoHealthPause: 1 },
      $setOnInsert: { promoHealthPause: cycle },
    });
    expect(JSON.stringify(operators)).not.toContain('promoHealthPause');
    expect(JSON.stringify(operators)).toContain('isActive');
  });

  it('stripTgOwnedPaths leaves other fields alone (the daily reset fields, a near-miss name)', () => {
    const update: Record<string, unknown> = {
      $set: { totalCount: 0, uniqueChannels: 0, releaseDay: 1, lastUpdatedTimeStamp: 1, data: {}, promoHealthPauseNote: 'x' },
      mobile: '9',
    };
    stripTgOwnedPaths(update);
    expect(update).toEqual({
      $set: { totalCount: 0, uniqueChannels: 0, releaseDay: 1, lastUpdatedTimeStamp: 1, data: {}, promoHealthPauseNote: 'x' },
      mobile: '9',
    });
  });

  it('batch 5: a $rename from or onto a tg-owned path is stripped and logged; other renames stay', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const update: Record<string, unknown> = {
        $rename: { totalCount: 'promoHealthPause', 'promoHealthPause.until': 'x', channels: 'oldChannels' },
      };
      stripTgOwnedPaths(update);
      expect(update).toEqual({ $rename: { channels: 'oldChannels' } });
      expect(warn.mock.calls.map((c) => String(c[0]))).toContainEqual(
        'promote-stats kind=tg_path_stripped paths=$rename:totalCount->promoHealthPause,$rename:promoHealthPause.until',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('batch 5: an update pipeline is refused with a log line (a pipeline can write any path)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => stripTgOwnedPaths([{ $set: { promoHealthPause: null } }])).toThrow(PromoteStatPipelineUpdateError);
      expect(warn.mock.calls.map((c) => String(c[0]))).toContainEqual('promote-stats kind=pipeline_refused reason=tg_owned_paths');
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * Review finding 5 (2026-11-20): the strip hooks run on every CMS model write path, proven with real queries against
 * mongodb-memory-server: the stored cycle (written by tg through the raw driver) is never changed by a CMS write.
 */
describe('PromoteStat model writes against a real MongoDB: promoHealthPause stays tg-owned', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let Model: MongooseModel<any>;
  const cycle = {
    mobile: '919000000000', pausedAt: 100, until: 1900, failedRetries: 2, retriedAt: 1900,
    retryBase: { proc: '123:abc:def', success: 4, failed: 9, at: 1950 },
  };
  const cmsCycle = { mobile: '9', pausedAt: 1, until: 2, failedRetries: 0, retriedAt: null, retryBase: null };
  const doc = (client: string, extra: Record<string, unknown> = {}) => ({
    client, data: { ch: 1 }, totalCount: 1, uniqueChannels: 1, releaseDay: 1, isActive: true, lastUpdatedTimeStamp: 1, channels: ['ch'], ...extra,
  });
  const raw = () => connection.collection('promoteStats');
  const stored = async (client: string) => raw().findOne({ client });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60_000 } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'promoHealthStrip' }).asPromise();
    Model = connection.model('PromoteStatStripSpec', PromoteStatSchema, 'promoteStats');
  }, 60_000);

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await raw().deleteMany({});
    // tg writes the cycle through the raw driver.
    await raw().insertOne(doc('c1', { promoHealthPause: cycle }));
  });

  it.each([
    ['updateOne', () => Model.updateOne({ client: 'c1' }, { $set: { isActive: false, promoHealthPause: cmsCycle } })],
    ['updateMany', () => Model.updateMany({ client: 'c1' }, { isActive: false, 'promoHealthPause.failedRetries': 0 })],
    ['findOneAndUpdate', () => Model.findOneAndUpdate({ client: 'c1' }, { isActive: false, $unset: { promoHealthPause: 1 } })],
  ])('%s: other fields change, the stored cycle does not', async (_name, run) => {
    await run();
    const row = await stored('c1');
    expect(row?.isActive).toBe(false);
    expect(row?.promoHealthPause).toEqual(cycle);
  });

  it('batch 5: a $rename onto promoHealthPause leaves the stored cycle and the source field as they were', async () => {
    await Model.updateOne({ client: 'c1' }, { $rename: { lastUpdatedTimeStamp: 'promoHealthPause' }, $set: { isActive: false } });
    const row = await stored('c1');
    expect(row?.isActive).toBe(false);
    expect(row?.lastUpdatedTimeStamp).toBe(1);
    expect(row?.promoHealthPause).toEqual(cycle);
  });

  it.each(['updateOne', 'findOneAndUpdate'] as const)('batch 5: %s with an update pipeline (updatePipeline on) is refused; nothing changes', async (op) => {
    const run = op === 'updateOne'
      ? () => Model.updateOne({ client: 'c1' }, [{ $set: { promoHealthPause: null, isActive: false } }], { updatePipeline: true } as any)
      : () => Model.findOneAndUpdate({ client: 'c1' }, [{ $set: { promoHealthPause: null, isActive: false } }], { updatePipeline: true } as any);
    await expect(run()).rejects.toThrow(/update pipelines are refused/);
    const row = await stored('c1');
    expect(row?.isActive).toBe(true);
    expect(row?.promoHealthPause).toEqual(cycle);
  });

  it('bulkWrite: updateOne/updateMany updates cannot touch the cycle; an insertOne document is inserted without one', async () => {
    await Model.bulkWrite([
      { updateOne: { filter: { client: 'c1' }, update: { $set: { isActive: false, promoHealthPause: cmsCycle } } } },
      { updateMany: { filter: { client: 'c1' }, update: { $set: { totalCount: 7, 'promoHealthPause.retriedAt': null } } } },
      { insertOne: { document: doc('c2', { promoHealthPause: cmsCycle }) } },
    ]);
    const row = await stored('c1');
    expect(row?.isActive).toBe(false);
    expect(row?.totalCount).toBe(7);
    expect(row?.promoHealthPause).toEqual(cycle);
    const inserted = await stored('c2');
    expect(inserted).not.toBeNull();
    expect(inserted).not.toHaveProperty('promoHealthPause');
  });

  it.each([
    ['replaceOne', () => Model.replaceOne({ client: 'c1' }, doc('c1', { totalCount: 5, promoHealthPause: cmsCycle }))],
    ['findOneAndReplace', () => Model.findOneAndReplace({ client: 'c1' }, doc('c1', { totalCount: 5, promoHealthPause: cmsCycle }))],
    ['bulkWrite replaceOne', () => Model.bulkWrite([{ replaceOne: { filter: { client: 'c1' }, replacement: doc('c1', { totalCount: 5, promoHealthPause: cmsCycle }) } }])],
  ])('%s: a replacement cannot write a CMS cycle (the replace itself drops the stored one)', async (_name, run) => {
    await run();
    const row = await stored('c1');
    expect(row?.totalCount).toBe(5);
    expect(row).not.toHaveProperty('promoHealthPause');
  });

  it('create / save of a new doc and insertMany never store a cycle', async () => {
    await Model.create(doc('c3', { promoHealthPause: cmsCycle }));
    await new Model(doc('c4', { promoHealthPause: cmsCycle })).save();
    await Model.insertMany([doc('c5', { promoHealthPause: cmsCycle })]);
    for (const client of ['c3', 'c4', 'c5']) {
      const row = await stored(client);
      expect(row).not.toBeNull();
      expect(row).not.toHaveProperty('promoHealthPause');
    }
  });

  it.each([
    ['PUT $set', { $set: { resetRunId: 'other', isActive: false } }],
    ['PUT top-level', { resetRunId: 'other', isActive: false }],
    ['PUT $unset', { $unset: { resetRunId: 1 }, $set: { isActive: false } }],
    ['PUT $rename', { $rename: { resetRunId: 'x' }, $set: { isActive: false } }],
  ])('batch 5 review r1: %s (findOneAndUpdate, the PUT path) cannot change resetRunId', async (_name, update) => {
    await raw().updateOne({ client: 'c1' }, { $set: { resetRunId: 'daily-promote-stats-reset:2026-11-21' } });
    await Model.findOneAndUpdate({ client: 'c1' }, update as any, { returnDocument: 'after' });
    const row = await stored('c1');
    expect(row?.isActive).toBe(false);
    expect(row?.resetRunId).toBe('daily-promote-stats-reset:2026-11-21');
    expect(row).not.toHaveProperty('x');
  });

  it('batch 5 review r1: POST (create) never stores a resetRunId', async () => {
    await Model.create(doc('c6', { resetRunId: 'daily-promote-stats-reset:2026-11-21' }));
    const row = await stored('c6');
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty('resetRunId');
  });

  it('save of an existing doc sends its other changes, never a changed cycle', async () => {
    const loaded = await Model.findOne({ client: 'c1' });
    loaded.set('promoHealthPause', cmsCycle);
    loaded.set('totalCount', 9);
    await loaded.save();
    const row = await stored('c1');
    expect(row?.totalCount).toBe(9);
    expect(row?.promoHealthPause).toEqual(cycle);
  });

  it('stripTgOwnedFromBulkOps ignores malformed ops and leaves other fields', () => {
    const ops: any[] = [null, { deleteOne: { filter: { client: 'x' } } }, { updateOne: { filter: {}, update: { $set: { a: 1, promoHealthPause: 1 } } } }];
    stripTgOwnedFromBulkOps(ops);
    expect(ops[2].updateOne.update).toEqual({ $set: { a: 1 } });
    expect(() => stripTgOwnedFromBulkOps(undefined)).not.toThrow();
  });
});
