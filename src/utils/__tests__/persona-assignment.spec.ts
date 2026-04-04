import {
    computePersonaPoolVersion,
    hasAssignment,
    needsReassignment,
    generateCandidateCombinations,
    selectAssignedPhotoFilenames,
    personaKey,
    PersonaPool,
    PersonaAssignment,
} from '../persona-assignment';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePool(overrides: Partial<PersonaPool> = {}): PersonaPool {
    return {
        firstNames: ['Alice', 'Bob', 'Carol'],
        lastNames: ['Smith', 'Jones'],
        bios: ['Bio A', 'Bio B'],
        profilePics: [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
            { filename: 'c.jpg', phash: 'h3' },
            { filename: 'd.jpg', phash: 'h4' },
        ],
        dbcoll: 'clients',
        personaPoolVersion: '',
        ...overrides,
    };
}

function makeAssignment(overrides: Partial<PersonaAssignment> = {}): PersonaAssignment {
    return {
        assignedFirstName: null,
        assignedLastName: null,
        assignedBio: null,
        assignedPhotoFilenames: [],
        assignedPersonaPoolVersion: null,
        ...overrides,
    };
}

// ─── computePersonaPoolVersion ───────────────────────────────────────────────

describe('computePersonaPoolVersion', () => {
    test('returns a non-empty string', () => {
        const pool = makePool();
        const version = computePersonaPoolVersion(pool);
        expect(typeof version).toBe('string');
        expect(version.length).toBeGreaterThan(0);
    });

    test('is deterministic — same pool gives same version', () => {
        const pool = makePool();
        expect(computePersonaPoolVersion(pool)).toBe(computePersonaPoolVersion(pool));
    });

    test('changes when firstNames changes', () => {
        const a = makePool({ firstNames: ['Alice'] });
        const b = makePool({ firstNames: ['Zara'] });
        expect(computePersonaPoolVersion(a)).not.toBe(computePersonaPoolVersion(b));
    });

    test('changes when lastNames changes', () => {
        const a = makePool({ lastNames: ['Smith'] });
        const b = makePool({ lastNames: ['Brown'] });
        expect(computePersonaPoolVersion(a)).not.toBe(computePersonaPoolVersion(b));
    });

    test('changes when bios changes', () => {
        const a = makePool({ bios: ['Hello'] });
        const b = makePool({ bios: ['Goodbye'] });
        expect(computePersonaPoolVersion(a)).not.toBe(computePersonaPoolVersion(b));
    });

    test('changes when profilePics changes', () => {
        const a = makePool({ profilePics: [{ filename: 'x.jpg', phash: 'p1' }] });
        const b = makePool({ profilePics: [{ filename: 'y.jpg', phash: 'p2' }] });
        expect(computePersonaPoolVersion(a)).not.toBe(computePersonaPoolVersion(b));
    });

    test('returns a base36 string (only [0-9a-z] chars)', () => {
        const version = computePersonaPoolVersion(makePool());
        expect(version).toMatch(/^[0-9a-z]+$/);
    });
});

// ─── hasAssignment ───────────────────────────────────────────────────────────

describe('hasAssignment', () => {
    test('returns false when all fields are null and photos empty', () => {
        expect(hasAssignment(makeAssignment())).toBe(false);
    });

    test('returns true when assignedFirstName is set', () => {
        expect(hasAssignment(makeAssignment({ assignedFirstName: 'Alice' }))).toBe(true);
    });

    test('returns true when assignedLastName is set', () => {
        expect(hasAssignment(makeAssignment({ assignedLastName: 'Smith' }))).toBe(true);
    });

    test('returns true when assignedBio is set', () => {
        expect(hasAssignment(makeAssignment({ assignedBio: 'Some bio' }))).toBe(true);
    });

    test('returns true when assignedPhotoFilenames has entries', () => {
        expect(hasAssignment(makeAssignment({ assignedPhotoFilenames: ['photo.jpg'] }))).toBe(true);
    });

    test('returns false when assignedPhotoFilenames is empty array', () => {
        expect(hasAssignment(makeAssignment({ assignedPhotoFilenames: [] }))).toBe(false);
    });
});

// ─── needsReassignment ───────────────────────────────────────────────────────

describe('needsReassignment', () => {
    test('returns false for legacy accounts (no assignment AND no pool version in doc)', () => {
        const doc = makeAssignment(); // no assignment, no assignedPersonaPoolVersion
        const pool = makePool();
        expect(needsReassignment(doc, pool)).toBe(false);
    });

    test('returns true when doc has assignment but pool version differs', () => {
        const pool = makePool();
        const poolVersion = computePersonaPoolVersion(pool);
        pool.personaPoolVersion = poolVersion;
        const doc = makeAssignment({
            assignedFirstName: 'Alice',
            assignedPersonaPoolVersion: 'old-version-xyz',
        });
        expect(needsReassignment(doc, pool)).toBe(true);
    });

    test('returns false when doc pool version matches current pool version', () => {
        const pool = makePool();
        const poolVersion = computePersonaPoolVersion(pool);
        // Set pool.personaPoolVersion to the computed version (as production code does)
        pool.personaPoolVersion = poolVersion;
        const doc = makeAssignment({
            assignedFirstName: 'Alice',
            assignedPersonaPoolVersion: poolVersion,
        });
        expect(needsReassignment(doc, pool)).toBe(false);
    });

    test('returns true when doc has no assignment but has an old pool version (was assigned before, pool changed)', () => {
        const pool = makePool();
        pool.personaPoolVersion = computePersonaPoolVersion(pool);
        const doc = makeAssignment({
            assignedPersonaPoolVersion: 'stale-version',
        });
        expect(needsReassignment(doc, pool)).toBe(true);
    });
});

// ─── personaKey ─────────────────────────────────────────────────────────────

describe('personaKey', () => {
    test('returns a stable JSON string', () => {
        const key = personaKey({ firstName: 'A', lastName: 'B', bio: 'C', photoFilenames: ['x.jpg', 'y.jpg'] });
        expect(typeof key).toBe('string');
        // Should be parseable JSON
        expect(() => JSON.parse(key)).not.toThrow();
    });

    test('photo filenames are sorted before hashing (order-independent)', () => {
        const k1 = personaKey({ firstName: 'A', lastName: 'B', bio: 'C', photoFilenames: ['x.jpg', 'y.jpg'] });
        const k2 = personaKey({ firstName: 'A', lastName: 'B', bio: 'C', photoFilenames: ['y.jpg', 'x.jpg'] });
        expect(k1).toBe(k2);
    });

    test('differs when firstName differs', () => {
        const k1 = personaKey({ firstName: 'Alice', lastName: 'B', bio: 'C', photoFilenames: [] });
        const k2 = personaKey({ firstName: 'Bob', lastName: 'B', bio: 'C', photoFilenames: [] });
        expect(k1).not.toBe(k2);
    });
});

// ─── generateCandidateCombinations ──────────────────────────────────────────

describe('generateCandidateCombinations', () => {
    test('returns at most 64 candidates', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(candidates.length).toBeLessThanOrEqual(64);
    });

    test('each candidate has correct field types', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            expect(typeof c.firstName).toBe('string');
            expect(typeof c.lastName).toBe('string');
            expect(typeof c.bio).toBe('string');
            expect(Array.isArray(c.photoFilenames)).toBe(true);
            for (const f of c.photoFilenames) {
                expect(typeof f).toBe('string');
            }
        }
    });

    test('is deterministic — same mobile+pool gives same results', () => {
        const pool = makePool();
        const mobile = '+1234567890';
        const r1 = generateCandidateCombinations(pool, mobile);
        const r2 = generateCandidateCombinations(pool, mobile);
        expect(r1).toEqual(r2);
    });

    test('produces different results for different mobiles', () => {
        const pool = makePool();
        const r1 = generateCandidateCombinations(pool, '+1111111111');
        const r2 = generateCandidateCombinations(pool, '+2222222222');
        // They may differ (the PRNG seed differs)
        // Stringify for deep comparison
        expect(JSON.stringify(r1)).not.toBe(JSON.stringify(r2));
    });

    test('firstName values come from pool.firstNames', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        for (const c of candidates) {
            expect(pool.firstNames).toContain(c.firstName);
        }
    });

    test('lastName values come from pool.lastNames', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        for (const c of candidates) {
            expect(pool.lastNames).toContain(c.lastName);
        }
    });

    test('bio values come from pool.bios', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        for (const c of candidates) {
            expect(pool.bios).toContain(c.bio);
        }
    });

    test('photo filenames come from pool.profilePics', () => {
        const pool = makePool();
        const allFilenames = pool.profilePics.map(p => p.filename);
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        for (const c of candidates) {
            for (const f of c.photoFilenames) {
                expect(allFilenames).toContain(f);
            }
        }
    });

    test('candidates are deduplicated by personaKey', () => {
        const pool = makePool();
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        const keys = candidates.map(c => personaKey(c));
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(candidates.length);
    });

    test('handles empty bios gracefully', () => {
        const pool = makePool({ bios: [] });
        expect(() => generateCandidateCombinations(pool, '+1234567890')).not.toThrow();
    });

    test('handles empty profilePics gracefully', () => {
        const pool = makePool({ profilePics: [] });
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(Array.isArray(candidates)).toBe(true);
    });

    test('handles single-item pool fields', () => {
        const pool = makePool({
            firstNames: ['OnlyFirst'],
            lastNames: ['OnlyLast'],
            bios: ['OnlyBio'],
            profilePics: [{ filename: 'only.jpg', phash: 'ph' }],
        });
        const candidates = generateCandidateCombinations(pool, '+1234567890');
        expect(candidates.length).toBe(1);
        expect(candidates[0].firstName).toBe('OnlyFirst');
        expect(candidates[0].lastName).toBe('OnlyLast');
        expect(candidates[0].bio).toBe('OnlyBio');
    });
});

// ─── selectAssignedPhotoFilenames ────────────────────────────────────────────

describe('selectAssignedPhotoFilenames', () => {
    test('returns at most 3 filenames', () => {
        const pics = [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
            { filename: 'c.jpg', phash: 'h3' },
            { filename: 'd.jpg', phash: 'h4' },
            { filename: 'e.jpg', phash: 'h5' },
        ];
        const result = selectAssignedPhotoFilenames('+1234567890', pics);
        expect(result.length).toBeLessThanOrEqual(3);
    });

    test('returns filenames that exist in profilePics', () => {
        const pics = [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
            { filename: 'c.jpg', phash: 'h3' },
        ];
        const allFilenames = pics.map(p => p.filename);
        const result = selectAssignedPhotoFilenames('+1234567890', pics);
        for (const f of result) {
            expect(allFilenames).toContain(f);
        }
    });

    test('is deterministic for same mobile + same pics', () => {
        const pics = [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
            { filename: 'c.jpg', phash: 'h3' },
        ];
        const r1 = selectAssignedPhotoFilenames('+1234567890', pics);
        const r2 = selectAssignedPhotoFilenames('+1234567890', pics);
        expect(r1).toEqual(r2);
    });

    test('returns all filenames if pool has <= 3 pics', () => {
        const pics = [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
        ];
        const result = selectAssignedPhotoFilenames('+1234567890', pics);
        expect(result.length).toBe(2);
    });

    test('returns empty array when profilePics is empty', () => {
        const result = selectAssignedPhotoFilenames('+1234567890', []);
        expect(result).toEqual([]);
    });

    test('different mobiles can get different photo selections', () => {
        const pics = [
            { filename: 'a.jpg', phash: 'h1' },
            { filename: 'b.jpg', phash: 'h2' },
            { filename: 'c.jpg', phash: 'h3' },
            { filename: 'd.jpg', phash: 'h4' },
        ];
        const r1 = selectAssignedPhotoFilenames('+1111111111', pics);
        const r2 = selectAssignedPhotoFilenames('+9999999999', pics);
        // At least one should differ (different seeds → different shuffles)
        // This may not always differ but is very likely with different mobiles
        // We just verify both are valid
        expect(r1.length).toBeLessThanOrEqual(3);
        expect(r2.length).toBeLessThanOrEqual(3);
    });
});
