import { AnalyticsPgReader } from '../analytics-pg.reader';

describe('AnalyticsPgReader', () => {
  const saved = process.env.ANALYTICS_DB_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.ANALYTICS_DB_URL;
    else process.env.ANALYTICS_DB_URL = saved;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('is disabled without ANALYTICS_DB_URL and never touches pg', async () => {
    delete process.env.ANALYTICS_DB_URL;
    const r = new AnalyticsPgReader();
    expect(r.isEnabled()).toBe(false);
    expect(await r.query('select 1')).toBeUndefined();
  });

  it('unreachable database resolves undefined (no throw, no unhandled rejection)', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    process.env.ANALYTICS_DB_URL = 'postgres://u:p@127.0.0.1:1/db';
    const r = new AnalyticsPgReader();
    expect(await r.query('select 1')).toBeUndefined();
    await new Promise((res) => setTimeout(res, 50));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    await r.onModuleDestroy();
  });

  it('onError reports THIS call\'s failure: disabled vs query error with its code', async () => {
    delete process.env.ANALYTICS_DB_URL;
    const disabled = jest.fn();
    expect(await new AnalyticsPgReader().query('select 1', [], disabled)).toBeUndefined();
    expect(disabled).toHaveBeenCalledWith({ kind: 'disabled', message: 'ANALYTICS_DB_URL not set' });

    jest.resetModules();
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('missing')) throw Object.assign(new Error('relation "missing" does not exist'), { code: '42P01' });
      await new Promise((r) => setTimeout(r, 20));
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    });
    jest.doMock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query, end: jest.fn().mockResolvedValue(undefined) })) }));
    const { AnalyticsPgReader: Fresh } = require('../analytics-pg.reader');
    process.env.ANALYTICS_DB_URL = 'postgres://u:p@127.0.0.1:1/db';
    const r = new Fresh();
    const slow = jest.fn();
    const fast = jest.fn();
    await Promise.all([r.query('select slow', [], slow), r.query('select missing', [], fast)]);
    expect(slow).toHaveBeenCalledWith({ kind: 'query', message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' });
    expect(fast).toHaveBeenCalledWith({ kind: 'query', message: 'relation "missing" does not exist', code: '42P01' });
    jest.dontMock('pg');
  });

  it('a missing pg module disables the reader instead of crashing', async () => {
    jest.resetModules();
    jest.doMock('pg', () => {
      throw new Error("Cannot find module 'pg'");
    });
    const { AnalyticsPgReader: Fresh } = require('../analytics-pg.reader');
    process.env.ANALYTICS_DB_URL = 'postgres://u:p@127.0.0.1:1/db';
    const r = new Fresh();
    expect(await r.query('select 1')).toBeUndefined();
    jest.dontMock('pg');
  });

  it('registers a pool error handler (idle-client error must not crash the process)', async () => {
    jest.resetModules();
    const on = jest.fn();
    jest.doMock('pg', () => ({ Pool: jest.fn(() => ({ on, query: jest.fn().mockResolvedValue({ rows: [{ x: 1 }] }), end: jest.fn().mockResolvedValue(undefined) })) }));
    const { AnalyticsPgReader: Fresh } = require('../analytics-pg.reader');
    process.env.ANALYTICS_DB_URL = 'postgres://u:p@h/db';
    const r = new Fresh();
    expect(await r.query('select 1')).toEqual([{ x: 1 }]);
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    on.mock.calls[0][1](new Error('idle client error')); // must not throw
    jest.dontMock('pg');
  });
});
