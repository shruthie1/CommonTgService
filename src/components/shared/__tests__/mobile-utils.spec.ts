/**
 * Unit tests for mobile-number normalization helpers.
 *
 * These power every mobile-keyed lookup and equality check across buffer /
 * promote / client services, so the edge cases here ('+' prefixes, country
 * codes, blank inputs) map directly to real operational lookups.
 */
import {
    CANONICAL_MOBILE_REGEX,
    normalizeMobileInput,
    canonicalizeMobile,
    mobilesEqual,
} from '../mobile-utils';

describe('normalizeMobileInput', () => {
    test('strips a leading + (international format pasted from contacts)', () => {
        expect(normalizeMobileInput('+919876543210')).toBe('919876543210');
    });

    test('trims surrounding whitespace', () => {
        expect(normalizeMobileInput('  919876543210  ')).toBe('919876543210');
    });

    test('leaves a plain number untouched', () => {
        expect(normalizeMobileInput('919876543210')).toBe('919876543210');
    });

    test('trims then strips + together', () => {
        expect(normalizeMobileInput('  +919876543210 ')).toBe('919876543210');
    });
});

describe('canonicalizeMobile', () => {
    test('accepts a valid country-code number', () => {
        expect(canonicalizeMobile('919876543210')).toBe('919876543210');
        expect(canonicalizeMobile('+919876543210')).toBe('919876543210');
    });

    test('rejects a number that is too short (no country code)', () => {
        // Regex requires 11-15 digits; a bare 10-digit national number is rejected.
        expect(() => canonicalizeMobile('9876543210')).toThrow(/country code/);
        expect(() => canonicalizeMobile('123')).toThrow(/country code/);
        // 11 digits is the minimum accepted.
        expect(canonicalizeMobile('91987654321')).toBe('91987654321');
    });

    test('rejects a number starting with 0', () => {
        expect(() => canonicalizeMobile('0919876543210')).toThrow(/country code/);
    });

    test('rejects a number that is too long', () => {
        expect(() => canonicalizeMobile('9198765432101234')).toThrow(/country code/);
    });

    test('rejects non-digit junk', () => {
        expect(() => canonicalizeMobile('not-a-number')).toThrow(/country code/);
    });
});

describe('mobilesEqual', () => {
    test('two equivalent forms compare equal (one with +)', () => {
        expect(mobilesEqual('+919876543210', '919876543210')).toBe(true);
    });

    test('different numbers are not equal', () => {
        expect(mobilesEqual('919876543210', '919876500000')).toBe(false);
    });

    test('a missing operand short-circuits to false', () => {
        expect(mobilesEqual(undefined, '919876543210')).toBe(false);
        expect(mobilesEqual('919876543210', null)).toBe(false);
        expect(mobilesEqual('', '919876543210')).toBe(false);
        expect(mobilesEqual(null, null)).toBe(false);
    });

    test('an uncanonicalizable input returns false rather than throwing', () => {
        expect(mobilesEqual('garbage', '919876543210')).toBe(false);
    });
});

describe('CANONICAL_MOBILE_REGEX', () => {
    test('matches 11-15 digit numbers not starting with 0', () => {
        expect(CANONICAL_MOBILE_REGEX.test('919876543210')).toBe(true);
        expect(CANONICAL_MOBILE_REGEX.test('0919876543210')).toBe(false);
    });
});
