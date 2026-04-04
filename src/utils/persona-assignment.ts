/**
 * persona-assignment.ts
 *
 * Deterministic persona assignment for Telegram accounts.
 * Each account gets a unique (firstName, lastName, bio, photos) combination
 * drawn from a per-client pool. The seeded PRNG ensures consistent results for
 * the same mobile+poolVersion across restarts, preventing assignment drift.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PersonaPool {
    firstNames: string[];
    lastNames: string[];
    bios: string[];
    profilePics: Array<{ filename: string; phash: string }>;
    dbcoll: string;
    personaPoolVersion: string;
}

export interface PersonaAssignment {
    assignedFirstName: string | null;
    assignedLastName: string | null;
    assignedBio: string | null;
    assignedPhotoFilenames: string[];
    assignedPersonaPoolVersion: string | null;
}

export interface PersonaCandidate {
    firstName: string;
    lastName: string;
    bio: string;
    photoFilenames: string[];
}

// ─── djb2 Hash ───────────────────────────────────────────────────────────────

/**
 * djb2 string hash — returns a 32-bit signed integer.
 * hash = ((hash << 5) - hash + charCode) | 0
 */
function djb2(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
}

// ─── LCG PRNG ────────────────────────────────────────────────────────────────

/**
 * Simple Linear Congruential Generator (LCG).
 * Returns a stateful next() function.
 * s = (s * 1664525 + 1013904223) | 0
 */
function makeLCG(seed: number): () => number {
    let s = seed | 0;
    return function next(): number {
        s = (Math.imul(s, 1664525) + 1013904223) | 0;
        // Map to [0, 1) range using unsigned right shift
        return (s >>> 0) / 0x100000000;
    };
}

/**
 * Seeded pick: pick one element from arr using the given PRNG.
 */
function seededPick<T>(arr: T[], prng: () => number): T {
    const idx = Math.floor(prng() * arr.length);
    return arr[idx];
}

/**
 * Seeded Fisher-Yates shuffle (in-place). Returns the same array.
 */
function seededShuffle<T>(arr: T[], prng: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── computePersonaPoolVersion ───────────────────────────────────────────────

/**
 * Deterministic hash (djb2) of JSON-serialized pool arrays.
 * Returns a base36 string so it is URL-safe and compact.
 * Only hashes the arrays that define the combination space (names, bios, pics).
 */
export function computePersonaPoolVersion(pool: PersonaPool): string {
    const payload = JSON.stringify({
        firstNames: pool.firstNames,
        lastNames: pool.lastNames,
        bios: pool.bios,
        profilePics: pool.profilePics,
    });
    // djb2 returns a signed 32-bit int; convert to unsigned for base36
    const hash = (djb2(payload) >>> 0);
    return hash.toString(36);
}

// ─── hasAssignment ───────────────────────────────────────────────────────────

/**
 * Returns true if the document has any persona assignment:
 *   - any of assignedFirstName / assignedLastName / assignedBio is non-null, OR
 *   - assignedPhotoFilenames has at least one entry.
 */
export function hasAssignment(doc: PersonaAssignment): boolean {
    return (
        doc.assignedFirstName !== null ||
        doc.assignedLastName !== null ||
        doc.assignedBio !== null ||
        doc.assignedPhotoFilenames.length > 0
    );
}

// ─── needsReassignment ───────────────────────────────────────────────────────

/**
 * Returns whether the document needs a new persona assignment from the pool.
 *
 * Rules:
 * - Legacy account: no assignment AND no stored pool version → false (leave alone)
 * - Pool version matches stored version → false (already up-to-date)
 * - Stored version differs from current pool version → true (pool changed)
 */
export function needsReassignment(doc: PersonaAssignment, pool: PersonaPool): boolean {
    const currentVersion = computePersonaPoolVersion(pool);

    // Legacy: never had an assignment and never had a pool version tracked
    if (!hasAssignment(doc) && doc.assignedPersonaPoolVersion === null) {
        return false;
    }

    // Version match → no reassignment needed
    if (doc.assignedPersonaPoolVersion === currentVersion) {
        return false;
    }

    // Version mismatch (or doc has stale/old version) → reassign
    return true;
}

// ─── personaKey ──────────────────────────────────────────────────────────────

/**
 * Canonical deduplication key for a candidate.
 * Photo filenames are sorted so order doesn't matter.
 */
export function personaKey(a: {
    firstName: string;
    lastName: string;
    bio: string;
    photoFilenames: string[];
}): string {
    return JSON.stringify([a.firstName, a.lastName, a.bio, [...a.photoFilenames].sort()]);
}

// ─── selectAssignedPhotoFilenames ────────────────────────────────────────────

/**
 * Seeded shuffle of profilePics, take up to 3 filenames.
 * Seed is derived from the mobile number.
 */
export function selectAssignedPhotoFilenames(
    mobile: string,
    profilePics: Array<{ filename: string; phash: string }>,
): string[] {
    if (profilePics.length === 0) return [];

    const seed = djb2(mobile + ':photos');
    const prng = makeLCG(seed);

    const filenames = profilePics.map(p => p.filename);
    seededShuffle(filenames, prng);

    return filenames.slice(0, 3);
}

// ─── generateCandidateCombinations ──────────────────────────────────────────

const MAX_CANDIDATES = 64;

/**
 * Generates up to 64 unique persona candidates for the given mobile+pool.
 *
 * Algorithm:
 * 1. Seed the PRNG from mobile + poolVersion (deterministic).
 * 2. Shuffle each pool array independently.
 * 3. Iterate combinations in shuffled order, deduplicating by personaKey.
 * 4. Stop when 64 candidates are collected or all combinations exhausted.
 */
export function generateCandidateCombinations(
    pool: PersonaPool,
    mobile: string,
): PersonaCandidate[] {
    const poolVersion = computePersonaPoolVersion(pool);
    const seed = djb2(mobile + ':' + poolVersion);
    const prng = makeLCG(seed);

    // Guard against empty arrays
    const firstNames = pool.firstNames.length > 0 ? [...pool.firstNames] : [''];
    const lastNames = pool.lastNames.length > 0 ? [...pool.lastNames] : [''];
    const bios = pool.bios.length > 0 ? [...pool.bios] : [''];

    // Shuffle each dimension independently
    seededShuffle(firstNames, prng);
    seededShuffle(lastNames, prng);
    seededShuffle(bios, prng);

    const seen = new Set<string>();
    const results: PersonaCandidate[] = [];

    outer: for (const bio of bios) {
        for (const lastName of lastNames) {
            for (const firstName of firstNames) {
                if (results.length >= MAX_CANDIDATES) break outer;

                const photoFilenames = selectAssignedPhotoFilenames(
                    mobile + ':' + firstName + ':' + lastName,
                    pool.profilePics,
                );

                const candidate: PersonaCandidate = {
                    firstName,
                    lastName,
                    bio,
                    photoFilenames,
                };

                const key = personaKey(candidate);
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(candidate);
                }
            }
        }
    }

    return results;
}
