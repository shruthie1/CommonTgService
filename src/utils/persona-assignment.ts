/**
 * persona-assignment.ts
 *
 * Deterministic persona assignment for Telegram accounts.
 * Each account gets a unique (firstName, lastName, bio, photos) combination
 * drawn from a per-client pool. The seeded PRNG ensures stable initial
 * assignment for the same mobile across restarts.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PersonaPool {
    firstNames: string[];
    lastNames: string[];
    bios: string[];
    profilePics: string[];
    dbcoll: string;
}

export interface PersonaAssignment {
    assignedFirstName: string | null;
    assignedLastName: string | null;
    assignedBio: string | null;
    assignedProfilePics: string[];
}

export interface PersonaCandidate {
    firstName: string;
    lastName: string;
    bio: string;
    profilePics: string[];
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

// ─── hasAssignment ───────────────────────────────────────────────────────────

/**
 * Returns true if the document has any persona assignment:
 *   - any of assignedFirstName / assignedLastName / assignedBio is non-null, OR
 *   - assignedProfilePics has at least one entry.
 */
export function hasAssignment(doc: PersonaAssignment): boolean {
    return (
        doc.assignedFirstName !== null ||
        doc.assignedLastName !== null ||
        doc.assignedBio !== null ||
        doc.assignedProfilePics.length > 0
    );
}

// ─── personaKey ──────────────────────────────────────────────────────────────

/**
 * Canonical deduplication key for a candidate.
 * Profile pic URLs are sorted so order doesn't matter.
 */
export function personaKey(a: {
    firstName: string;
    lastName: string;
    bio: string;
    profilePics: string[];
}): string {
    return JSON.stringify([a.firstName, a.lastName, a.bio, [...a.profilePics].sort()]);
}

// ─── selectAssignedProfilePics ───────────────────────────────────────────────

/**
 * Seeded shuffle of profilePics, take up to 3 URLs.
 * Seed is derived from the mobile number.
 */
export function selectAssignedProfilePics(
    mobile: string,
    profilePics: string[],
): string[] {
    if (profilePics.length === 0) return [];

    const seed = djb2(mobile + ':photos');
    const prng = makeLCG(seed);

    const shuffledProfilePics = [...profilePics];
    seededShuffle(shuffledProfilePics, prng);

    return shuffledProfilePics.slice(0, 3);
}

// ─── generateCandidateCombinations ──────────────────────────────────────────

const MAX_CANDIDATES = 64;

/**
 * Generates up to 64 unique persona candidates for the given mobile+pool.
 *
 * Algorithm:
 * 1. Seed the PRNG from mobile (deterministic).
 * 2. Shuffle each pool array independently.
 * 3. Iterate combinations in shuffled order, deduplicating by personaKey.
 * 4. Stop when 64 candidates are collected or all combinations exhausted.
 */
export function generateCandidateCombinations(
    pool: PersonaPool,
    mobile: string,
): PersonaCandidate[] {
    const seed = djb2(mobile);
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

                const profilePics = selectAssignedProfilePics(
                    mobile + ':' + firstName + ':' + lastName,
                    pool.profilePics,
                );

                const candidate: PersonaCandidate = {
                    firstName,
                    lastName,
                    bio,
                    profilePics,
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
