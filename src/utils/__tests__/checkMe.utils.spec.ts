import {
  safeAttemptReverse,
  isIncludedWithTolerance,
} from '../checkMe.utils';
import * as obfuscate from '../obfuscateText';

describe('safeAttemptReverse', () => {
  test('reverses obfuscated text to plain text', () => {
    const obf = obfuscate.obfuscateText('hello', { randomSeed: 7, substitutionRate: 1, maintainFormatting: true });
    expect(safeAttemptReverse(obf).toLowerCase()).toBe('hello');
  });

  test('returns empty string for null/undefined input', () => {
    expect(safeAttemptReverse(null)).toBe('');
    expect(safeAttemptReverse(undefined)).toBe('');
  });

  test('returns empty string when the underlying reverse throws on malformed input', () => {
    // Real trigger (no mocking): a non-string value slips past the type contract
    // (e.g. malformed upstream data cast to the param type). attemptReverseFuzzy then
    // calls .replace() on it, throws a TypeError, and safeAttemptReverse swallows it.
    const malformed = 12345 as unknown as string;
    // Sanity: the real attemptReverseFuzzy genuinely throws for this input.
    expect(() => obfuscate.attemptReverseFuzzy(malformed)).toThrow();
    expect(safeAttemptReverse(malformed)).toBe('');
  });
});

describe('isIncludedWithTolerance', () => {
  test('returns true when expected is empty', () => {
    expect(isIncludedWithTolerance('anything', '')).toBe(true);
  });

  test('returns false when actual is empty but expected is not', () => {
    expect(isIncludedWithTolerance('', 'name')).toBe(false);
  });

  test('returns true on a direct normalized substring match', () => {
    expect(isIncludedWithTolerance('My name is Priya here', 'priya')).toBe(true);
  });

  test('matches with small typos within tolerance via sliding window', () => {
    // "priyaa" vs "priya" is within editDistance <= 2
    expect(isIncludedWithTolerance('hello priyaa welcome', 'priya')).toBe(true);
  });

  test('returns false when difference exceeds tolerance', () => {
    expect(isIncludedWithTolerance('totally different text', 'priya')).toBe(false);
  });

  test('normalization strips special chars and zero-width characters', () => {
    expect(isIncludedWithTolerance('p​ri‌ya!!!', 'priya')).toBe(true);
  });

  test('honors a custom maxDiff', () => {
    // "prya" missing one char from "priya" -> distance 1, allowed at maxDiff 1
    expect(isIncludedWithTolerance('say prya now', 'priya', 1)).toBe(true);
  });
});
