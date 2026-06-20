import {
  sleep,
  contains,
  toBoolean,
  fetchNumbersFromString,
  defaultReactions,
  defaultMessages,
  areJsonsNotSame,
  mapToJson,
  shouldMatch,
  parseObjectToString,
} from '../common';

describe('common utils', () => {
  describe('sleep', () => {
    test('resolves after the given delay', async () => {
      jest.useFakeTimers();
      const spy = jest.fn();
      const p = sleep(1000).then(spy);
      expect(spy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      await p;
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('contains', () => {
    test('returns true when a normalized element is included', () => {
      expect(contains('Hello World', ['world'])).toBe(true);
      expect(contains('  PADDED  ', ['padded'])).toBe(true);
    });

    test('returns false when no element matches', () => {
      expect(contains('abc', ['xyz'])).toBe(false);
    });

    test('ignores empty/whitespace-only and non-string elements', () => {
      expect(contains('abc', ['   ', '' as string])).toBe(false);
      expect(contains('abc', [123 as unknown as string])).toBe(false);
    });

    test('handles non-string str, non-array arr, empty arr', () => {
      expect(contains(null, ['a'])).toBe(false);
      expect(contains(undefined, ['a'])).toBe(false);
      expect(contains(123 as unknown as string, ['a'])).toBe(false);
      expect(contains('a', 'notarray' as unknown as string[])).toBe(false);
      expect(contains('a', [])).toBe(false);
    });
  });

  describe('toBoolean', () => {
    test('null/undefined are false', () => {
      expect(toBoolean(null)).toBe(false);
      expect(toBoolean(undefined)).toBe(false);
    });

    test('string truthy values', () => {
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean(' TRUE ')).toBe(true);
      expect(toBoolean('1')).toBe(true);
      expect(toBoolean('yes')).toBe(true);
    });

    test('string falsy values', () => {
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('no')).toBe(false);
      expect(toBoolean('random')).toBe(false);
    });

    test('numbers: non-zero true, zero false', () => {
      expect(toBoolean(5)).toBe(true);
      expect(toBoolean(0)).toBe(false);
    });

    test('boolean passthrough', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
    });
  });

  describe('fetchNumbersFromString', () => {
    test('joins all digit groups', () => {
      expect(fetchNumbersFromString('a1b22c333')).toBe('122333');
    });
    test('returns empty when no digits', () => {
      expect(fetchNumbersFromString('abc')).toBe('');
    });
    test('returns empty for falsy input', () => {
      expect(fetchNumbersFromString('')).toBe('');
      expect(fetchNumbersFromString(null)).toBe('');
      expect(fetchNumbersFromString(undefined)).toBe('');
    });
  });

  describe('frozen constants', () => {
    test('defaultReactions and defaultMessages are frozen and non-empty', () => {
      expect(Object.isFrozen(defaultReactions)).toBe(true);
      expect(Object.isFrozen(defaultMessages)).toBe(true);
      expect(defaultReactions.length).toBeGreaterThan(0);
      expect(defaultMessages).toContain('1');
    });
  });

  describe('areJsonsNotSame', () => {
    let logSpy: jest.SpyInstance;
    beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => logSpy.mockRestore());

    test('identical primitives are same', () => {
      expect(areJsonsNotSame(1, 1)).toBe(false);
      expect(areJsonsNotSame('a', 'a')).toBe(false);
    });

    test('different primitives are different', () => {
      expect(areJsonsNotSame(1, 2)).toBe(true);
    });

    test('null vs value mismatch', () => {
      expect(areJsonsNotSame(null, 1)).toBe(true);
      expect(areJsonsNotSame(null, null)).toBe(false);
    });

    test('different types are different', () => {
      expect(areJsonsNotSame(1, '1')).toBe(true);
    });

    test('ignores volatile keys like _id and createdAt', () => {
      expect(areJsonsNotSame(
        { _id: 'x', name: 'a', createdAt: 1 },
        { _id: 'y', name: 'a', createdAt: 2 },
      )).toBe(false);
    });

    test('detects different values in nested objects', () => {
      expect(areJsonsNotSame({ a: { b: 1 } }, { a: { b: 2 } })).toBe(true);
    });

    test('detects different key counts and missing keys', () => {
      expect(areJsonsNotSame({ a: 1 }, { a: 1, b: 2 })).toBe(true);
      expect(areJsonsNotSame({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(true);
    });

    test('arrays: length mismatch and element mismatch', () => {
      expect(areJsonsNotSame([1, 2], [1])).toBe(true);
      expect(areJsonsNotSame([1, 2], [1, 3])).toBe(true);
      expect(areJsonsNotSame([1, 2], [1, 2])).toBe(false);
    });

    test('array vs non-array mismatch', () => {
      expect(areJsonsNotSame([1], { 0: 1 })).toBe(true);
    });

    test('deeply equal objects are same', () => {
      expect(areJsonsNotSame({ a: 1, nested: { x: [1, 2] } }, { a: 1, nested: { x: [1, 2] } })).toBe(false);
    });

    test('respects the max recursion depth', () => {
      // build objects nested deeper than MAX_DEPTH (10)
      const build = (leaf: number) => {
        let o: any = leaf;
        for (let i = 0; i < 13; i++) o = { next: o };
        return o;
      };
      // Beyond depth limit it falls back to strict !== of the (object) nodes,
      // which are different references => reported as different.
      expect(areJsonsNotSame(build(1), build(1))).toBe(true);
    });
  });

  describe('mapToJson', () => {
    test('converts a Map to a plain object', () => {
      const m = new Map<string, number>([['a', 1], ['b', 2]]);
      expect(mapToJson(m)).toEqual({ a: 1, b: 2 });
    });
    test('stringifies numeric keys', () => {
      const m = new Map<number, string>([[1, 'x']]);
      expect(mapToJson(m)).toEqual({ '1': 'x' });
    });
    test('throws for non-Map input', () => {
      expect(() => mapToJson({} as unknown as Map<string, number>)).toThrow('Input must be a Map instance');
    });
  });

  describe('shouldMatch', () => {
    test('matches keyword in title', () => {
      expect(shouldMatch({ title: 'Tamil chat group' })).toBe(true);
    });
    test('matches keyword in username', () => {
      expect(shouldMatch({ username: 'desi_call' })).toBe(true);
    });
    test('no match returns false', () => {
      expect(shouldMatch({ title: 'weather updates', username: 'news' })).toBe(false);
    });
    test('missing fields return false', () => {
      expect(shouldMatch({})).toBe(false);
    });
  });

  describe('parseObjectToString', () => {
    test('formats key/value pairs line by line', () => {
      expect(parseObjectToString({ a: 1, b: 'x' })).toBe('a : 1\nb : x\n');
    });
    test('rejects non-objects', () => {
      expect(parseObjectToString(null as unknown as Record<string, unknown>)).toBe('Invalid input: Not an object');
      expect(parseObjectToString('str' as unknown as Record<string, unknown>)).toBe('Invalid input: Not an object');
    });
    test('returns empty string for empty object', () => {
      expect(parseObjectToString({})).toBe('');
    });
  });
});
