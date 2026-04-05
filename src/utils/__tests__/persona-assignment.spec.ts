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
});
