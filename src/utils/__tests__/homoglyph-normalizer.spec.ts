import {
    normalizeHomoglyphs,
    nameMatchesAssignment,
    lastNameMatches,
    bioMatches,
} from '../homoglyph-normalizer';

describe('normalizeHomoglyphs', () => {
    test('converts Cyrillic а to Latin a', () => {
        // Cyrillic 'а' (U+0430) → Latin 'a'
        expect(normalizeHomoglyphs('а')).toBe('a');
    });

    test('converts mixed homoglyphs across multiple letters', () => {
        // Build a string using homoglyph substitutes: Cyrillic о, е, т, н
        // о → o, е → e, т → t, н → h
        const obfuscated = 'оеtn'; // Cyrillic о, Cyrillic е, Latin t, Latin n
        const result = normalizeHomoglyphs(obfuscated);
        expect(result).toBe('oetn');
    });

    test('leaves ASCII text unchanged', () => {
        expect(normalizeHomoglyphs('hello world')).toBe('hello world');
    });

    test('handles empty string', () => {
        expect(normalizeHomoglyphs('')).toBe('');
    });

    test('converts all homoglyphs in a fully obfuscated name', () => {
        // Use known homoglyphs: 'а' (Cyrillic a), 'ᴎ' (small caps n), 'і' (Cyrillic i), 'т' (Cyrillic t)
        // Spell out "anit" using homoglyphs
        const obfuscated = 'аᴎіт'; // a, n, i, t — all homoglyphs
        expect(normalizeHomoglyphs(obfuscated)).toBe('anit');
    });

    test('converts ɑ to a', () => {
        expect(normalizeHomoglyphs('ɑ')).toBe('a');
    });

    test('converts м to m', () => {
        expect(normalizeHomoglyphs('м')).toBe('m');
    });
});

describe('nameMatchesAssignment', () => {
    test('matches obfuscated name with emoji against assigned name', () => {
        // tgFirstName: obfuscated "Priya" with emoji, assignedFirstName: "Priya"
        // Cyrillic р → p, г → r, і → i, у → y, а → a
        const obfuscated = 'ргіуа 🌹'; // homoglyph "priya" + emoji
        expect(nameMatchesAssignment(obfuscated, 'priya')).toBe(true);
    });

    test('matches exact name with emoji suffix', () => {
        expect(nameMatchesAssignment('Anjali 💕', 'Anjali')).toBe(true);
    });

    test('is case-insensitive', () => {
        expect(nameMatchesAssignment('PRIYA', 'priya')).toBe(true);
    });

    test('rejects a different name', () => {
        expect(nameMatchesAssignment('Kavita', 'Priya')).toBe(false);
    });

    test('matches when assigned name is a substring of tg name (pet name suffix)', () => {
        // e.g. TG name is "Priya baby" — assigned first name "priya" should match
        expect(nameMatchesAssignment('Priya baby', 'Priya')).toBe(true);
    });

    test('handles names with leading/trailing whitespace after emoji strip', () => {
        expect(nameMatchesAssignment('  Anjali  ', 'anjali')).toBe(true);
    });
});

describe('lastNameMatches', () => {
    test('returns true when assignedLastName is null', () => {
        expect(lastNameMatches('Sharma', null)).toBe(true);
    });

    test('returns true for exact match', () => {
        expect(lastNameMatches('Sharma', 'Sharma')).toBe(true);
    });

    test('rejects mismatched last name', () => {
        expect(lastNameMatches('Sharma', 'Verma')).toBe(false);
    });

    test('returns true when tgLastName is null and assigned is also null', () => {
        expect(lastNameMatches(null, null)).toBe(true);
    });

    test('rejects when tgLastName is null but assigned is non-null', () => {
        expect(lastNameMatches(null, 'Sharma')).toBe(false);
    });
});

describe('bioMatches', () => {
    test('returns true when assignedBio is null', () => {
        expect(bioMatches('some bio text', null)).toBe(true);
    });

    test('returns true for exact bio match', () => {
        const bio = 'Available for video calls 🔥';
        expect(bioMatches(bio, bio)).toBe(true);
    });

    test('rejects mismatched bio', () => {
        expect(bioMatches('My bio text', 'Different bio text')).toBe(false);
    });

    test('returns true when both are null', () => {
        expect(bioMatches(null, null)).toBe(true);
    });

    test('rejects when currentBio is null but assigned is non-null', () => {
        expect(bioMatches(null, 'Expected bio')).toBe(false);
    });
});
