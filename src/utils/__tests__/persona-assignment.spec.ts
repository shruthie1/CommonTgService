import {
    hasAssignment,
    generateCandidateCombinations,
    selectAssignedProfilePics,
    personaKey,
    PersonaPool,
    PersonaAssignment,
} from '../persona-assignment';

function makePool(overrides: Partial<PersonaPool> = {}): PersonaPool {
    return {
        firstNames: ['Alice', 'Bob', 'Carol'],
        lastNames: ['Smith', 'Jones'],
        bios: ['Bio A', 'Bio B'],
        profilePics: [
            'https://cdn.example.com/a.jpg',
            'https://cdn.example.com/b.jpg',
            'https://cdn.example.com/c.jpg',
            'https://cdn.example.com/d.jpg',
        ],
        dbcoll: 'clients',
        ...overrides,
    };
}

function makeAssignment(overrides: Partial<PersonaAssignment> = {}): PersonaAssignment {
    return {
        assignedFirstName: null,
        assignedLastName: null,
        assignedBio: null,
        assignedProfilePics: [],
        ...overrides,
    };
}

describe('hasAssignment', () => {
    test('returns false when all fields are empty', () => {
        expect(hasAssignment(makeAssignment())).toBe(false);
    });

    test('returns true when name exists', () => {
        expect(hasAssignment(makeAssignment({ assignedFirstName: 'Alice' }))).toBe(true);
    });

    test('returns true when bio exists', () => {
        expect(hasAssignment(makeAssignment({ assignedBio: 'Some bio' }))).toBe(true);
    });

    test('returns true when profile pic URLs exist', () => {
        expect(hasAssignment(makeAssignment({ assignedProfilePics: ['https://cdn.example.com/a.jpg'] }))).toBe(true);
    });
});

describe('personaKey', () => {
    test('is JSON and order-independent for profile pics', () => {
        const a = personaKey({
            firstName: 'Alice',
            lastName: 'Smith',
            bio: 'Bio',
            profilePics: ['https://cdn.example.com/b.jpg', 'https://cdn.example.com/a.jpg'],
        });
        const b = personaKey({
            firstName: 'Alice',
            lastName: 'Smith',
            bio: 'Bio',
            profilePics: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        });

        expect(() => JSON.parse(a)).not.toThrow();
        expect(a).toBe(b);
    });
});

describe('selectAssignedProfilePics', () => {
    test('returns at most 3 URLs', () => {
        const selected = selectAssignedProfilePics('+1234567890', makePool().profilePics);
        expect(selected.length).toBeLessThanOrEqual(3);
    });

    test('is deterministic for the same mobile', () => {
        const pics = makePool().profilePics;
        expect(selectAssignedProfilePics('+1234567890', pics)).toEqual(
            selectAssignedProfilePics('+1234567890', pics),
        );
    });

    test('returns an empty array when the pool has no profile pics', () => {
        // Operationally: a freshly-provisioned client whose photo pool has not been
        // populated yet. No pics to assign.
        expect(selectAssignedProfilePics('+1234567890', [])).toEqual([]);
    });
});

describe('generateCandidateCombinations', () => {
    test('returns deterministic candidates for the same mobile', () => {
        const pool = makePool();
        expect(generateCandidateCombinations(pool, '+1234567890')).toEqual(
            generateCandidateCombinations(pool, '+1234567890'),
        );
    });

    test('returns candidates using current field names', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');

        expect(candidates.length).toBeGreaterThan(0);
        for (const candidate of candidates) {
            expect(typeof candidate.firstName).toBe('string');
            expect(typeof candidate.lastName).toBe('string');
            expect(typeof candidate.bio).toBe('string');
            expect(Array.isArray(candidate.profilePics)).toBe(true);
        }
    });

    test('falls back to empty-string fields when pool dimensions are empty', () => {
        // A client pool that has only profile pics configured (no names/bios yet).
        // Each empty dimension must fall back to [''] so we still emit at least one
        // candidate rather than producing zero combinations.
        const pool = makePool({ firstNames: [], lastNames: [], bios: [] });
        const candidates = generateCandidateCombinations(pool, '+1234567890');

        expect(candidates.length).toBe(1);
        expect(candidates[0]).toMatchObject({ firstName: '', lastName: '', bio: '' });
    });

    test('caps the candidate set at 64 even when the pool can produce more', () => {
        // A richly-populated pool (10 x 10 x 10 = 1000 unique name/bio combos) must
        // not blow past the MAX_CANDIDATES budget used to seed selection.
        const big = (prefix: string) =>
            Array.from({ length: 10 }, (_, i) => `${prefix}${i}`);
        const pool = makePool({
            firstNames: big('First'),
            lastNames: big('Last'),
            bios: big('Bio'),
            profilePics: [],
        });

        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(candidates.length).toBe(64);
    });

    test('deduplicates identical persona combinations', () => {
        // If the pool contains repeated names (a common data-entry artifact), the
        // generated combinations collapse to the unique set rather than emitting
        // visually-identical personas.
        const pool = makePool({
            firstNames: ['Same', 'Same', 'Same'],
            lastNames: ['Name', 'Name'],
            bios: ['One', 'One'],
            profilePics: [],
        });

        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({ firstName: 'Same', lastName: 'Name', bio: 'One' });
    });
});
