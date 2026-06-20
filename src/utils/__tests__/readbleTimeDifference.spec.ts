import { getReadableTimeDifference } from '../readbleTimeDifference';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('getReadableTimeDifference', () => {
  test('returns "0s" for an identical timestamp', () => {
    expect(getReadableTimeDifference(1000, 1000)).toBe('0s');
  });

  test('formats seconds only', () => {
    expect(getReadableTimeDifference(0, 45 * SEC)).toBe('45s');
  });

  test('formats minutes and seconds', () => {
    expect(getReadableTimeDifference(0, 2 * MIN + 5 * SEC)).toBe('2m 5s');
  });

  test('formats hours and minutes (no seconds when zero)', () => {
    expect(getReadableTimeDifference(0, 3 * HOUR + 15 * MIN)).toBe('3h 15m');
  });

  test('formats days, hours, minutes and seconds together', () => {
    const diff = 2 * DAY + 4 * HOUR + 7 * MIN + 9 * SEC;
    expect(getReadableTimeDifference(0, diff)).toBe('2d 4h 7m 9s');
  });

  test('uses absolute difference regardless of argument order', () => {
    expect(getReadableTimeDifference(5 * MIN, 0)).toBe('5m');
    expect(getReadableTimeDifference(0, 5 * MIN)).toBe('5m');
  });

  test('defaults second argument to now', () => {
    const result = getReadableTimeDifference(Date.now() - 10 * SEC);
    // Allow a small window for execution time: 9s, 10s, or 11s.
    expect(result).toMatch(/^(9|10|11)s$/);
  });

  test('omits zero-valued leading units', () => {
    // exactly one day, no hours/minutes/seconds
    expect(getReadableTimeDifference(0, DAY)).toBe('1d');
  });
});
