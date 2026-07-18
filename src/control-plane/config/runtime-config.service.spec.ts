import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  RuntimeConfigService,
  SCHEDULER_FLAGS,
} from './runtime-config.service';

const keys = SCHEDULER_FLAGS.map((scheduler) => `ENABLE_${scheduler}`);
let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
});

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('RuntimeConfigService', () => {
  it('fails closed when no scheduler flags are set', () => {
    expect(new RuntimeConfigService().activeSchedulers()).toEqual([]);
  });

  it('enables only the requested scheduler group', () => {
    process.env.ENABLE_UMS_SCHEDULER = 'true';
    const config = new RuntimeConfigService();

    expect(config.enabled('UMS_SCHEDULER')).toBe(true);
    expect(config.enabled('CMS_SCHEDULER')).toBe(false);
    expect(config.enabled('UMS_TEST_SCHEDULER')).toBe(false);
  });

  it('keeps the three-process PM2 template aligned with the scheduler registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const template = require('../../../ecosystem.config.example.cjs') as {
      apps: Array<{ env: Record<string, string> }>;
    };
    const expected = keys.sort();

    for (const app of template.apps) {
      const actual = Object.keys(app.env)
        .filter((key) => key.startsWith('ENABLE_'))
        .sort();
      expect(actual).toEqual(expected);
    }
  });
});
