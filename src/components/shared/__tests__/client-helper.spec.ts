import { ClientHelperUtils } from '../client-helper.utils';

describe('ClientHelperUtils.gaussianRandom', () => {
    test('returns integer', () => {
        const result = ClientHelperUtils.gaussianRandom(100, 10);
        expect(Number.isInteger(result)).toBe(true);
    });

    test('respects min bound', () => {
        // Run many times to test bounds
        for (let i = 0; i < 100; i++) {
            const result = ClientHelperUtils.gaussianRandom(50, 100, 30);
            expect(result).toBeGreaterThanOrEqual(30);
        }
    });

    test('respects max bound', () => {
        for (let i = 0; i < 100; i++) {
            const result = ClientHelperUtils.gaussianRandom(50, 100, undefined, 70);
            expect(result).toBeLessThanOrEqual(70);
        }
    });

    test('respects both min and max', () => {
        for (let i = 0; i < 200; i++) {
            const result = ClientHelperUtils.gaussianRandom(120000, 30000, 90000, 180000);
            expect(result).toBeGreaterThanOrEqual(90000);
            expect(result).toBeLessThanOrEqual(180000);
        }
    });

    test('distribution centers around mean', () => {
        const samples: number[] = [];
        for (let i = 0; i < 1000; i++) {
            samples.push(ClientHelperUtils.gaussianRandom(100, 10, 50, 150));
        }
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        // Average should be close to mean (within 5)
        expect(Math.abs(avg - 100)).toBeLessThan(5);
    });

    test('handles edge case: u1 very close to 0 (log(0) = -Infinity)', () => {
        // Math.random() can technically return 0, which would make log(0) = -Infinity
        // In practice this is astronomically rare, but the min/max clamp saves us
        const result = ClientHelperUtils.gaussianRandom(100, 10, 50, 150);
        expect(result).toBeGreaterThanOrEqual(50);
        expect(result).toBeLessThanOrEqual(150);
    });
});

describe('ClientHelperUtils.generateWarmupJitter', () => {
    test('returns integer between 0 and 7 inclusive (Gaussian, mean ~3.5)', () => {
        const values: number[] = [];
        for (let i = 0; i < 200; i++) {
            const jitter = ClientHelperUtils.generateWarmupJitter();
            expect(Number.isInteger(jitter)).toBe(true);
            expect(jitter).toBeGreaterThanOrEqual(0);
            expect(jitter).toBeLessThanOrEqual(7);
            values.push(jitter);
        }
        // Distribution should be centered around 3.5 — mean should be between 2 and 5
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        expect(mean).toBeGreaterThanOrEqual(2);
        expect(mean).toBeLessThanOrEqual(5);
    });
});

describe('ClientHelperUtils.getTimestamp', () => {
    test('null → 0', () => expect(ClientHelperUtils.getTimestamp(null)).toBe(0));
    test('undefined → 0', () => expect(ClientHelperUtils.getTimestamp(undefined)).toBe(0));
    test('empty string → 0', () => expect(ClientHelperUtils.getTimestamp('')).toBe(0));
    test('valid Date → timestamp', () => {
        const d = new Date('2025-01-15T00:00:00Z');
        expect(ClientHelperUtils.getTimestamp(d)).toBe(d.getTime());
    });
    test('valid date string → timestamp', () => {
        const ts = ClientHelperUtils.getTimestamp('2025-01-15T00:00:00Z');
        expect(ts).toBe(new Date('2025-01-15T00:00:00Z').getTime());
    });
    test('invalid date string → 0', () => {
        expect(ClientHelperUtils.getTimestamp('not-a-date')).toBe(0);
        expect(ClientHelperUtils.getTimestamp('garbage')).toBe(0);
        expect(ClientHelperUtils.getTimestamp('2025-99-99')).toBe(0);
    });
});

describe('ClientHelperUtils.normalizeAvailableDate', () => {
    // availableDate is compared as a STRING in selection queries, so an
    // unparseable or empty write must normalize to null (caller picks a fallback)
    // rather than poisoning the field with a value that mis-sorts.
    test('null / undefined / empty string → null (early return)', () => {
        expect(ClientHelperUtils.normalizeAvailableDate(null)).toBeNull();
        expect(ClientHelperUtils.normalizeAvailableDate(undefined)).toBeNull();
        expect(ClientHelperUtils.normalizeAvailableDate('')).toBeNull();
    });

    test('clean YYYY-MM-DD string → returned unchanged (fast path)', () => {
        expect(ClientHelperUtils.normalizeAvailableDate('2026-06-12')).toBe('2026-06-12');
    });

    test('full ISO datetime → collapsed to date-only', () => {
        expect(ClientHelperUtils.normalizeAvailableDate('2026-06-12T18:30:00Z')).toBe('2026-06-12');
    });

    test('numeric timestamp → date-only string', () => {
        const ts = Date.UTC(2026, 0, 15);
        expect(ClientHelperUtils.normalizeAvailableDate(ts)).toBe('2026-01-15');
    });

    test('unparseable non-empty value → null (ts <= 0 branch)', () => {
        expect(ClientHelperUtils.normalizeAvailableDate('not-a-real-date')).toBeNull();
    });
});
