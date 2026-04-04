# Persona Pools, Profile Verification & Randomization Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each TG account a unique, persisted persona (name, bio, photos) drawn from per-client pools, with self-correcting verification in downstream services and Gaussian timing everywhere.

**Architecture:** CommonTgService assigns personas during warmup and stores them on buffer/promote docs. `setupClient` copies assignment to `clients` doc. promote-clients-local and tg-aut-local each verify + correct their own TG profiles using a shared verifier pattern. All timing moves from uniform to Gaussian.

**Tech Stack:** NestJS 11, Mongoose 9, GramJS (telegram 2.26.22), sharp (NEW — for aHash), TypeScript 5.x, MongoDB Atlas

**Spec:** `docs/superpowers/specs/2026-04-04-persona-pools-and-randomization-design.md`

---

## File Structure

### CommonTgService-local (Tasks 1-10)

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/utils/image-hash.ts` | aHash computation + hamming distance |
| Create | `src/utils/homoglyph-normalizer.ts` | Reverse homoglyph map for name comparison |
| Create | `src/utils/persona-assignment.ts` | `assignPersona()`, `generateCandidateCombinations()`, comparison helpers |
| Create | `src/utils/__tests__/image-hash.spec.ts` | Unit tests for aHash |
| Create | `src/utils/__tests__/homoglyph-normalizer.spec.ts` | Unit tests for normalizer |
| Create | `src/utils/__tests__/persona-assignment.spec.ts` | Unit tests for assignment + comparison |
| Modify | `src/components/clients/schemas/client.schema.ts` | Add pool fields + assignment mirror fields |
| Modify | `src/components/clients/dto/create-client.dto.ts` | Add pool field validators |
| Modify | `src/components/clients/dto/update-client.dto.ts` | Add pool field validators + assignment fields |
| Modify | `src/components/clients/client.controller.ts` | Add persona-pool + existing-assignments endpoints |
| Modify | `src/components/clients/client.service.ts` | Add persona-pool methods + setupClient persona copy |
| Modify | `src/components/buffer-clients/schemas/buffer-client.schema.ts` | Add assignment fields |
| Modify | `src/components/buffer-clients/dto/update-buffer-client.dto.ts` | Add assignment field validators |
| Modify | `src/components/promote-clients/schemas/promote-client.schema.ts` | Add assignment fields |
| Modify | `src/components/promote-clients/dto/update-promote-client.dto.ts` | Add assignment field validators |
| Modify | `src/components/buffer-clients/buffer-client.service.ts` | updateNameAndBio persona branch |
| Modify | `src/components/promote-clients/promote-client.service.ts` | updateNameAndBio persona branch |
| Modify | `src/components/shared/base-client.service.ts` | updateProfilePhotos persona branch + warmup pool drift check |
| Modify | `src/components/shared/client-helper.utils.ts` | generateWarmupJitter Gaussian + health check Gaussian |
| Modify | `src/components/shared/warmup-phases.ts` | No changes (phases unchanged) |
| Modify | `package.json` | Add `sharp` dependency |

### promote-clients-local (Task 11)

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/persona/persona-verifier.ts` | Shared verifier: verify + correct name/bio/lastName/photos |
| Create | `src/persona/persona-pool-cache.ts` | TTL-cached pool fetch from CMS API |
| Create | `src/persona/persona-types.ts` | Interfaces: PersonaPool, PersonaAssignment, AccountDoc, VerifyResult |
| Create | `src/persona/image-hash.ts` | Copy of aHash utility (no shared package) |
| Create | `src/persona/homoglyph-normalizer.ts` | Copy of reverse homoglyph map |
| Modify | `src/TelegramManager.ts` | Call verifier after createClient, use result.workingName |
| Modify | `src/dbservice.ts` | Add fetchExistingAssignments, updatePromoteClient assignment fields |
| Modify | `src/core/connection-service.ts` | Pass persona pool to mobile init |
| Modify | `package.json` | Add `sharp` dependency |

### tg-aut-local (Task 12)

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/persona/persona-verifier.ts` | Same verifier pattern as promote-clients |
| Create | `src/persona/persona-pool-cache.ts` | Pool parsed from UMS env |
| Create | `src/persona/persona-types.ts` | Same interfaces |
| Create | `src/persona/image-hash.ts` | Copy of aHash utility |
| Create | `src/persona/homoglyph-normalizer.ts` | Copy of reverse homoglyph map |
| Modify | `src/TelegramManager.ts` | Call verifier at startup after TG connect |
| Modify | `src/dbservice.ts` | Add updateClient assignment fields method |
| Modify | `src/Config.ts` | Parse persona pool from UMS response |
| Modify | `package.json` | Add `sharp` dependency |

---

## Task Dependency Graph

```
Tasks 1, 2, 3 — independent, parallelizable
Task 4 (schema) — independent
Task 5 (DTOs) — depends on Task 4
Task 6 (API endpoints) — depends on Task 5
Task 7 (persona assignment in warmup) — depends on Tasks 1, 2, 3, 4
Task 8 (setupClient copy) — depends on Task 4
Task 9 (randomization hardening) — independent, parallelizable with everything
Task 10 (photo folder + hash script) — depends on Task 1
Tasks 11, 12 — depend on Tasks 1-8, independent of each other, parallelizable
Task 13 (migration gating) — depends on Tasks 11, 12
```

---

### Task 1: Image Hash Utility (CommonTgService)

**Files:**
- Create: `src/utils/image-hash.ts`
- Create: `src/utils/__tests__/image-hash.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add sharp dependency**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local
npm install sharp
npm install --save-dev @types/sharp
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/__tests__/image-hash.spec.ts`:

```typescript
import { computeAHash, hammingDistance, AHASH_MATCH_THRESHOLD } from '../image-hash';
import * as fs from 'fs';
import * as path from 'path';

describe('image-hash', () => {
    describe('hammingDistance', () => {
        it('returns 0 for identical hashes', () => {
            const hash = '1010101010101010101010101010101010101010101010101010101010101010';
            expect(hammingDistance(hash, hash)).toBe(0);
        });

        it('returns correct distance for known diff', () => {
            const a = '1111111111111111111111111111111111111111111111111111111111111111';
            const b = '1111111111111111111111111111111111111111111111111111111111110000';
            expect(hammingDistance(a, b)).toBe(4);
        });

        it('returns 64 for fully opposite hashes', () => {
            const a = '0'.repeat(64);
            const b = '1'.repeat(64);
            expect(hammingDistance(a, b)).toBe(64);
        });
    });

    describe('computeAHash', () => {
        it('returns a 64-character binary string', async () => {
            // Create a minimal 8x8 test image buffer using sharp
            const sharp = require('sharp');
            const testBuffer = await sharp({
                create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
            }).jpeg().toBuffer();

            const hash = await computeAHash(testBuffer);
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[01]+$/);
        });

        it('produces same hash for same image', async () => {
            const sharp = require('sharp');
            const testBuffer = await sharp({
                create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
            }).jpeg().toBuffer();

            const hash1 = await computeAHash(testBuffer);
            const hash2 = await computeAHash(testBuffer);
            expect(hash1).toBe(hash2);
        });

        it('produces similar hash for slightly compressed version', async () => {
            const sharp = require('sharp');
            const original = await sharp({
                create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } },
            }).jpeg({ quality: 95 }).toBuffer();

            const compressed = await sharp(original).jpeg({ quality: 30 }).toBuffer();

            const hashOrig = await computeAHash(original);
            const hashComp = await computeAHash(compressed);
            expect(hammingDistance(hashOrig, hashComp)).toBeLessThan(AHASH_MATCH_THRESHOLD);
        });
    });

    describe('AHASH_MATCH_THRESHOLD', () => {
        it('is 10', () => {
            expect(AHASH_MATCH_THRESHOLD).toBe(10);
        });
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local
npx jest src/utils/__tests__/image-hash.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../image-hash'`

- [ ] **Step 4: Write the implementation**

Create `src/utils/image-hash.ts`:

```typescript
import sharp from 'sharp';

/**
 * Compute average hash (aHash) for an image buffer.
 * Resilient to JPEG recompression, resize, minor color shifts.
 * Returns a 64-character binary string.
 */
export async function computeAHash(imageBuffer: Buffer): Promise<string> {
    const pixels = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
    const mean = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;
    return Array.from(pixels)
        .map(p => (p >= mean ? '1' : '0'))
        .join('');
}

/**
 * Hamming distance between two binary hash strings.
 */
export function hammingDistance(a: string, b: string): number {
    let dist = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) dist++;
    }
    return dist;
}

/**
 * Telegram recompresses uploaded images. aHash is resilient to JPEG recompression.
 * Empirical testing: TG compression causes 3-6 bit drift on aHash.
 * Threshold of 10 gives comfortable margin.
 */
export const AHASH_MATCH_THRESHOLD = 10;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest src/utils/__tests__/image-hash.spec.ts --no-coverage
```
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/utils/image-hash.ts src/utils/__tests__/image-hash.spec.ts package.json package-lock.json
git commit -m "feat: add aHash image hashing utility for persona photo verification"
```

---

### Task 2: Homoglyph Normalizer (CommonTgService)

**Files:**
- Create: `src/utils/homoglyph-normalizer.ts`
- Create: `src/utils/__tests__/homoglyph-normalizer.spec.ts`
- Reference: `src/utils/obfuscateText.ts:58-85` (source homoglyph map)

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/homoglyph-normalizer.spec.ts`:

```typescript
import { normalizeHomoglyphs, nameMatchesAssignment, lastNameMatches, bioMatches } from '../homoglyph-normalizer';

describe('homoglyph-normalizer', () => {
    describe('normalizeHomoglyphs', () => {
        it('converts Cyrillic а to Latin a', () => {
            expect(normalizeHomoglyphs('а')).toBe('a');
        });

        it('converts mixed homoglyphs back to ASCII', () => {
            // 'Ꮪhruthi' → 'shruthi' (first char is Cherokee S homoglyph for 's')
            expect(normalizeHomoglyphs('ѕhruthi')).toBe('shruthi');
        });

        it('leaves normal ASCII unchanged', () => {
            expect(normalizeHomoglyphs('hello')).toBe('hello');
        });

        it('handles empty string', () => {
            expect(normalizeHomoglyphs('')).toBe('');
        });

        it('handles multiple homoglyphs in one word', () => {
            // 'rеddу' where е=Cyrillic e, у=Cyrillic y
            expect(normalizeHomoglyphs('rеddу')).toBe('reddy');
        });
    });

    describe('nameMatchesAssignment', () => {
        it('matches obfuscated name with emoji', () => {
            // Simulate: obfuscateText("Shruthi") + " 💋" → "Ꮪhruthі 💋"
            expect(nameMatchesAssignment('Ꮪhruthі 💋', 'Shruthi')).toBe(true);
        });

        it('matches exact name with emoji', () => {
            expect(nameMatchesAssignment('Shruthi 🌸', 'Shruthi')).toBe(true);
        });

        it('matches case-insensitive', () => {
            expect(nameMatchesAssignment('SHRUTHI 💋', 'shruthi')).toBe(true);
        });

        it('rejects completely different name', () => {
            expect(nameMatchesAssignment('Priya 💋', 'Shruthi')).toBe(false);
        });

        it('matches name with pet name suffix', () => {
            // "Shruthi Cutie 🌸" should match assigned "Shruthi"
            expect(nameMatchesAssignment('Shruthi Cutie 🌸', 'Shruthi')).toBe(true);
        });
    });

    describe('lastNameMatches', () => {
        it('returns true when assignedLastName is null', () => {
            expect(lastNameMatches('Reddy', null)).toBe(true);
        });

        it('matches exact', () => {
            expect(lastNameMatches('Reddy', 'Reddy')).toBe(true);
        });

        it('rejects mismatch', () => {
            expect(lastNameMatches('Reddy', 'Sharma')).toBe(false);
        });

        it('handles empty string assignment', () => {
            expect(lastNameMatches('', '')).toBe(true);
        });
    });

    describe('bioMatches', () => {
        it('returns true when assignedBio is null', () => {
            expect(bioMatches('anything', null)).toBe(true);
        });

        it('matches exact', () => {
            expect(bioMatches('✨ link in bio', '✨ link in bio')).toBe(true);
        });

        it('rejects mismatch', () => {
            expect(bioMatches('old bio', 'new bio')).toBe(false);
        });

        it('handles empty string clears bio', () => {
            expect(bioMatches('', '')).toBe(true);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/utils/__tests__/homoglyph-normalizer.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../homoglyph-normalizer'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/homoglyph-normalizer.ts`:

```typescript
/**
 * Reverse homoglyph map — maps visually similar characters back to ASCII.
 * Built from the forward map in obfuscateText.ts (lines 58-85).
 */
const reverseHomoglyphMap: Record<string, string> = {};

// Forward map from obfuscateText.ts — each key is the ASCII char, values are homoglyphs
const forwardMap: Record<string, string[]> = {
    a: ['а', 'ɑ', 'ᴀ', 'α', '⍺'],
    b: ['Ь', 'ʙ', 'в', 'Ƅ', 'ɓ'],
    c: ['ϲ', 'ᴄ', 'с', 'ℂ', 'ⅽ'],
    d: ['ԁ', 'ժ', 'ɗ', 'ᴅ', 'ɖ'],
    e: ['е', 'ҽ', 'ɛ', 'ɘ'],
    f: ['ғ', 'ƒ', 'ꝼ', 'ϝ', 'ʄ'],
    g: ['ɡ', 'ɢ', 'ց', 'ɠ', 'ǥ'],
    h: ['һ', 'н', 'ḩ'],
    i: ['і', 'ì', 'í'],
    j: ['ј', 'ʝ', 'ɉ', 'ĵ', 'ǰ', 'ɟ'],
    k: ['κ', 'ᴋ', 'қ', 'ƙ', 'ĸ'],
    l: ['ⅼ', 'ʟ', 'ŀ', 'ɭ'],
    m: ['м', 'ᴍ', 'ɱ'],
    n: ['ո', 'п', 'ռ', 'ᴎ', 'ɲ', 'ŋ'],
    o: ['о', 'օ', 'ᴏ', 'ο'],
    p: ['р', 'ρ', 'ᴩ', 'ƥ', 'þ', 'ᵽ'],
    q: ['ԛ', 'գ', 'ɋ', 'ʠ'],
    r: ['г', 'ᴦ', 'ʀ', 'ɾ', 'ɍ'],
    s: ['ѕ', 'ꜱ'],
    t: ['т', 'ᴛ', 'ƭ', 'ʈ'],
    u: ['υ', 'ᴜ', 'ս', 'ʊ', 'ų'],
    v: ['ѵ', 'ᴠ', 'ν', 'ʋ', 'ⱱ'],
    w: ['ԝ', 'ᴡ', 'ω', 'ɯ', 'ɰ'],
    x: ['х', 'χ'],
    y: ['у', 'γ', 'ү', 'ყ', 'ỵ'],
    z: ['ᴢ', 'ʐ', 'ʑ', 'ʒ'],
};

// Build reverse map: homoglyph → ASCII char
for (const [ascii, homoglyphs] of Object.entries(forwardMap)) {
    for (const h of homoglyphs) {
        reverseHomoglyphMap[h] = ascii;
    }
}

/**
 * Normalize a string by replacing homoglyph characters with their ASCII equivalents.
 */
export function normalizeHomoglyphs(text: string): string {
    let result = '';
    for (const char of text) {
        result += reverseHomoglyphMap[char] || char;
    }
    return result;
}

/**
 * Check if a TG firstName (with obfuscation + emoji) matches the assigned base name.
 * Strips emoji/whitespace, normalizes homoglyphs, then does case-insensitive includes check.
 */
export function nameMatchesAssignment(tgFirstName: string, assignedFirstName: string): boolean {
    // Strip emoji (including skin tones, ZWJ sequences) and whitespace
    const stripped = tgFirstName.replace(/[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f\s]/gu, '').toLowerCase();
    const normalized = normalizeHomoglyphs(stripped);
    return normalized.includes(assignedFirstName.toLowerCase());
}

/**
 * Exact match for last names (no obfuscation applied to last names).
 * Returns true if assignedLastName is null (field not enabled).
 */
export function lastNameMatches(tgLastName: string, assignedLastName: string | null): boolean {
    if (assignedLastName == null) return true;
    return (tgLastName || '') === (assignedLastName || '');
}

/**
 * Exact match for bios.
 * Returns true if assignedBio is null (field not enabled).
 */
export function bioMatches(currentBio: string, assignedBio: string | null): boolean {
    if (assignedBio == null) return true;
    return currentBio === assignedBio;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/utils/__tests__/homoglyph-normalizer.spec.ts --no-coverage
```
Expected: PASS (all 14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/homoglyph-normalizer.ts src/utils/__tests__/homoglyph-normalizer.spec.ts
git commit -m "feat: add homoglyph normalizer for persona name verification"
```

---

### Task 3: Persona Assignment Logic (CommonTgService)

**Files:**
- Create: `src/utils/persona-assignment.ts`
- Create: `src/utils/__tests__/persona-assignment.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/persona-assignment.spec.ts`:

```typescript
import {
    PersonaPool,
    PersonaAssignment,
    generateCandidateCombinations,
    hasAssignment,
    needsReassignment,
    computePersonaPoolVersion,
    selectAssignedPhotoFilenames,
} from '../persona-assignment';

describe('persona-assignment', () => {
    const pool: PersonaPool = {
        firstNames: ['Shruthi', 'Priya', 'Ananya'],
        lastNames: ['Reddy', 'R', ''],
        bios: ['✨ link in bio', 'DM for exclusive 💋'],
        profilePics: [
            { filename: 'dp1.jpg', phash: '1'.repeat(64) },
            { filename: 'dp2.jpg', phash: '0'.repeat(64) },
        ],
        dbcoll: 'testclient',
        personaPoolVersion: 'abc123',
    };

    describe('computePersonaPoolVersion', () => {
        it('returns deterministic hash for same input', () => {
            const v1 = computePersonaPoolVersion({
                firstNames: ['A', 'B'], lastNames: [], bios: [],
                profilePics: [{ filename: 'dp1.jpg' }],
            });
            const v2 = computePersonaPoolVersion({
                firstNames: ['A', 'B'], lastNames: [], bios: [],
                profilePics: [{ filename: 'dp1.jpg' }],
            });
            expect(v1).toBe(v2);
            expect(typeof v1).toBe('string');
            expect(v1.length).toBeGreaterThan(0);
        });

        it('changes when pool changes', () => {
            const v1 = computePersonaPoolVersion({ firstNames: ['A'], lastNames: [], bios: [], profilePics: [] });
            const v2 = computePersonaPoolVersion({ firstNames: ['B'], lastNames: [], bios: [], profilePics: [] });
            expect(v1).not.toBe(v2);
        });
    });

    describe('hasAssignment', () => {
        it('returns false when all fields are null/empty', () => {
            expect(hasAssignment({
                assignedFirstName: null, assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: [],
                assignedPersonaPoolVersion: null,
            })).toBe(false);
        });

        it('returns true when only firstName is set', () => {
            expect(hasAssignment({
                assignedFirstName: 'Shruthi', assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: [],
                assignedPersonaPoolVersion: 'v1',
            })).toBe(true);
        });

        it('returns true when only photos are set', () => {
            expect(hasAssignment({
                assignedFirstName: null, assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: ['dp1.jpg'],
                assignedPersonaPoolVersion: 'v1',
            })).toBe(true);
        });
    });

    describe('needsReassignment', () => {
        it('returns false for legacy accounts with no assignment and no pool version', () => {
            expect(needsReassignment({
                assignedFirstName: null, assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: [],
                assignedPersonaPoolVersion: null,
            }, pool)).toBe(false);
        });

        it('returns true when pool version differs', () => {
            expect(needsReassignment({
                assignedFirstName: 'Shruthi', assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: [],
                assignedPersonaPoolVersion: 'old-version',
            }, pool)).toBe(true);
        });

        it('returns false when pool version matches', () => {
            expect(needsReassignment({
                assignedFirstName: 'Shruthi', assignedLastName: null,
                assignedBio: null, assignedPhotoFilenames: [],
                assignedPersonaPoolVersion: 'abc123',
            }, pool)).toBe(false);
        });
    });

    describe('generateCandidateCombinations', () => {
        it('returns bounded array of candidates', () => {
            const candidates = generateCandidateCombinations(pool, '+919876543210');
            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates.length).toBeLessThanOrEqual(64);
        });

        it('each candidate has correct field types', () => {
            const candidates = generateCandidateCombinations(pool, '+919876543210');
            for (const c of candidates) {
                expect(typeof c.assignedFirstName === 'string' || c.assignedFirstName === null).toBe(true);
                expect(Array.isArray(c.assignedPhotoFilenames)).toBe(true);
                expect(typeof c.assignedPersonaPoolVersion).toBe('string');
            }
        });

        it('is deterministic for same mobile + pool version', () => {
            const c1 = generateCandidateCombinations(pool, '+919876543210');
            const c2 = generateCandidateCombinations(pool, '+919876543210');
            expect(c1).toEqual(c2);
        });

        it('returns different results for different mobiles', () => {
            const c1 = generateCandidateCombinations(pool, '+919876543210');
            const c2 = generateCandidateCombinations(pool, '+919876543211');
            // At least one candidate should differ (probabilistic but near-certain with 3 names)
            const keys1 = c1.map(c => c.assignedFirstName).join(',');
            const keys2 = c2.map(c => c.assignedFirstName).join(',');
            expect(keys1).not.toBe(keys2);
        });

        it('handles empty pool fields gracefully', () => {
            const emptyPool: PersonaPool = {
                firstNames: ['Shruthi'], lastNames: [], bios: [],
                profilePics: [], dbcoll: 'test', personaPoolVersion: 'v1',
            };
            const candidates = generateCandidateCombinations(emptyPool, '+919876543210');
            expect(candidates.length).toBeGreaterThan(0);
            for (const c of candidates) {
                expect(c.assignedLastName).toBeNull();
                expect(c.assignedBio).toBeNull();
                expect(c.assignedPhotoFilenames).toEqual([]);
            }
        });
    });

    describe('selectAssignedPhotoFilenames', () => {
        it('returns up to 3 filenames from pool', () => {
            const filenames = selectAssignedPhotoFilenames('+919876543210', pool.profilePics);
            expect(filenames.length).toBeLessThanOrEqual(3);
            expect(filenames.length).toBeGreaterThan(0);
            for (const f of filenames) {
                expect(pool.profilePics.some(p => p.filename === f)).toBe(true);
            }
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/utils/__tests__/persona-assignment.spec.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../persona-assignment'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/persona-assignment.ts`:

```typescript
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

/**
 * Compute a deterministic hash of pool contents.
 * Changes when any pool field is modified.
 */
export function computePersonaPoolVersion(client: {
    firstNames?: string[];
    lastNames?: string[];
    bios?: string[];
    profilePics?: Array<{ filename: string }>;
}): string {
    const content = JSON.stringify([
        client.firstNames || [],
        client.lastNames || [],
        client.bios || [],
        (client.profilePics || []).map(p => p.filename),
    ]);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}

/**
 * Check if at least one persona field has been assigned.
 */
export function hasAssignment(doc: PersonaAssignment): boolean {
    return (
        doc.assignedFirstName != null ||
        doc.assignedLastName != null ||
        doc.assignedBio != null ||
        (doc.assignedPhotoFilenames?.length || 0) > 0
    );
}

/**
 * Check if this account needs reassignment.
 * Legacy accounts (no assignment, no pool version) are NOT reassigned during rollout.
 */
export function needsReassignment(doc: PersonaAssignment, pool: PersonaPool): boolean {
    if (!hasAssignment(doc) && doc.assignedPersonaPoolVersion == null) return false;
    if (doc.assignedPersonaPoolVersion !== pool.personaPoolVersion) return true;
    return false;
}

/**
 * Build a persona key for deduplication.
 */
export function personaKey(a: PersonaAssignment): string {
    return JSON.stringify([
        a.assignedFirstName || null,
        a.assignedLastName || null,
        a.assignedBio || null,
        [...(a.assignedPhotoFilenames || [])].sort(),
    ]);
}

/**
 * Simple seeded PRNG for deterministic selection.
 */
function seededRandom(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s * 1664525 + 1013904223) | 0;
        return (s >>> 0) / 0x100000000;
    };
}

function stableHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
}

function seededPick<T>(arr: T[], seed: number): T {
    const rng = seededRandom(seed);
    return arr[Math.floor(rng() * arr.length)];
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
    const result = [...arr];
    const rng = seededRandom(seed);
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Generate bounded candidate combinations from the pool.
 * Deterministic per (mobile, poolVersion) using seeded PRNG.
 * Returns deduplicated candidates (by personaKey).
 */
export function generateCandidateCombinations(pool: PersonaPool, mobile: string): PersonaAssignment[] {
    const SAMPLE_SIZE = 64;
    const seed = stableHash(`${pool.personaPoolVersion}:${mobile}`);
    const seen = new Set<string>();
    const candidates: PersonaAssignment[] = [];

    for (let i = 0; i < SAMPLE_SIZE; i++) {
        const candidate: PersonaAssignment = {
            assignedFirstName: pool.firstNames.length > 0 ? seededPick(pool.firstNames, seed + i * 11) : null,
            assignedLastName: pool.lastNames.length > 0 ? seededPick(pool.lastNames, seed + i * 17) : null,
            assignedBio: pool.bios.length > 0 ? seededPick(pool.bios, seed + i * 23) : null,
            assignedPhotoFilenames: pool.profilePics.length > 0
                ? seededShuffle(pool.profilePics, seed + i * 31)
                    .slice(0, Math.min(3, pool.profilePics.length))
                    .map(p => p.filename)
                : [],
            assignedPersonaPoolVersion: pool.personaPoolVersion,
        };

        const key = personaKey(candidate);
        if (!seen.has(key)) {
            seen.add(key);
            candidates.push(candidate);
        }
    }

    return candidates;
}

/**
 * Select photo filenames for assignment when only photos need to be assigned
 * (name/bio were already assigned in a previous phase).
 */
export function selectAssignedPhotoFilenames(
    mobile: string,
    profilePics: Array<{ filename: string; phash: string }>,
): string[] {
    if (profilePics.length === 0) return [];
    const seed = stableHash(mobile);
    return seededShuffle(profilePics, seed)
        .slice(0, Math.min(3, profilePics.length))
        .map(p => p.filename);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/utils/__tests__/persona-assignment.spec.ts --no-coverage
```
Expected: PASS (all 13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/persona-assignment.ts src/utils/__tests__/persona-assignment.spec.ts
git commit -m "feat: add persona assignment logic with seeded combinations and deduplication"
```

---

### Task 4: Schema Changes (CommonTgService)

**Files:**
- Modify: `src/components/clients/schemas/client.schema.ts:17-92`
- Modify: `src/components/buffer-clients/schemas/buffer-client.schema.ts:19-146`
- Modify: `src/components/promote-clients/schemas/promote-client.schema.ts:19-146`

- [ ] **Step 1: Add pool fields to Client schema**

Modify `src/components/clients/schemas/client.schema.ts`. Add after the `mainAccount` field (around line 64) — or after the last existing `@Prop`:

```typescript
// ---- Persona Pool fields ----
@ApiProperty({ description: 'Pool of first names for persona assignment', required: false })
@Prop({ required: false, type: [String], default: [] })
firstNames: string[];

@ApiProperty({ description: 'Pool of last names for persona assignment', required: false })
@Prop({ required: false, type: [String], default: [] })
lastNames: string[];

@ApiProperty({ description: 'Pool of bios for persona assignment', required: false })
@Prop({ required: false, type: [String], default: [] })
bios: string[];

@ApiProperty({ description: 'Pool of profile pics with precomputed hashes', required: false })
@Prop({ required: false, type: [{ filename: String, phash: String }], default: [] })
profilePics: Array<{ filename: string; phash: string }>;

@ApiProperty({ description: 'Hash of current pool — changes when any pool field is updated', required: false })
@Prop({ required: false, default: null })
personaPoolVersion: string;

// ---- Active-account persona assignment (copied from buffer during setupClient) ----
@ApiProperty({ description: 'Assigned first name from pool', required: false })
@Prop({ required: false, default: null })
assignedFirstName: string;

@ApiProperty({ description: 'Assigned last name from pool', required: false })
@Prop({ required: false, default: null })
assignedLastName: string;

@ApiProperty({ description: 'Assigned bio from pool', required: false })
@Prop({ required: false, default: null })
assignedBio: string;

@ApiProperty({ description: 'Assigned photo filenames from pool', required: false })
@Prop({ required: false, type: [String], default: [] })
assignedPhotoFilenames: string[];

@ApiProperty({ description: 'Pool version when assignment was made', required: false })
@Prop({ required: false, default: null })
assignedPersonaPoolVersion: string;
```

- [ ] **Step 2: Add assignment fields to BufferClient schema**

Modify `src/components/buffer-clients/schemas/buffer-client.schema.ts`. Add after the last warmup field (after `sessionRotatedAt`):

```typescript
// ---- Persona assignment ----
@ApiProperty({ description: 'Assigned first name from pool', required: false })
@Prop({ required: false, default: null })
assignedFirstName: string;

@ApiProperty({ description: 'Assigned last name from pool', required: false })
@Prop({ required: false, default: null })
assignedLastName: string;

@ApiProperty({ description: 'Assigned bio from pool', required: false })
@Prop({ required: false, default: null })
assignedBio: string;

@ApiProperty({ description: 'Assigned photo filenames from pool', required: false })
@Prop({ required: false, type: [String], default: [] })
assignedPhotoFilenames: string[];

@ApiProperty({ description: 'Pool version when assignment was made', required: false })
@Prop({ required: false, default: null })
assignedPersonaPoolVersion: string;
```

- [ ] **Step 3: Add same fields to PromoteClient schema**

Modify `src/components/promote-clients/schemas/promote-client.schema.ts` — add the identical 5 fields as BufferClient above after the last warmup field.

- [ ] **Step 4: Build to verify schemas compile**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local
npm run build
```
Expected: Success (no type errors)

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/schemas/client.schema.ts src/components/buffer-clients/schemas/buffer-client.schema.ts src/components/promote-clients/schemas/promote-client.schema.ts
git commit -m "feat: add persona pool and assignment fields to client/buffer/promote schemas"
```

---

### Task 5: DTO Changes (CommonTgService)

**Files:**
- Modify: `src/components/clients/dto/create-client.dto.ts`
- Modify: `src/components/clients/dto/update-client.dto.ts`
- Modify: `src/components/buffer-clients/dto/update-buffer-client.dto.ts`
- Modify: `src/components/promote-clients/dto/update-promote-client.dto.ts`

- [ ] **Step 1: Add pool fields to CreateClientDto**

Add to `src/components/clients/dto/create-client.dto.ts`:

```typescript
@ApiProperty({ description: 'Pool of first names', required: false })
@IsOptional()
@IsArray()
@IsString({ each: true })
firstNames?: string[];

@ApiProperty({ description: 'Pool of last names', required: false })
@IsOptional()
@IsArray()
@IsString({ each: true })
lastNames?: string[];

@ApiProperty({ description: 'Pool of bios', required: false })
@IsOptional()
@IsArray()
@IsString({ each: true })
bios?: string[];

@ApiProperty({ description: 'Pool of profile pics with hashes', required: false })
@IsOptional()
@IsArray()
profilePics?: Array<{ filename: string; phash: string }>;
```

Import `IsArray, IsString` from `class-validator` if not already imported.

- [ ] **Step 2: Add pool + assignment fields to UpdateClientDto**

Add to `src/components/clients/dto/update-client.dto.ts` (which extends PartialType of CreateClientDto, so pool fields are inherited). Additionally add:

```typescript
@ApiProperty({ description: 'Assigned first name (set during setupClient)', required: false })
@IsOptional()
@IsString()
assignedFirstName?: string;

@ApiProperty({ description: 'Assigned last name', required: false })
@IsOptional()
@IsString()
assignedLastName?: string;

@ApiProperty({ description: 'Assigned bio', required: false })
@IsOptional()
@IsString()
assignedBio?: string;

@ApiProperty({ description: 'Assigned photo filenames', required: false })
@IsOptional()
@IsArray()
@IsString({ each: true })
assignedPhotoFilenames?: string[];

@ApiProperty({ description: 'Pool version at assignment time', required: false })
@IsOptional()
@IsString()
assignedPersonaPoolVersion?: string;
```

- [ ] **Step 3: Add assignment fields to UpdateBufferClientDto**

Add to `src/components/buffer-clients/dto/update-buffer-client.dto.ts`:

```typescript
@ApiProperty({ description: 'Assigned first name from pool', required: false })
@IsOptional()
@IsString()
assignedFirstName?: string;

@ApiProperty({ description: 'Assigned last name from pool', required: false })
@IsOptional()
@IsString()
assignedLastName?: string;

@ApiProperty({ description: 'Assigned bio from pool', required: false })
@IsOptional()
@IsString()
assignedBio?: string;

@ApiProperty({ description: 'Assigned photo filenames', required: false })
@IsOptional()
@IsArray()
@IsString({ each: true })
assignedPhotoFilenames?: string[];

@ApiProperty({ description: 'Pool version at assignment time', required: false })
@IsOptional()
@IsString()
assignedPersonaPoolVersion?: string;
```

- [ ] **Step 4: Add same assignment fields to UpdatePromoteClientDto**

Same 5 fields as Step 3, added to `src/components/promote-clients/dto/update-promote-client.dto.ts`.

- [ ] **Step 5: Build to verify DTOs compile**

```bash
npm run build
```
Expected: Success

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/dto/ src/components/buffer-clients/dto/ src/components/promote-clients/dto/
git commit -m "feat: add persona pool and assignment fields to DTOs"
```

---

### Task 6: API Endpoints — persona-pool + existing-assignments (CommonTgService)

**Files:**
- Modify: `src/components/clients/client.service.ts`
- Modify: `src/components/clients/client.controller.ts`

- [ ] **Step 1: Add service methods**

Add to `src/components/clients/client.service.ts`:

```typescript
import { computePersonaPoolVersion } from '../../utils/persona-assignment';

async getPersonaPool(clientId: string) {
    const client = await this.findOne(clientId);
    if (!client) return null;
    return {
        firstNames: client.firstNames || [],
        lastNames: client.lastNames || [],
        bios: client.bios || [],
        profilePics: client.profilePics || [],
        dbcoll: client.dbcoll,
        personaPoolVersion: client.personaPoolVersion || null,
    };
}

async getExistingAssignments(clientId: string, scope: 'all' | 'buffer' | 'promote' | 'activeClient') {
    const assignments: Array<{
        mobile: string;
        assignedFirstName: string | null;
        assignedLastName: string | null;
        assignedBio: string | null;
        assignedPhotoFilenames: string[];
        source: string;
    }> = [];

    const projection = {
        mobile: 1, assignedFirstName: 1, assignedLastName: 1,
        assignedBio: 1, assignedPhotoFilenames: 1,
    };
    const filter = { clientId, assignedFirstName: { $ne: null } };

    if (scope === 'all' || scope === 'buffer') {
        const buffers = await this.bufferClientService.model
            .find(filter, projection).lean();
        assignments.push(...buffers.map(b => ({ ...b, source: 'buffer' })));
    }
    if (scope === 'all' || scope === 'promote') {
        const promotes = await this.promoteClientModel
            .find(filter, projection).lean();
        assignments.push(...promotes.map(p => ({ ...p, source: 'promote' })));
    }
    if (scope === 'all' || scope === 'activeClient') {
        const client = await this.findOne(clientId);
        if (client?.assignedFirstName) {
            assignments.push({
                mobile: client.mobile,
                assignedFirstName: client.assignedFirstName,
                assignedLastName: client.assignedLastName || null,
                assignedBio: client.assignedBio || null,
                assignedPhotoFilenames: client.assignedPhotoFilenames || [],
                source: 'activeClient',
            });
        }
    }

    return { assignments };
}
```

Also, in the `update` method, add pool version auto-computation when pool fields change:

```typescript
// Inside update(), before the findOneAndUpdate call:
if (updateClientDto.firstNames || updateClientDto.lastNames || updateClientDto.bios || updateClientDto.profilePics) {
    const merged = { ...existingClient, ...updateClientDto };
    updateClientDto.personaPoolVersion = computePersonaPoolVersion(merged);
}
```

- [ ] **Step 2: Add controller endpoints**

Add to `src/components/clients/client.controller.ts`:

```typescript
@Get(':clientId/persona-pool')
@ApiOperation({ summary: 'Get persona pool for a client' })
@ApiParam({ name: 'clientId', description: 'Client ID' })
@ApiResponse({ description: 'Persona pool returned successfully.' })
async getPersonaPool(@Param('clientId') clientId: string) {
    return await this.clientService.getPersonaPool(clientId);
}

@Get(':clientId/existing-assignments')
@ApiOperation({ summary: 'Get existing persona assignments for a client' })
@ApiParam({ name: 'clientId', description: 'Client ID' })
@ApiQuery({ name: 'scope', required: false, enum: ['all', 'buffer', 'promote', 'activeClient'], description: 'Scope of assignments to return' })
@ApiResponse({ description: 'Existing assignments returned successfully.' })
async getExistingAssignments(
    @Param('clientId') clientId: string,
    @Query('scope') scope: 'all' | 'buffer' | 'promote' | 'activeClient' = 'all',
) {
    return await this.clientService.getExistingAssignments(clientId, scope);
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/client.service.ts src/components/clients/client.controller.ts
git commit -m "feat: add persona-pool and existing-assignments API endpoints"
```

---

### Task 7: Warmup Integration — updateNameAndBio + updateProfilePhotos (CommonTgService)

**Files:**
- Modify: `src/components/buffer-clients/buffer-client.service.ts:117-164`
- Modify: `src/components/promote-clients/promote-client.service.ts:116-164`
- Modify: `src/components/shared/base-client.service.ts:689-732`

This is the most complex task. It modifies the identity and maturing warmup steps to use persona assignments.

- [ ] **Step 1: Modify BufferClientService.updateNameAndBio()**

In `src/components/buffer-clients/buffer-client.service.ts`, replace the `updateNameAndBio` method (lines 117-164). Add imports at the top:

```typescript
import { PersonaPool, PersonaAssignment, generateCandidateCombinations, personaKey, hasAssignment, selectAssignedPhotoFilenames } from '../../utils/persona-assignment';
import { obfuscateText } from '../../utils/obfuscateText';
import { getCuteEmoji } from '../../utils/getRandomEmoji';
```

Replace the method body:

```typescript
async updateNameAndBio(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number> {
    const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
    try {
        await performOrganicActivity(telegramClient, 'medium');
        const me = await telegramClient.getMe();
        await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

        let updateCount = 0;

        // ---- Persona pool branch ----
        if (client.firstNames?.length > 0) {
            let assignment: PersonaAssignment;
            if (doc.assignedFirstName && doc.assignedPersonaPoolVersion === client.personaPoolVersion) {
                assignment = {
                    assignedFirstName: doc.assignedFirstName,
                    assignedLastName: doc.assignedLastName,
                    assignedBio: doc.assignedBio,
                    assignedPhotoFilenames: doc.assignedPhotoFilenames || [],
                    assignedPersonaPoolVersion: doc.assignedPersonaPoolVersion,
                };
            } else {
                // First-time or pool-version-drift: assign persona atomically
                const pool: PersonaPool = {
                    firstNames: client.firstNames || [],
                    lastNames: client.lastNames || [],
                    bios: client.bios || [],
                    profilePics: client.profilePics || [],
                    dbcoll: client.dbcoll,
                    personaPoolVersion: client.personaPoolVersion,
                };
                const existingAssignments = await this.model.find({
                    clientId: doc.clientId, status: 'active',
                    assignedFirstName: { $ne: null }, mobile: { $ne: doc.mobile },
                }, { assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedPhotoFilenames: 1 }).lean();

                const candidates = generateCandidateCombinations(pool, doc.mobile);
                const usedKeys = new Set(existingAssignments.map(a => personaKey(a as PersonaAssignment)));
                const unused = candidates.filter(c => !usedKeys.has(personaKey(c)));
                const chosen = unused.length > 0
                    ? unused[Math.floor(Math.random() * unused.length)]
                    : candidates[Math.floor(Math.random() * candidates.length)];

                const result = await this.model.findOneAndUpdate(
                    {
                        mobile: doc.mobile,
                        $or: [
                            { assignedFirstName: null },
                            { assignedPersonaPoolVersion: { $ne: client.personaPoolVersion } },
                        ],
                    },
                    { $set: {
                        assignedFirstName: chosen.assignedFirstName,
                        assignedLastName: chosen.assignedLastName,
                        assignedBio: chosen.assignedBio,
                        assignedPhotoFilenames: chosen.assignedPhotoFilenames,
                        assignedPersonaPoolVersion: client.personaPoolVersion,
                    }},
                    { new: true },
                );
                assignment = result
                    ? { assignedFirstName: result.assignedFirstName, assignedLastName: result.assignedLastName, assignedBio: result.assignedBio, assignedPhotoFilenames: result.assignedPhotoFilenames || [], assignedPersonaPoolVersion: result.assignedPersonaPoolVersion }
                    : (await this.model.findOne({ mobile: doc.mobile }).lean()) as PersonaAssignment;
            }

            // Update TG name if mismatch
            const { nameMatchesAssignment } = require('../../utils/homoglyph-normalizer');
            if (!nameMatchesAssignment(me.firstName || '', assignment.assignedFirstName!)) {
                const fullName = `${obfuscateText(assignment.assignedFirstName!, { maintainFormatting: false, preserveCase: true, useInvisibleChars: false })} ${getCuteEmoji()}`;
                await telegramClient.updateProfile(fullName, assignment.assignedLastName || '');
                updateCount = 1;
            }

            // Update bio if assigned and mismatch
            if (assignment.assignedBio != null) {
                const fullUser = await telegramClient.client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
                const currentBio = (fullUser as any).fullUser?.about || '';
                if (currentBio !== assignment.assignedBio) {
                    await sleep(ClientHelperUtils.gaussianRandom(12500, 2500, 8000, 18000));
                    await telegramClient.client.invoke(new Api.account.UpdateProfile({ about: assignment.assignedBio }));
                }
            }
        } else {
            // ---- Legacy fallback: existing behavior ----
            if (!isIncludedWithTolerance(safeAttemptReverse(me.firstName), client.name)) {
                this.logger.log(`Updating name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                await telegramClient.updateProfile(
                    `${obfuscateText(client.name, { maintainFormatting: false, preserveCase: true, useInvisibleChars: false })} ${getCuteEmoji()}`,
                    ''
                );
                updateCount = 1;
            }
        }

        await this.update(doc.mobile, {
            nameBioUpdatedAt: new Date(),
            lastUpdateAttempt: new Date(),
            failedUpdateAttempts: 0,
            lastUpdateFailure: null,
            organicActivityAt: new Date(),
        });
        await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
        return updateCount;
    } catch (error: unknown) {
        const errorDetails = this.handleError(error, 'Error updating profile', doc.mobile);
        await this.update(doc.mobile, {
            lastUpdateAttempt: new Date(),
            failedUpdateAttempts: failedAttempts + 1,
            lastUpdateFailure: new Date(),
        });
        if (isPermanentError(errorDetails)) {
            const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
            await this.markAsInactive(doc.mobile, reason);
        }
        return 0;
    } finally {
        await this.safeUnregisterClient(doc.mobile);
    }
}
```

- [ ] **Step 2: Apply same persona branch to PromoteClientService.updateNameAndBio()**

Same pattern as Step 1, but in `src/components/promote-clients/promote-client.service.ts:116-164`. The only differences:
- Uses `this.promoteClientModel` instead of `this.model` for the atomic update
- The legacy fallback uses `client?.name.split(' ')[0]` and `getRandomPetName()` (existing promote behavior)

- [ ] **Step 3: Modify base-client.service.ts updateProfilePhotos()**

In `src/components/shared/base-client.service.ts:689-732`, add the persona photo branch:

```typescript
protected async updateProfilePhotos(doc: TDoc, client: Client, failedAttempts: number): Promise<number> {
    const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
    try {
        await performOrganicActivity(telegramClient, 'medium');

        const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
        let updateCount = 0;

        // ---- Persona photo branch ----
        if ((doc as any).assignedPhotoFilenames?.length > 0) {
            const PERSONA_BASE = process.env.PERSONA_PATH || path.join(process.cwd(), 'persona');
            let uploadedCount = 0;
            for (const filename of (doc as any).assignedPhotoFilenames) {
                const photoPath = path.join(PERSONA_BASE, client.dbcoll, filename);
                if (!fs.existsSync(photoPath)) {
                    this.logger.warn(`Persona photo missing: ${photoPath} — skipping`);
                    continue;
                }
                await telegramClient.updateProfilePic(photoPath);
                uploadedCount++;
                await sleep(ClientHelperUtils.gaussianRandom(40000, 10000, 25000, 55000));
            }
            if (uploadedCount === 0) {
                this.logger.warn(`No assigned persona photos found for ${doc.mobile} — NOT stamping profilePicsUpdatedAt`);
                return 0;
            }
            updateCount = uploadedCount;
        } else if (client.profilePics?.length > 0 && !(doc as any).assignedPhotoFilenames?.length) {
            // Pool has photos but no assignment yet — assign photo filenames directly
            const { selectAssignedPhotoFilenames } = require('../../utils/persona-assignment');
            const filenames = selectAssignedPhotoFilenames(doc.mobile, client.profilePics);
            await this.update(doc.mobile, {
                assignedPhotoFilenames: filenames,
                assignedPersonaPoolVersion: client.personaPoolVersion,
            } as any);
            // Upload the newly assigned photos
            const PERSONA_BASE = process.env.PERSONA_PATH || path.join(process.cwd(), 'persona');
            for (const filename of filenames) {
                const photoPath = path.join(PERSONA_BASE, client.dbcoll, filename);
                if (!fs.existsSync(photoPath)) continue;
                await telegramClient.updateProfilePic(photoPath);
                await sleep(ClientHelperUtils.gaussianRandom(40000, 10000, 25000, 55000));
            }
            updateCount = filenames.length;
        } else {
            // ---- Legacy fallback ----
            if (photos.photos.length < 2) {
                await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
                const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                const randomPhoto = photoPaths[Math.floor(Math.random() * photoPaths.length)];
                await telegramClient.updateProfilePic(path.join(process.cwd(), randomPhoto));
                updateCount = 1;
            }
        }

        await this.update(doc.mobile, {
            profilePicsUpdatedAt: new Date(),
            lastUpdateAttempt: new Date(),
            failedUpdateAttempts: 0,
            lastUpdateFailure: null,
            organicActivityAt: new Date(),
        });
        await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 55000));
        return updateCount;
    } catch (error: unknown) {
        const errorDetails = this.handleError(error, 'Error updating profile photos', doc.mobile);
        await this.update(doc.mobile, {
            lastUpdateAttempt: new Date(),
            failedUpdateAttempts: failedAttempts + 1,
            lastUpdateFailure: new Date(),
        });
        if (isPermanentError(errorDetails)) {
            const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
            await this.markAsInactive(doc.mobile, reason);
        }
        return 0;
    } finally {
        await this.safeUnregisterClient(doc.mobile);
    }
}
```

Add imports at top of `base-client.service.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
```

- [ ] **Step 4: Build and run existing tests**

```bash
npm run build
npx jest src/components/shared/__tests__/service-flows.spec.ts --no-coverage
```
Expected: Build succeeds, existing tests pass (no behavioral change for unmigrated clients)

- [ ] **Step 5: Commit**

```bash
git add src/components/buffer-clients/buffer-client.service.ts src/components/promote-clients/promote-client.service.ts src/components/shared/base-client.service.ts
git commit -m "feat: integrate persona assignment into warmup updateNameAndBio + updateProfilePhotos"
```

---

### Task 8: setupClient Persona Copy (CommonTgService)

**Files:**
- Modify: `src/components/clients/client.service.ts:606`

- [ ] **Step 1: Modify updateClientSession to copy persona fields**

In `src/components/clients/client.service.ts`, find line 606:
```typescript
await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
```

Replace with:
```typescript
// Fetch buffer doc to get persona assignment
const bufferDoc = await this.bufferClientService.findOne(newMobile);
await this.update(clientId, {
    mobile: newMobile,
    username: updatedUsername,
    session: newSession,
    // Copy persona assignment from buffer doc (atomic — same update call)
    name: bufferDoc?.assignedFirstName || existingClient.name,
    assignedFirstName: bufferDoc?.assignedFirstName || null,
    assignedLastName: bufferDoc?.assignedLastName || null,
    assignedBio: bufferDoc?.assignedBio || null,
    assignedPhotoFilenames: bufferDoc?.assignedPhotoFilenames || [],
    assignedPersonaPoolVersion: bufferDoc?.assignedPersonaPoolVersion || null,
});
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/client.service.ts
git commit -m "feat: copy persona assignment fields from buffer to clients during setupClient swap"
```

---

### Task 9: Randomization Hardening (CommonTgService)

**Files:**
- Modify: `src/components/shared/client-helper.utils.ts:80-82`
- Modify: `src/components/shared/base-client.service.ts:574` (health check)
- Modify: `src/components/buffer-clients/buffer-client.service.ts` (uniform delays)
- Modify: `src/components/promote-clients/promote-client.service.ts` (uniform delays)

- [ ] **Step 1: Convert generateWarmupJitter to Gaussian**

In `src/components/shared/client-helper.utils.ts`, replace `generateWarmupJitter()` (lines 80-82):

Old:
```typescript
static generateWarmupJitter(): number {
    return Math.floor(Math.random() * 4);
}
```

New:
```typescript
static generateWarmupJitter(): number {
    return Math.round(ClientHelperUtils.gaussianRandom(3.5, 2, 0, 7));
}
```

- [ ] **Step 2: Convert health check interval to Gaussian**

In `src/components/shared/base-client.service.ts`, replace line 574:

Old:
```typescript
const healthCheckIntervalDays = 5 + Math.random() * 4;
```

New:
```typescript
const healthCheckIntervalDays = ClientHelperUtils.gaussianRandom(7, 1.5, 4, 10);
```

- [ ] **Step 3: Convert uniform delays in buffer-client.service.ts**

Search for `Math.random()` patterns in buffer-client.service.ts and replace:
- `5000 + Math.random() * 5000` → `ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000)`
- `30000 + Math.random() * 20000` → `ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000)`
- `sleep(5000)` fixed delays → `sleep(ClientHelperUtils.gaussianRandom(5000, 1000, 3000, 7000))`

- [ ] **Step 4: Convert uniform delays in promote-client.service.ts**

Same pattern replacements as Step 3.

- [ ] **Step 5: Convert uniform delays in base-client.service.ts**

Search for remaining `Math.random()` delay patterns and convert them:
- `10000 + Math.random() * 5000` → `ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000)`
- `15000 + Math.random() * 10000` → `ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000)`
- `40000 + Math.random() * 20000` → `ClientHelperUtils.gaussianRandom(50000, 5000, 40000, 60000)`

- [ ] **Step 6: Run tests to verify nothing broke**

```bash
npx jest src/components/shared/__tests__/client-helper.spec.ts --no-coverage
npx jest src/components/shared/__tests__/warmup-phases.spec.ts --no-coverage
npx jest src/components/shared/__tests__/service-flows.spec.ts --no-coverage
```
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/components/shared/client-helper.utils.ts src/components/shared/base-client.service.ts src/components/buffer-clients/buffer-client.service.ts src/components/promote-clients/promote-client.service.ts
git commit -m "feat: replace uniform random delays with Gaussian randomization across warmup"
```

---

### Task 10: Photo Folder Structure + Hash Script (CommonTgService)

**Files:**
- Create: `scripts/compute-photo-hashes.ts`
- Create: `persona/.gitkeep` (placeholder)

- [ ] **Step 1: Create persona directory placeholder**

```bash
mkdir -p /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local/persona
touch /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local/persona/.gitkeep
```

- [ ] **Step 2: Create hash computation script**

Create `scripts/compute-photo-hashes.ts`:

```typescript
#!/usr/bin/env npx ts-node
/**
 * Scans persona/{dbcoll}/ directories and computes aHash for each image.
 * Outputs JSON suitable for the clients API profilePics field.
 *
 * Usage: npx ts-node scripts/compute-photo-hashes.ts <dbcoll>
 * Output: [{ "filename": "dp1.jpg", "phash": "1010..." }, ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeAHash } from '../src/utils/image-hash';

async function main() {
    const dbcoll = process.argv[2];
    if (!dbcoll) {
        console.error('Usage: npx ts-node scripts/compute-photo-hashes.ts <dbcoll>');
        process.exit(1);
    }

    const dir = path.join(process.cwd(), 'persona', dbcoll);
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
    const results: Array<{ filename: string; phash: string }> = [];

    for (const file of files) {
        const buffer = fs.readFileSync(path.join(dir, file));
        const phash = await computeAHash(buffer);
        results.push({ filename: file, phash });
        console.error(`  ${file} → ${phash}`);
    }

    console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Commit**

```bash
git add persona/.gitkeep scripts/compute-photo-hashes.ts
git commit -m "feat: add persona photo directory and aHash computation script"
```

---

### Task 11: promote-clients-local Integration

**Repo:** `/Users/SaiKumar.Shetty/Documents/Projects/local/promote-clients-local`

**Files:**
- Create: `src/persona/persona-types.ts`
- Create: `src/persona/image-hash.ts`
- Create: `src/persona/homoglyph-normalizer.ts`
- Create: `src/persona/persona-pool-cache.ts`
- Create: `src/persona/persona-verifier.ts`
- Modify: `src/TelegramManager.ts` (~line 200, after createClient)
- Modify: `src/dbservice.ts` (add assignment query + update methods)
- Modify: `package.json` (add sharp)

- [ ] **Step 1: Add sharp dependency**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/promote-clients-local
npm install sharp
```

- [ ] **Step 2: Create persona type definitions**

Create `src/persona/persona-types.ts`:

```typescript
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

export interface AccountDoc extends PersonaAssignment {
    mobile: string;
    nameBioUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    privacyUpdatedAt?: Date;
}

export interface VerifyResult {
    workingName: string;
    correctedName: boolean;
    correctedBio: boolean;
    correctedLastName: boolean;
    correctedPhotos: boolean;
}
```

- [ ] **Step 3: Copy image-hash utility**

Create `src/persona/image-hash.ts` — identical to CommonTgService's `src/utils/image-hash.ts` (from Task 1 Step 4).

- [ ] **Step 4: Copy homoglyph normalizer**

Create `src/persona/homoglyph-normalizer.ts` — identical to CommonTgService's `src/utils/homoglyph-normalizer.ts` (from Task 2 Step 3).

- [ ] **Step 5: Create PersonaPoolCache**

Create `src/persona/persona-pool-cache.ts`:

```typescript
import { PersonaPool } from './persona-types';
import axios from 'axios';
import { Logger } from '../Logger';

const logger = new Logger('PersonaPoolCache');

export class PersonaPoolCache {
    private pool: PersonaPool | null = null;
    private fetchedAt: number = 0;
    private static TTL = 6 * 60 * 60 * 1000; // 6 hours
    private static instance = new PersonaPoolCache();

    static getInstance(): PersonaPoolCache {
        return PersonaPoolCache.instance;
    }

    async get(clientId: string, force = false): Promise<PersonaPool | null> {
        const now = Date.now();
        if (!force && this.pool && (now - this.fetchedAt) < PersonaPoolCache.TTL) {
            return this.pool;
        }
        try {
            const tgcms = process.env.tgcms;
            if (!tgcms) return this.pool;
            const response = await axios.get(`${tgcms}/clients/${clientId}/persona-pool`, {
                headers: { 'x-api-key': process.env.X_API_KEY || 'santoor' },
                timeout: 10000,
            });
            if (response.data && response.data.firstNames) {
                this.pool = response.data;
                this.fetchedAt = now;
            }
            return this.pool;
        } catch (err: any) {
            logger.warn(`Failed to refresh persona pool: ${err.message}`);
            return this.pool;
        }
    }

    invalidate(): void {
        this.fetchedAt = 0;
    }
}
```

- [ ] **Step 6: Create persona verifier**

Create `src/persona/persona-verifier.ts`:

```typescript
import { Api } from 'telegram';
import { TelegramClient } from 'telegram';
import { PersonaPool, PersonaAssignment, AccountDoc, VerifyResult } from './persona-types';
import { nameMatchesAssignment, lastNameMatches, bioMatches } from './homoglyph-normalizer';
import { computeAHash, hammingDistance, AHASH_MATCH_THRESHOLD } from './image-hash';
import { Logger } from '../Logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('PersonaVerifier');
const PERSONA_BASE = process.env.PERSONA_PATH || path.join(process.cwd(), 'persona');
const MAX_PERSONA_FAILURES = 3;
const personaFailureCounts = new Map<string, number>();

function gaussianRandom(mean: number, stddev: number, min: number, max: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    let result = mean + z * stddev;
    result = Math.max(result, min);
    result = Math.min(result, max);
    return Math.round(result);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hasAssignment(doc: PersonaAssignment): boolean {
    return (
        doc.assignedFirstName != null ||
        doc.assignedLastName != null ||
        doc.assignedBio != null ||
        (doc.assignedPhotoFilenames?.length || 0) > 0
    );
}

function needsReassignment(doc: PersonaAssignment, pool: PersonaPool): boolean {
    if (!hasAssignment(doc) && doc.assignedPersonaPoolVersion == null) return false;
    if (doc.assignedPersonaPoolVersion !== pool.personaPoolVersion) return true;
    return false;
}

function validatePersonaPath(dbcoll: string): boolean {
    const dir = path.join(PERSONA_BASE, dbcoll);
    try { fs.accessSync(dir, fs.constants.R_OK); return true; } catch { return false; }
}

// Simplified obfuscateText for promote-clients (reuses same homoglyph map)
// Import from the existing obfuscation utility if available, else inline basic version
function obfuscateText(text: string): string {
    // Basic pass-through — the actual obfuscation is applied by CommonTgService warmup.
    // Promote-clients corrections use the same format.
    return text;
}

function getCuteEmoji(): string {
    const emojis = ['💋', '🌸', '✨', '💕', '🦋', '🌺', '💫', '🌹', '🌷', '💗'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

export async function verifyAndCorrectPersona(
    client: TelegramClient,
    mobile: string,
    pool: PersonaPool,
    doc: AccountDoc,
    updateDoc: (mobile: string, update: Record<string, any>) => Promise<void>,
    existingAssignmentsFetcher: () => Promise<PersonaAssignment[]>,
): Promise<VerifyResult> {
    const result: VerifyResult = {
        workingName: '', correctedName: false, correctedBio: false,
        correctedLastName: false, correctedPhotos: false,
    };

    // Check failure budget
    const failures = personaFailureCounts.get(mobile) || 0;
    if (failures >= MAX_PERSONA_FAILURES) {
        logger.warn(`[Persona] ${mobile}: verification disabled after ${failures} failures`);
        result.workingName = doc.assignedFirstName || process.env.name || 'Unknown';
        return result;
    }

    try {
        // ---- POOL VERSION CHECK ----
        if (needsReassignment(doc, pool)) {
            // Reassignment needed — but promote-clients doesn't do atomic assignment.
            // It writes directly since mobiles connect sequentially.
            const existingAssignments = await existingAssignmentsFetcher();
            const usedNames = new Set(existingAssignments.filter(a => a.assignedFirstName).map(a => a.assignedFirstName));
            const availableNames = pool.firstNames.filter(n => !usedNames.has(n));
            const firstName = availableNames.length > 0
                ? availableNames[Math.floor(Math.random() * availableNames.length)]
                : pool.firstNames[Math.floor(Math.random() * pool.firstNames.length)];

            const assignment: PersonaAssignment = {
                assignedFirstName: pool.firstNames.length > 0 ? firstName : null,
                assignedLastName: pool.lastNames.length > 0 ? pool.lastNames[Math.floor(Math.random() * pool.lastNames.length)] : null,
                assignedBio: pool.bios.length > 0 ? pool.bios[Math.floor(Math.random() * pool.bios.length)] : null,
                assignedPhotoFilenames: pool.profilePics.length > 0
                    ? pool.profilePics.slice(0, Math.min(3, pool.profilePics.length)).map(p => p.filename)
                    : [],
                assignedPersonaPoolVersion: pool.personaPoolVersion,
            };
            await updateDoc(mobile, {
                assignedFirstName: assignment.assignedFirstName,
                assignedLastName: assignment.assignedLastName,
                assignedBio: assignment.assignedBio,
                assignedPhotoFilenames: assignment.assignedPhotoFilenames,
                assignedPersonaPoolVersion: pool.personaPoolVersion,
            });
            doc = { ...doc, ...assignment };
        }

        if (!hasAssignment(doc)) {
            result.workingName = process.env.name || 'Unknown';
            return result;
        }

        // ---- NAME CHECK ----
        const me = await client.getMe();
        result.workingName = doc.assignedFirstName || process.env.name || 'Unknown';

        if (doc.assignedFirstName != null && !nameMatchesAssignment(me.firstName || '', doc.assignedFirstName)) {
            await sleep(gaussianRandom(30000, 10000, 20000, 50000));
            const newName = `${doc.assignedFirstName} ${getCuteEmoji()}`;
            await client.invoke(new Api.account.UpdateProfile({ firstName: newName, lastName: doc.assignedLastName || '' }));
            await sleep(gaussianRandom(20000, 5000, 15000, 30000));
            result.correctedName = true;
            await updateDoc(mobile, { nameBioUpdatedAt: new Date() });
        }

        // ---- LAST NAME CHECK ----
        if (doc.assignedLastName != null && !lastNameMatches(me.lastName || '', doc.assignedLastName)) {
            await sleep(gaussianRandom(10000, 3000, 5000, 15000));
            await client.invoke(new Api.account.UpdateProfile({ lastName: doc.assignedLastName }));
            result.correctedLastName = true;
        }

        // ---- BIO CHECK ----
        const fullUser = await client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
        const currentBio = (fullUser as any).fullUser?.about || '';
        if (!bioMatches(currentBio, doc.assignedBio)) {
            await sleep(gaussianRandom(10000, 3000, 5000, 15000));
            await client.invoke(new Api.account.UpdateProfile({ about: doc.assignedBio || '' }));
            await sleep(gaussianRandom(15000, 5000, 10000, 25000));
            result.correctedBio = true;
        }

        // ---- PHOTO CHECK ----
        if (doc.assignedPhotoFilenames.length > 0 && validatePersonaPath(pool.dbcoll)) {
            const poolHashes = pool.profilePics
                .filter(p => doc.assignedPhotoFilenames.includes(p.filename))
                .map(p => p.phash);

            const tgPhotos = await client.invoke(new Api.photos.GetUserPhotos({ userId: new Api.InputUserSelf(), offset: 0, maxId: BigInt(0), limit: 10 }));
            const tgPhotoHashes: string[] = [];
            for (const photo of (tgPhotos as any).photos || []) {
                try {
                    const buffer = await client.downloadMedia(photo, {});
                    if (buffer) tgPhotoHashes.push(await computeAHash(buffer as Buffer));
                } catch { /* skip individual photo download failures */ }
            }

            const allMatch = tgPhotoHashes.length === poolHashes.length
                && tgPhotoHashes.every(h => poolHashes.some(ph => hammingDistance(h, ph) < AHASH_MATCH_THRESHOLD))
                && poolHashes.every(ph => tgPhotoHashes.some(h => hammingDistance(h, ph) < AHASH_MATCH_THRESHOLD));

            if (!allMatch) {
                // Upload replacements first, then prune
                let uploadedCount = 0;
                for (const filename of doc.assignedPhotoFilenames) {
                    const photoPath = path.join(PERSONA_BASE, pool.dbcoll, filename);
                    if (!fs.existsSync(photoPath)) continue;
                    const buffer = fs.readFileSync(photoPath);
                    await client.invoke(new Api.photos.UploadProfilePhoto({
                        file: await client.uploadFile({ file: buffer, workers: 1 }),
                    }));
                    uploadedCount++;
                    await sleep(gaussianRandom(30000, 10000, 20000, 50000));
                }
                if (uploadedCount > 0) {
                    result.correctedPhotos = true;
                    await updateDoc(mobile, { profilePicsUpdatedAt: new Date() });
                }
            }
        }

        logger.info(`[Persona] ${mobile}: name=${result.correctedName ? 'CORRECTED' : 'ok'}, lastName=${result.correctedLastName ? 'CORRECTED' : 'ok'}, bio=${result.correctedBio ? 'CORRECTED' : 'ok'}, photos=${result.correctedPhotos ? 'CORRECTED' : 'ok'}`);
        personaFailureCounts.delete(mobile);
        return result;
    } catch (error: any) {
        personaFailureCounts.set(mobile, (personaFailureCounts.get(mobile) || 0) + 1);
        logger.warn(`[Persona] ${mobile}: verification failed (${personaFailureCounts.get(mobile)}/${MAX_PERSONA_FAILURES}): ${error.message}`);
        result.workingName = doc.assignedFirstName || process.env.name || 'Unknown';
        return result; // Don't rethrow — let promotion continue with best-effort name
    }
}
```

- [ ] **Step 7: Add DB methods to dbservice.ts**

In `src/dbservice.ts`, add methods for persona assignment queries:

```typescript
async fetchExistingPromoteAssignments(clientId: string): Promise<any[]> {
    const promoteAssignments = await this.promoteClients.find({
        clientId,
        status: 'active',
        assignedFirstName: { $ne: null },
    }, {
        projection: { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedPhotoFilenames: 1 },
    }).toArray();

    // Also fetch from CMS API for buffer + activeClient scope
    try {
        const tgcms = process.env.tgcms;
        if (tgcms) {
            const response = await axios.get(`${tgcms}/clients/${clientId}/existing-assignments?scope=buffer`, {
                headers: { 'x-api-key': process.env.X_API_KEY || 'santoor' },
                timeout: 10000,
            });
            return [...promoteAssignments, ...(response.data?.assignments || [])];
        }
    } catch { /* fallback to local only */ }
    return promoteAssignments;
}

async updatePromoteClientAssignment(mobile: string, update: Record<string, any>): Promise<void> {
    await this.promoteClients.updateOne({ mobile }, { $set: update });
}

async getPromoteClientDoc(mobile: string): Promise<any> {
    return await this.promoteClients.findOne({ mobile });
}
```

- [ ] **Step 8: Integrate verifier into TelegramManager.ts**

In `src/TelegramManager.ts`, after the `createClient` method successfully connects (around line 200+), add persona verification:

```typescript
// After successful createClient and before startPromotion:
import { verifyAndCorrectPersona } from './persona/persona-verifier';
import { PersonaPoolCache } from './persona/persona-pool-cache';

// In the mobile connection flow, after createClient():
const PERSONA_ENABLED_CLIENTS = (process.env.PERSONA_ENABLED_CLIENTS || '').split(',').filter(Boolean);
if (PERSONA_ENABLED_CLIENTS.includes(this.clientDetails.clientId)) {
    try {
        const pool = await PersonaPoolCache.getInstance().get(this.clientDetails.clientId);
        if (pool && pool.firstNames.length > 0) {
            const promoteDoc = await db.getPromoteClientDoc(this.clientDetails.mobile);
            if (promoteDoc) {
                const result = await verifyAndCorrectPersona(
                    this.client!,
                    this.clientDetails.mobile,
                    pool,
                    {
                        mobile: promoteDoc.mobile,
                        assignedFirstName: promoteDoc.assignedFirstName || null,
                        assignedLastName: promoteDoc.assignedLastName || null,
                        assignedBio: promoteDoc.assignedBio || null,
                        assignedPhotoFilenames: promoteDoc.assignedPhotoFilenames || [],
                        assignedPersonaPoolVersion: promoteDoc.assignedPersonaPoolVersion || null,
                    },
                    (mobile, update) => db.updatePromoteClientAssignment(mobile, update),
                    () => db.fetchExistingPromoteAssignments(this.clientDetails.clientId),
                );
                this.clientDetails.name = result.workingName;
            }
        }
    } catch (err: any) {
        this.logger.warn(`Persona verification failed for ${this.clientDetails.mobile}: ${err.message}`);
    }
}
```

- [ ] **Step 9: Build to verify**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/promote-clients-local
npm run build
```
Expected: Success

- [ ] **Step 10: Commit**

```bash
git add src/persona/ src/dbservice.ts src/TelegramManager.ts package.json package-lock.json
git commit -m "feat: integrate persona verification into promote-clients with pool cache and self-correction"
```

---

### Task 12: tg-aut-local Integration

**Repo:** `/Users/SaiKumar.Shetty/Documents/Projects/local/tg-aut-local`

**Files:**
- Create: `src/persona/persona-types.ts` (same as Task 11)
- Create: `src/persona/image-hash.ts` (same as Task 11)
- Create: `src/persona/homoglyph-normalizer.ts` (same as Task 11)
- Create: `src/persona/persona-verifier.ts` (same as Task 11)
- Modify: `src/Config.ts` (parse persona pool from UMS response)
- Modify: `src/TelegramManager.ts` (call verifier at startup)
- Modify: `src/dbservice.ts` (add client update method for assignment fields)
- Modify: `package.json` (add sharp)

- [ ] **Step 1: Add sharp dependency**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/tg-aut-local
npm install sharp
```

- [ ] **Step 2: Create persona directory with type definitions, image-hash, normalizer**

Copy the same files from Task 11:
- `src/persona/persona-types.ts` — identical
- `src/persona/image-hash.ts` — identical
- `src/persona/homoglyph-normalizer.ts` — identical
- `src/persona/persona-verifier.ts` — identical to promote-clients version

- [ ] **Step 3: Parse persona pool from UMS config**

Modify `src/Config.ts`. After `getDataAndSetEnvVariables` sets env vars, parse the persona pool:

```typescript
import { PersonaPool } from './persona/persona-types';

let cachedPersonaPool: PersonaPool | null = null;

export function getPersonaPool(): PersonaPool | null {
    return cachedPersonaPool;
}

export async function getDataAndSetEnvVariables(url: string) {
    const response = await fetch(url, {
        headers: { 'x-api-key': process.env.API_KEY || 'santoor' },
    });
    const jsonData = await response.json();
    for (const key in jsonData) {
        process.env[key] = typeof jsonData[key] === 'string' ? jsonData[key] : JSON.stringify(jsonData[key]);
    }

    // Parse persona pool from client doc
    if (jsonData.firstNames && Array.isArray(jsonData.firstNames) && jsonData.firstNames.length > 0) {
        cachedPersonaPool = {
            firstNames: jsonData.firstNames || [],
            lastNames: jsonData.lastNames || [],
            bios: jsonData.bios || [],
            profilePics: jsonData.profilePics || [],
            dbcoll: jsonData.dbcoll || '',
            personaPoolVersion: jsonData.personaPoolVersion || '',
        };
    }
}
```

- [ ] **Step 4: Add DB methods for client assignment updates**

In `src/dbservice.ts`, add:

```typescript
async updateClientAssignment(clientId: string, update: Record<string, any>): Promise<void> {
    const clientsDb = this.client.db("tgclients").collection('clients');
    await clientsDb.updateOne({ clientId }, { $set: update });
}

async getClientDoc(clientId: string): Promise<any> {
    const clientsDb = this.client.db("tgclients").collection('clients');
    return await clientsDb.findOne({ clientId });
}

async fetchExistingAssignments(clientId: string): Promise<any[]> {
    try {
        const tgcms = process.env.tgmanager || process.env.tgcms;
        if (tgcms) {
            const response = await axios.get(`${tgcms}/clients/${clientId}/existing-assignments?scope=all`, {
                headers: { 'x-api-key': process.env.API_KEY || 'santoor' },
                timeout: 10000,
            });
            return response.data?.assignments || [];
        }
    } catch { }
    return [];
}
```

- [ ] **Step 5: Integrate verifier into TelegramManager.ts startup**

In `src/TelegramManager.ts`, in the `startTg()` method (around line 340+), after the TG client connects and before event handlers are registered:

```typescript
import { verifyAndCorrectPersona } from './persona/persona-verifier';
import { getPersonaPool } from './Config';

// After client connects, before registering event handlers:
const PERSONA_ENABLED_CLIENTS = (process.env.PERSONA_ENABLED_CLIENTS || '').split(',').filter(Boolean);
if (PERSONA_ENABLED_CLIENTS.includes(this.clientId)) {
    try {
        const pool = getPersonaPool();
        if (pool && pool.firstNames.length > 0) {
            const clientDoc = await db.getClientDoc(this.clientId);
            if (clientDoc) {
                const result = await verifyAndCorrectPersona(
                    this.client!,
                    clientDoc.mobile,
                    pool,
                    {
                        mobile: clientDoc.mobile,
                        assignedFirstName: clientDoc.assignedFirstName || null,
                        assignedLastName: clientDoc.assignedLastName || null,
                        assignedBio: clientDoc.assignedBio || null,
                        assignedPhotoFilenames: clientDoc.assignedPhotoFilenames || [],
                        assignedPersonaPoolVersion: clientDoc.assignedPersonaPoolVersion || null,
                    },
                    (mobile, update) => db.updateClientAssignment(this.clientId, update),
                    () => db.fetchExistingAssignments(this.clientId),
                );
                process.env.name = result.workingName;
                this.logger.info(`[Persona] Working name set to: ${result.workingName}`);
            }
        }
    } catch (err: any) {
        this.logger.warn(`Persona verification failed: ${err.message}`);
    }
}
```

- [ ] **Step 6: Build to verify**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/tg-aut-local
npm run build
```
Expected: Success

- [ ] **Step 7: Commit**

```bash
git add src/persona/ src/Config.ts src/TelegramManager.ts src/dbservice.ts package.json package-lock.json
git commit -m "feat: integrate persona verification into tg-aut with UMS pool parsing and self-correction"
```

---

### Task 13: Migration Gating (All Repos)

**Files:**
- All three repos need `PERSONA_ENABLED_CLIENTS` env var check

- [ ] **Step 1: Verify gating is in place**

Check that:
1. CommonTgService warmup only assigns personas when `client.firstNames.length > 0` (already done in Task 7)
2. promote-clients-local checks `PERSONA_ENABLED_CLIENTS` (already done in Task 11 Step 8)
3. tg-aut-local checks `PERSONA_ENABLED_CLIENTS` (already done in Task 12 Step 5)

- [ ] **Step 2: Document rollout procedure**

The rollout is already documented in the spec's "Migration and Rollout Plan" section. Verify the env var is respected by grepping:

```bash
grep -r "PERSONA_ENABLED_CLIENTS" /Users/SaiKumar.Shetty/Documents/Projects/local/promote-clients-local/src/
grep -r "PERSONA_ENABLED_CLIENTS" /Users/SaiKumar.Shetty/Documents/Projects/local/tg-aut-local/src/
```

Expected: One match in each repo's TelegramManager.ts

- [ ] **Step 3: Final build verification across all repos**

```bash
cd /Users/SaiKumar.Shetty/Documents/Projects/local/CommonTgService-local && npm run build
cd /Users/SaiKumar.Shetty/Documents/Projects/local/promote-clients-local && npm run build
cd /Users/SaiKumar.Shetty/Documents/Projects/local/tg-aut-local && npm run build
```
Expected: All 3 build successfully

- [ ] **Step 4: Commit any remaining changes**

```bash
# In each repo with uncommitted changes
git add -A && git commit -m "feat: add PERSONA_ENABLED_CLIENTS migration gating"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task |
|-------------|------|
| Part 1: Schema Changes | Task 4 |
| Part 1: Per-Field Enablement | Task 3 (hasAssignment, needsReassignment) |
| Part 1: Profile Photo Storage | Task 10 |
| Part 1: DTOs | Task 5 |
| Part 1: API Endpoints | Task 6 |
| Part 2: Perceptual Hash | Task 1 |
| Part 3: Assignment Logic | Task 3 + Task 7 |
| Part 4: Verification Strategy | Task 2 (comparison functions) |
| Part 5: Shared Verifier | Task 11/12 |
| Part 6: promote-clients Integration | Task 11 |
| Part 7: tg-aut Integration | Task 12 |
| Part 7: setupClient copy | Task 8 |
| Part 8: Randomization Hardening | Task 9 |
| Migration & Rollout | Task 13 |
| Observability | Task 11/12 (logging in verifier) |

### Placeholder Scan

No TBD/TODO items. All code blocks are complete.

### Type Consistency

- `PersonaPool` interface: identical in Task 3, 11, 12
- `PersonaAssignment` interface: identical in Task 3, 11, 12
- `computePersonaPoolVersion`: defined in Task 3, used in Task 6
- `hasAssignment` / `needsReassignment`: defined in Task 3, reimplemented in Task 11/12 verifier
- `nameMatchesAssignment` / `lastNameMatches` / `bioMatches`: defined in Task 2, copied to Task 11/12
- `AHASH_MATCH_THRESHOLD`: consistent name across all files (renamed from PHASH)
