# Persona Pools, Profile Verification & Randomization Hardening

## Problem

### Persona Uniformity
All promote/buffer accounts for a client share a single `name` field and use the same 3 local profile photos (`dp1.jpg`, `dp2.jpg`, `dp3.jpg`). Telegram can trivially group accounts by seeing identical names, bios, and profile photos across dozens of accounts.

### Timing Fingerprinting
18+ delay patterns use uniform `Math.random()` instead of Gaussian. Warmup jitter is only 0-3 days (4 values). Creates detectable statistical signatures across accounts.

## Goal

1. Each account gets a **persisted persona assignment** (name, bio, photo combination) drawn from per-client pools. Uniqueness is enforced on a best-effort basis when pool cardinality allows it; if the pool is undersized, reuse is allowed but assignments remain stable per account
2. Persona is **assigned during warmup** and **verified by downstream services** using a pool version hash — not bare timestamps which can be synthetically backfilled
3. Services self-correct profiles locally using their own TG connections and write directly to MongoDB — no CommonTgService dependency at runtime
4. All timing patterns use Gaussian randomization with wider entropy

## Design

### Part 1: Schema Changes

#### `clients` Collection — New Fields

```typescript
firstNames: string[]         // ["Shruthi", "Shruti", "Shru", "Shruthii"]
lastNames: string[]          // ["Reddy", "R", "", "Reddi", "reddyy"]
bios: string[]               // ["✨ link in bio", "DM for exclusive 💋", "👇 check pinned"]
profilePics: Array<{
    filename: string;        // "dp1.jpg" — relative to persona/{dbcoll}/ in repo
    phash: string;           // Precomputed perceptual hash (64-bit binary string)
}>
personaPoolVersion: string;  // Hash of all pool arrays — changes when any pool is updated
```

**`name` field stays** — backward compat for env var consumers. Fallback when pools are empty.

For the single active `tg-aut` account, `clients.name` also mirrors the currently assigned first name after `setupClient` swap. This is a **compatibility mirror only**, not the source of truth for persona verification. Verification still uses `assignedFirstName`, `assignedBio`, `assignedPhotoFilenames`, and `assignedPersonaPoolVersion`.

**`mainAccount` field removed** — unused per SCHEMA-REDESIGN.md.

**`personaPoolVersion` computation** — computed and stored whenever pool fields are updated via API:
```typescript
function computePersonaPoolVersion(client: {
    firstNames?: string[]; lastNames?: string[]; bios?: string[];
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
```

#### `bufferClients` / `promoteClients` — New Fields

Each account stores its **persisted persona assignment**:

```typescript
assignedFirstName: string | null;       // The firstName picked from pool for this account
assignedLastName: string | null;        // The lastName picked
assignedBio: string | null;             // The bio picked — null means "no bio assigned" (distinct from "")
assignedPhotoFilenames: string[];       // Which photos from pool are assigned ["dp1.jpg", "dp2.jpg"]
assignedPersonaPoolVersion: string | null; // Which version of the pool this assignment was made from
```

These are set during warmup identity phase and **never change** unless:
- The pool version changes (operator updated the pool)
- The account is re-enrolled for warmup
- The fallback verifier detects a mismatch and corrects

For `promoteClients`, persisting these fields on each mobile doc is mandatory. Runtime random selection without persistence is not allowed, because reconnects would drift the persona and reintroduce cross-account collisions.

For the active `clients` doc used by `tg-aut`, the same assignment fields are also copied during `setupClient` swap so the single running account can verify itself without querying `bufferClients`.

#### Per-Field Enablement Rules

Not all clients will use all pool fields. Assignment and verification are **per-field-optional**:

| Pool field | Assignment condition | Verification condition |
|---|---|---|
| `firstNames` | `pool.firstNames.length > 0` | `doc.assignedFirstName != null` |
| `lastNames` | `pool.lastNames.length > 0` | `doc.assignedLastName != null` |
| `bios` | `pool.bios.length > 0` | `doc.assignedBio != null` |
| `profilePics` | `pool.profilePics.length > 0` | `doc.assignedPhotoFilenames.length > 0` |

**A persona is considered "assigned" when at least one enabled field has an assigned value.** The other fields being null/empty means that field was intentionally skipped (pool was empty for that field), NOT that assignment is missing.

```typescript
function hasAssignment(doc: AccountDoc): boolean {
    return (
        doc.assignedFirstName != null ||
        doc.assignedLastName != null ||
        doc.assignedBio != null ||
        (doc.assignedPhotoFilenames?.length || 0) > 0
    );
}

function needsReassignment(doc: AccountDoc, pool: PersonaPool): boolean {
    // Legacy account predating persona pools: do not rewrite during rollout.
    if (!hasAssignment(doc) && doc.assignedPersonaPoolVersion == null) return false;
    // Pool version changed for an already-assigned account
    if (doc.assignedPersonaPoolVersion !== pool.personaPoolVersion) return true;
    return false;
}
```

This means:
- A client with only `firstNames` populated → accounts get name assignments only, bios and photos use fallback
- A client with `firstNames` + `bios` but no `profilePics` → accounts get name + bio, photos use fallback dp1/dp2/dp3
- A client with only `profilePics` populated → accounts get photo assignments only, names/bios stay legacy
- A client with only `bios` populated → accounts get bio assignments only, names/photos stay legacy
- The verifier only checks fields that have assigned values, never loops on missing optional fields

#### Profile Photo Storage

Photos stored **in the git repo**, deployed to all VMs:

```
persona/{dbcoll}/
  ├── dp1.jpg
  ├── dp2.jpg
  ├── dp3.jpg
  └── ...
```

**Path resolution at runtime:**
```typescript
const PERSONA_BASE = process.env.PERSONA_PATH || path.join(process.cwd(), 'persona');
const photoPath = path.join(PERSONA_BASE, client.dbcoll, pic.filename);

// Startup validation — fail fast if persona folder is missing
function validatePersonaPath(dbcoll: string): boolean {
    const dir = path.join(PERSONA_BASE, dbcoll);
    try {
        fs.accessSync(dir, fs.constants.R_OK);
        return true;
    } catch {
        logger.warn(`Persona folder missing: ${dir} — falling back to legacy dp*.jpg`);
        return false;
    }
}
```

**`PERSONA_PATH` env var** overrides `process.cwd()` for services whose runtime cwd differs from the repo root (e.g., webpack-bundled services where `process.cwd()` might be `/app` but persona assets are at `/repo/persona`).

**Deployment rule:** The `persona/` directory MUST be included in every service's deploy artifact. For webpack-bundled services (promote-clients, tg-aut), this means copying the folder alongside the bundle. For NestJS services (CommonTgService), it's already in the repo root. Each service validates the folder exists at startup and falls back to legacy behavior if missing.

All services (CommonTgService, promote-clients-local, tg-aut-local) have local access — same repo/build artifact on each VM.

**pHash precomputation:** A utility script scans `persona/{dbcoll}/`, computes aHash for each image, outputs the `profilePics` array for the clients API.

#### Client Schema (`client.schema.ts`)

```typescript
@Prop({ required: false, type: [String], default: [] })
firstNames: string[];

@Prop({ required: false, type: [String], default: [] })
lastNames: string[];

@Prop({ required: false, type: [String], default: [] })
bios: string[];

@Prop({ required: false, type: [{ filename: String, phash: String }], default: [] })
profilePics: Array<{ filename: string; phash: string }>;

@Prop({ required: false, default: null })
personaPoolVersion: string; // current pool hash on the client document

// Active-account compatibility fields for tg-aut after setupClient swap
@Prop({ required: false, default: null })
assignedFirstName?: string;

@Prop({ required: false, default: null })
assignedLastName?: string;

@Prop({ required: false, default: null })
assignedBio?: string;

@Prop({ required: false, type: [String], default: [] })
assignedPhotoFilenames?: string[];

@Prop({ required: false, default: null })
assignedPersonaPoolVersion?: string;
```

#### Buffer/Promote Schema Additions

```typescript
@Prop({ required: false, default: null })
assignedFirstName: string | null;

@Prop({ required: false, default: null })
assignedLastName: string | null;

@Prop({ required: false, default: null })
assignedBio: string | null;

@Prop({ required: false, type: [String], default: [] })
assignedPhotoFilenames: string[];

@Prop({ required: false, default: null })
assignedPersonaPoolVersion: string | null;
```

#### DTOs

`CreateClientDto`/`UpdateClientDto` get pool fields. `UpdateClientDto` also allows the copied active-account assignment fields used by tg-aut after swap. `UpdateBufferClientDto`/`UpdatePromoteClientDto` get assignment fields. All with proper validation.

#### New API Endpoints

```
GET /clients/:clientId/persona-pool
Response: { firstNames, lastNames, bios, profilePics, dbcoll, personaPoolVersion }

GET /clients/:clientId/existing-assignments?scope=all|buffer|promote|activeClient
Response: { assignments: Array<{ mobile, assignedFirstName, assignedLastName, assignedBio, assignedPhotoFilenames, source }> }
```

The second endpoint returns the **union** of assignments across `bufferClients`, `promoteClients`, and the active `clients` doc when `scope=all`. This lets downstream services deduplicate against all active account types for the same clientId, not just one collection.

### Part 2: Perceptual Hash Utility

New file: `src/utils/image-hash.ts`

```typescript
import sharp from 'sharp';

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

export function hammingDistance(a: string, b: string): number {
    let dist = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) dist++;
    }
    return dist;
}

// Telegram recompresses uploaded images. aHash is resilient to JPEG recompression,
// but we use a generous threshold to avoid false mismatches.
// Testing showed Telegram compression typically causes 3-6 bit drift on aHash.
// Threshold of 10 gives comfortable margin. Revisit if false positives appear.
export const AHASH_MATCH_THRESHOLD = 10;
```

### Part 3: Persona Assignment Logic (CommonTgService Warmup)

#### Assignment During Identity Phase — With Atomic Reservation

When warmup reaches the identity steps, the system **assigns and persists** a persona combination. To prevent race conditions where two concurrent warmup workers pick the same persona, assignment uses **atomic findOneAndUpdate with a uniqueness filter**:

```
assignPersona(doc, client, pool, existingAssignments):
    existingAssignments = await fetchExistingAssignmentsAcrossAllScopes(client.clientId)

    function personaKey(a):
        return JSON.stringify([
            a.assignedFirstName || null,
            a.assignedLastName || null,
            a.assignedBio || null,
            [...(a.assignedPhotoFilenames || [])].sort(),
        ])

    usedPersonaKeys = new Set(
        existingAssignments
            .filter(a => a.mobile !== doc.mobile)
            .map(personaKey)
    )

    // Prefer an unused full combination, not just an unused first name.
    // generateCandidateCombinations() returns a bounded sample, not a full cartesian explosion.
    candidates = generateCandidateCombinations(pool)
    unusedCandidates = candidates.filter(c => !usedPersonaKeys.has(personaKey(c)))
    chosen = unusedCandidates.length > 0
        ? random from unusedCandidates
        : random from candidates  // pool exhausted, allow reuse

    // Atomic reservation: only succeeds if no other worker grabbed this name since our read
    result = await model.findOneAndUpdate(
        {
            mobile: doc.mobile,
            // Guard: only update if assignment hasn't been set by another worker
            $or: [
                { assignedFirstName: null },
                { assignedPersonaPoolVersion: { $ne: pool.personaPoolVersion } },
            ],
        },
        {
            $set: {
                assignedFirstName: chosen.assignedFirstName,
                assignedLastName: chosen.assignedLastName,
                assignedBio: chosen.assignedBio,
                assignedPhotoFilenames: chosen.assignedPhotoFilenames,
                assignedPersonaPoolVersion: pool.personaPoolVersion,
            },
        },
        { new: true }
    )

    if (!result) {
        // Another worker already assigned — read back what was persisted
        return await model.findOne({ mobile: doc.mobile })
    }

    return result
```

```typescript
function generateCandidateCombinations(pool: PersonaPool, mobile: string): PersonaAssignment[] {
    const SAMPLE_SIZE = 64;
    const candidates: PersonaAssignment[] = [];
    const seed = stableHash(`${pool.personaPoolVersion}:${mobile}`);

    for (let i = 0; i < SAMPLE_SIZE; i++) {
        candidates.push({
            assignedFirstName: pool.firstNames.length > 0 ? seededPick(pool.firstNames, seed + i * 11) : null,
            assignedLastName: pool.lastNames.length > 0 ? seededPick(pool.lastNames, seed + i * 17) : null,
            assignedBio: pool.bios.length > 0 ? seededPick(pool.bios, seed + i * 23) : null,
            assignedPhotoFilenames: pool.profilePics.length > 0
                ? seededShuffle(pool.profilePics, seed + i * 31).slice(0, min(3, pool.profilePics.length)).map(p => p.filename)
                : [],
            assignedPersonaPoolVersion: pool.personaPoolVersion,
        });
    }

    return dedupeByPersonaKey(candidates);
}
```

**Why atomic:** Two warmup workers processing different mobiles for the same clientId can run `assignPersona` concurrently. Without the `findOneAndUpdate` guard, both could read the same existing assignments, both pick the same unused candidate combination, and both persist it. The atomic guard ensures each mobile's assignment is written only once per pool version. Full cross-mobile uniqueness is still best-effort, but silent overwrite is prevented.

**Retry-on-conflict is NOT needed** because:
- The guard is per-mobile (`mobile: doc.mobile`), not per-name
- Two workers can't both succeed for the same mobile — one gets `null` and reads back
- Two workers assigning different mobiles the same combination is still possible in the narrow race window, but acceptable under best-effort uniqueness

**Combination-level uniqueness rule:** The system tries to avoid reusing the same full persona combination `(firstName, lastName, bio, sortedPhotoSet)` across all active account scopes for the same clientId. If the pool is too small, reuse is allowed and should be visible in metrics.

**Small-pool distribution rule:** Candidate generation is deterministic per `(mobile, personaPoolVersion)` using seeded selection, not unconstrained random picks. This gives stable spread and avoids accidental clustering when pools are small.

#### Pool Size Rules

- Minimum valid pool size is `1` for each field that participates in assignment
- If a pool field is empty (`[]`), that field is skipped — the assigned value is `null` (names, bios) or `[]` (photos)
- If total combination space is smaller than active account count, uniqueness degrades to best-effort reuse
- Stability still holds because the chosen assignment is persisted on the account doc
- **Small-pool distribution:** If there are N photos and M active accounts where M > N, photos are distributed round-robin by mobile sort order during assignment. This prevents all accounts clustering on the same subset.

#### `updateNameAndBio()` Changes

Current: Uses `client.name` directly with obfuscation.

New:
```
if client.firstNames.length > 0:
    assignment = doc.assignedFirstName
        ? { firstName: doc.assignedFirstName, lastName: doc.assignedLastName, bio: doc.assignedBio }
        : await assignPersona(doc, client, pool, existingAssignments)  // first-time assignment

    // Set on TG — obfuscate the ASSIGNED name
    fullName = obfuscateText(assignment.firstName) + ' ' + getCuteEmoji()
    await tgManager.updateProfile(fullName, assignment.lastName || '')

    // Set bio if assigned (null means pool had no bios — skip)
    if assignment.bio != null:
        await tgManager.updateBio(assignment.bio)
else:
    // Fallback — existing behavior using client.name
    fullName = obfuscateText(client.name) + getCuteEmoji()
    await tgManager.updateProfile(fullName, '')
```

#### `updateProfilePhotos()` Changes

Current: Fixed `['dp1.jpg', 'dp2.jpg', 'dp3.jpg']` from local filesystem.

New:
```
if doc.assignedPhotoFilenames?.length > 0:
    uploadedCount = 0
    for each filename in doc.assignedPhotoFilenames:
        photoPath = path.join(PERSONA_BASE, client.dbcoll, filename)
        if !fs.existsSync(photoPath):
            logger.warn(`Persona photo missing: ${photoPath} — skipping`)
            continue
        buffer = await fs.readFile(photoPath)
        await uploadProfilePhoto(tgManager, buffer)
        uploadedCount++
        sleep gaussian 30-50s
    if uploadedCount === 0:
        logger.warn('No assigned persona photos were uploaded; do NOT stamp profilePicsUpdatedAt')
        await markPersonaPhotoAssetIssue(doc.mobile)
        // Retry only after asset issue is cleared, do not loop forever in every cycle
else if client.profilePics?.length > 0:
    // Pool exists but no photo assignment yet — assign photo filenames directly.
    // Do NOT go back through the full identity assignment guard, because name/bio
    // may already have been assigned in a previous phase.
    assignedPhotoFilenames = selectAssignedPhotoFilenames(doc.mobile, pool.profilePics)
    await update(doc.mobile, {
        assignedPhotoFilenames,
        assignedPersonaPoolVersion: pool.personaPoolVersion,
    })
    // ... then upload assigned photos
else:
    // Fallback — existing dp1/dp2/dp3 behavior
```

**Warmup model note:** Current warmup uploads 1 photo during MATURING phase. This changes to uploading 1-3 assigned photos. This is an **explicit warmup behavior change** — the MATURING step takes longer (30-50s × 3 photos = 90-150s extra) but stays within a single warmup cycle. The `profilePicsUpdatedAt` timestamp is set only if at least one assigned photo was actually uploaded.

**Warmup pool drift rule:** Every warmup cycle checks `assignedPersonaPoolVersion !== client.personaPoolVersion`. If drift is detected, the account re-enters persona reconciliation before the next identity/photo write. Warmup does not carry stale assignment versions for weeks.

### Part 4: Verification Strategy

#### What Makes a Persona "Verified"

An account's persona is considered valid when ALL of these are true:
1. At least one enabled field is assigned on the account doc
2. `assignedPersonaPoolVersion` on the account doc **matches** `personaPoolVersion` on the parent client
3. For each assigned field, the actual TG profile matches:
   - Name: TG firstName **contains** the assigned first name (accounting for obfuscation + emoji)
   - Bio: TG about **equals** assigned bio (if `assignedBio` is non-null)
   - Last name: TG lastName **equals** assigned last name (if `assignedLastName` is non-null)
   - Photos: TG photo hashes match assigned photo hashes within threshold (if `assignedPhotoFilenames.length > 0`)

If any condition fails for an assigned field, the service runs correction **for that specific field only**.

#### Name Comparison: Handling Obfuscation

The warmup writes: `obfuscateText("Shruthi") + " 💋"` → something like `"Ꮪhruthi 💋"` (homoglyph substitution).

Telegram's `getMe().firstName` returns: `"Ꮪhruthi 💋"`.

**Comparison logic:** Strip emoji, then check if the de-obfuscated name contains the assigned base name. Since obfuscation uses visually similar characters, we use a **contains-check after stripping non-alphanumeric characters**:

```typescript
function nameMatchesAssignment(tgFirstName: string, assignedFirstName: string): boolean {
    // Strip emoji and whitespace from TG name
    const stripped = tgFirstName.replace(/[\p{Emoji}\s]/gu, '').toLowerCase();
    // Normalize homoglyphs back to ASCII for comparison
    const normalized = normalizeHomoglyphs(stripped);
    return normalized.includes(assignedFirstName.toLowerCase());
}
```

`normalizeHomoglyphs()` reverses the obfuscation lookup table — maps homoglyph characters back to their ASCII originals. This uses the same substitution map from `obfuscateText.ts` but in reverse.

#### Last Name and Bio Verification

**Last name:** Verified by exact equality (no obfuscation applied to last names):
```typescript
function lastNameMatches(tgLastName: string, assignedLastName: string | null): boolean {
    if (assignedLastName == null) return true; // no assignment — skip check
    return (tgLastName || '') === (assignedLastName || '');
}
```

**Bio:** Verified by exact equality:
```typescript
function bioMatches(currentBio: string, assignedBio: string | null): boolean {
    if (assignedBio == null) return true; // no assignment — skip check
    return currentBio === assignedBio;
}
```

**Bio removal:** If an operator removes all bios from the pool and triggers a pool version bump, the next verification will see `needsReassignment = true`, re-assign with `assignedBio = null`, and then the bio check passes trivially. The old bio stays on TG. If the operator wants bios cleared, they should add an empty string `""` to the bios pool, which will assign `""` and the verifier will clear it.

**Last-name removal:** Last names follow the same rule as bios. If the pool drops all last names, reassignment sets `assignedLastName = null` and the old Telegram last name is left unchanged. If the operator wants last names cleared, they should include an empty string `""` in the `lastNames` pool.

**Photo-pool removal:** If a client previously used persona-photo assignments but later removes all `profilePics` from the pool, reassignment sets `assignedPhotoFilenames = []`. Downstream services do **not** revert the account to legacy `dp*.jpg` photos in this case. They leave the current TG photos untouched. Legacy `dp*.jpg` fallback only applies to clients that never had persona-photo assignment in the first place.

### Part 5: Self-Contained Profile Management in Services

#### Shared Persona Verifier

Both promote-clients-local and tg-aut-local use the same verification logic:

```typescript
interface PersonaPool {
    firstNames: string[];
    lastNames: string[];
    bios: string[];
    profilePics: Array<{ filename: string; phash: string }>;
    dbcoll: string;
    personaPoolVersion: string;
}

interface PersonaAssignment {
    assignedFirstName: string | null;
    assignedLastName: string | null;
    assignedBio: string | null;
    assignedPhotoFilenames: string[];
    assignedPersonaPoolVersion: string | null;
}

interface AccountDoc extends PersonaAssignment {
    mobile: string;
    nameBioUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    privacyUpdatedAt?: Date;
}

interface VerifyResult {
    workingName: string;
    correctedName: boolean;
    correctedBio: boolean;
    correctedLastName: boolean;
    correctedPhotos: boolean;
}
```

#### Full Verification + Correction Flow

```
verifyAndCorrectPersona(client, mobile, pool, doc, updateDoc, existingAssignmentsFetcher):

  result = { workingName: '', correctedName: false, correctedBio: false, correctedLastName: false, correctedPhotos: false }
  // defensive failure budget to avoid looping forever on broken assets / persistent TG errors
  MAX_PERSONA_FAILURES = 3

  try:
      // ---- POOL VERSION CHECK ----
      if needsReassignment(doc, pool):
          // Re-assign persona from current pool
          existingAssignments = await existingAssignmentsFetcher()
          assignment = assignPersona(doc, { clientId }, pool, existingAssignments)
          await updateDoc(mobile, {
              assignedFirstName: assignment.assignedFirstName,
              assignedLastName: assignment.assignedLastName,
              assignedBio: assignment.assignedBio,
              assignedPhotoFilenames: assignment.assignedPhotoFilenames,
              assignedPersonaPoolVersion: pool.personaPoolVersion,
          })
          doc = { ...doc, ...assignment, assignedPersonaPoolVersion: pool.personaPoolVersion }

      // If nothing is assigned, stay legacy and skip persona verification
      if !hasAssignment(doc):
          result.workingName = process.env.name || 'Unknown'
          return result

      // ---- NAME CHECK ----
      me = await client.getMe()
      result.workingName = doc.assignedFirstName || process.env.name || 'Unknown'

      if doc.assignedFirstName != null && nameMatchesAssignment(me.firstName, doc.assignedFirstName):
          result.workingName = doc.assignedFirstName  // use the clean base name
      else if doc.assignedFirstName != null:
          await performOrganicActivity(client, 'medium')
          await sleep(gaussianRandom(30000, 10000, 20000, 50000))
          newName = obfuscateText(doc.assignedFirstName) + ' ' + getCuteEmoji()
          await client.invoke(UpdateProfile({ firstName: newName, lastName: doc.assignedLastName || '' }))
          await sleep(gaussianRandom(20000, 5000, 15000, 30000))
          result.workingName = doc.assignedFirstName
          result.correctedName = true
          await updateDoc(mobile, { nameBioUpdatedAt: new Date() })

      // ---- LAST NAME CHECK ----
      if doc.assignedLastName != null && !lastNameMatches(me.lastName || '', doc.assignedLastName):
          await performOrganicActivity(client, 'light')
          await sleep(gaussianRandom(10000, 3000, 5000, 15000))
          await client.invoke(UpdateProfile({ lastName: doc.assignedLastName }))
          result.correctedLastName = true

      // ---- BIO CHECK ----
      fullUser = await client.invoke(GetFullUser({ id: 'me' }))
      currentBio = fullUser.fullUser.about || ''

      if !bioMatches(currentBio, doc.assignedBio):
          await performOrganicActivity(client, 'light')
          await sleep(gaussianRandom(10000, 3000, 5000, 15000))
          await client.invoke(UpdateProfile({ about: doc.assignedBio || '' }))
          await sleep(gaussianRandom(15000, 5000, 10000, 25000))
          result.correctedBio = true

      // ---- PRIVACY CHECK ----
      if !doc.privacyUpdatedAt:
          await performOrganicActivity(client, 'light')
          await sleep(gaussianRandom(10000, 3000, 5000, 15000))
          await updatePrivacyForDeletedAccount(client)
          await updateDoc(mobile, { privacyUpdatedAt: new Date() })

      // ---- PHOTO CHECK ----
      if doc.assignedPhotoFilenames.length > 0:
          if !validatePersonaPath(pool.dbcoll):
              logger.warn('Skipping photo verification — persona folder missing')
              await markPersonaPhotoAssetIssue(mobile)
          else:
              poolHashes = pool.profilePics
                  .filter(p => doc.assignedPhotoFilenames.includes(p.filename))
                  .map(p => p.phash)

              tgPhotos = await client.invoke(GetUserPhotos({ userId: 'me', offset: 0 }))
              tgPhotoHashes = []
              for each photo in tgPhotos.photos:
                  buffer = await client.downloadMedia(photo)
                  if buffer: tgPhotoHashes.push(await computeAHash(buffer))

              allMatch = tgPhotoHashes.length === poolHashes.length
                  AND tgPhotoHashes.every(h => poolHashes.some(ph => hammingDistance(h, ph) < AHASH_MATCH_THRESHOLD))
                  AND poolHashes.every(ph => tgPhotoHashes.some(h => hammingDistance(h, ph) < AHASH_MATCH_THRESHOLD))

              if !allMatch:
                  await performOrganicActivity(client, 'medium')
                  // safer strategy: upload replacements first when possible, then prune old photos
                  uploadedCount = 0
                  for each filename in doc.assignedPhotoFilenames:
                      photoPath = path.join(PERSONA_BASE, pool.dbcoll, filename)
                      if !fs.existsSync(photoPath):
                          logger.warn(`Persona photo missing: ${photoPath} — skipping`)
                          continue
                      buffer = await fs.readFile(photoPath)
                      await uploadProfilePhoto(client, buffer)
                      uploadedCount++
                      await sleep(gaussianRandom(30000, 10000, 20000, 50000))
                  if uploadedCount > 0:
                      await pruneExtraProfilePhotos(client, uploadedCount)
                      result.correctedPhotos = true
                      await updateDoc(mobile, { profilePicsUpdatedAt: new Date() })
                  else:
                      await markPersonaPhotoAssetIssue(mobile)
      else:
          if doc.assignedPersonaPoolVersion == null:
              tgPhotos = await client.invoke(GetUserPhotos({ userId: 'me', offset: 0 }))
              if tgPhotos.photos.length < 2:
                  await legacyUpdateProfilePhotos(client)

      return result
  catch (error):
      await incrementPersonaFailureCount(mobile, error)
      if getPersonaFailureCount(mobile) >= MAX_PERSONA_FAILURES:
          logger.warn(`[Persona] ${mobile}: verification disabled temporarily after repeated failures`)
      throw error
```

### Part 6: promote-clients-local Integration

#### Persona Pool Source

Fetched at startup from CommonTgService API, with **TTL-based refresh**:
```typescript
class PersonaPoolCache {
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
            this.pool = await fetchFromApi(`/clients/${clientId}/persona-pool`);
            this.fetchedAt = now;
            return this.pool;
        } catch (err) {
            logger.warn('Failed to refresh persona pool, using cached:', err.message);
            return this.pool; // stale is better than nothing
        }
    }

    invalidate(): void {
        this.fetchedAt = 0;
    }
}
```

**Why 6-hour TTL:** Processes restart every 4 days. Without TTL, an urgent pool rotation by the operator would take up to 4 days to propagate. With 6-hour TTL, max staleness is 6 hours. The operator can also force-restart a specific process via PM2 for immediate pickup.

**Pool invalidation signal:** If the verifier detects a pool version mismatch (doc version != pool version), it calls `PersonaPoolCache.getInstance().invalidate()` and re-fetches before reassigning. This catches operator pool updates within the next verification cycle.

#### Existing Assignments for Deduplication

promote-clients-local needs the list of existing assignments for the same clientId to avoid collisions during reassignment. Two options:

1. **API endpoint** — `GET /clients/:clientId/existing-assignments?scope=promote` returns all assigned names/bios for that clientId
2. **Direct DB query** — promote-clients already has MongoDB access to `promoteClients` collection

**Choice: Direct DB query** for promote-clients (it already reads/writes promoteClients). The API endpoint exists as fallback for services that don't have direct collection access.

```typescript
async function fetchExistingAssignments(clientId: string): Promise<PersonaAssignment[]> {
    const promoteAssignments = await db.promoteClients.find({
        clientId,
        status: 'active',
        assignedFirstName: { $ne: null },
    }, {
        projection: { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedPhotoFilenames: 1 },
    }).toArray();

    const bufferAssignments = await fetchFromApi(`/clients/${clientId}/existing-assignments?scope=buffer`);
    const activeClientAssignment = await fetchFromApi(`/clients/${clientId}/existing-assignments?scope=activeClient`);

    return [...promoteAssignments, ...bufferAssignments.assignments, ...activeClientAssignment.assignments];
}
```

#### On Mobile Connection (post-`createClient`, before `startPromotion`)

```typescript
const pool = await PersonaPoolCache.getInstance().get(clientId);
const promoteDoc = await db.getPromoteClient(mobile);

if (pool && pool.firstNames.length > 0) {
    const result = await verifyAndCorrectPersona(
        this.client, mobile, pool, promoteDoc,
        (mobile, update) => db.updatePromoteClient({ mobile }, update),
        () => fetchExistingAssignments(clientId),  // dedup fetcher
    );
    this.clientDetails.name = result.workingName;
} else {
    // No pool — use env name fallback
    this.clientDetails.name = process.env.name || 'Unknown';
}
```

Each of the 2 active promote accounts has its own `IClientDetails.name` — the verified working name, not the global env var.

**DB write path:** promote-clients-local writes directly to MongoDB `promoteClients` collection — it already has a DB connection.

### Part 7: tg-aut-local Integration

#### Persona Pool Source

Included in the UMS config response. `getDataAndSetEnvVariables()` fetches from `ums.paidgirl.site/clients/${clientId}` — the `clients` document now has pool fields + `personaPoolVersion`. After `setupClient` swap, the same doc also has `assignedFirstName`, `assignedBio`, `assignedPhotoFilenames`, and `assignedPersonaPoolVersion`. Parsed from env vars / client doc at startup.

#### DB Access for Account Doc

tg-aut currently only reads/writes the `clients` collection. For persona verification, it needs active-account assignment fields on that same doc (`assignedFirstName`, `assignedPersonaPoolVersion`, etc.).

**Two options:**
1. **Add a `bufferClients` read path to tg-aut's dbservice** — new method `getBufferClientByMobile(mobile)` that reads from `bufferClients` collection. Simple `findOne` query.
2. **Copy assignment fields to `clients` collection during `setupClient`** — when CommonTgService swaps a buffer into active use, copy `assignedFirstName`, `assignedLastName`, `assignedBio`, `assignedPhotoFilenames`, `assignedPersonaPoolVersion` onto the `clients` document.

**Recommendation: Option 2** — cleaner because:
- tg-aut already fetches the `clients` doc via UMS
- No new collection access needed in tg-aut
- The `clients` doc becomes the single source of persona truth for the active account
- `setupClient` already writes to `clients` (mobile, username, session) — adding persona fields is natural

`clients.name` should also be updated to `assignedFirstName` during the same swap, so existing env-driven consumers keep working without a deep refactor.

**Divergence rule:** After `setupClient` copies assignment to `clients`, the buffer doc and client doc may diverge (e.g., if the buffer gets re-enrolled and gets a new assignment). **The `clients` doc is the source of truth for the active tg-aut account.** The buffer doc is the source of truth for warmup. They are independent after the swap. If the pool version changes, tg-aut re-assigns from the pool using the `clients` doc's assignment fields — it never reads back from the buffer doc.

#### Existing Assignments for Deduplication (tg-aut)

tg-aut has only one active account per clientId, so deduplication is less critical. However, for correctness:

```typescript
async function fetchExistingAssignments(clientId: string): Promise<PersonaAssignment[]> {
    // tg-aut has one active account, but dedup should consider all account scopes
    const result = await fetchFromApi(`/clients/${clientId}/existing-assignments?scope=all`);
    return result.assignments || [];
}
```

#### `setupClient` Changes (CommonTgService)

When swapping buffer→client, copy persona assignment in the **same atomic DB write** as mobile/username/session:
```typescript
await clients.findOneAndUpdate({ clientId }, {
  $set: {
    mobile: newMobile,
    username: updatedUsername,
    session: newSession,
    name: bufferDoc.assignedFirstName || existingClient.name,
    // Copy persona assignment from buffer doc
    assignedFirstName: bufferDoc.assignedFirstName,
    assignedLastName: bufferDoc.assignedLastName,
    assignedBio: bufferDoc.assignedBio,
    assignedPhotoFilenames: bufferDoc.assignedPhotoFilenames || [],
    assignedPersonaPoolVersion: bufferDoc.assignedPersonaPoolVersion,
  }
});
```

#### At Startup

```typescript
const pool = parsePersonaPoolFromEnv(); // from UMS config
const clientDoc = await fetchClientDoc(clientId);

if (pool && pool.firstNames.length > 0) {
    const result = await verifyAndCorrectPersona(
        telegramClient, clientDoc.mobile, pool,
        clientDoc, // has assignedFirstName etc. from setupClient copy
        (mobile, update) => db.updateClient(clientId, update),
        () => fetchExistingAssignments(clientId),  // dedup fetcher
    );
    process.env.name = result.workingName;
} else {
    // No pool — keep existing env name
}
```

**Note:** tg-aut's `updateDoc` callback writes to `clients` collection (not `bufferClients`). This is correct — the account is now a main client, not a buffer.

### Part 8: Randomization Hardening (CommonTgService)

#### Replace Uniform Random Delays

All instances of `base + Math.random() * range` replaced with:
```typescript
ClientHelperUtils.gaussianRandom(mean, stddev, min, max)
```

Where `mean = base + range/2`, `stddev = range/4`, `min = base`, `max = base + range`.

| Current | Gaussian Replacement |
|---------|---------------------|
| `5000 + Math.random() * 3000` | `gaussianRandom(6500, 750, 5000, 8000)` |
| `30000 + Math.random() * 20000` | `gaussianRandom(40000, 5000, 30000, 50000)` |
| `15000 + Math.random() * 10000` | `gaussianRandom(20000, 2500, 15000, 25000)` |
| `10000 + Math.random() * 5000` | `gaussianRandom(12500, 1250, 10000, 15000)` |
| `5000 + Math.random() * 5000` | `gaussianRandom(7500, 1250, 5000, 10000)` |

Fixed delays (e.g., `sleep(5000)`) → add jitter: `gaussianRandom(5000, 1000, 3000, 7000)`.

#### Widen Warmup Jitter

`generateWarmupJitter()` moves from uniform integer jitter to bounded Gaussian day jitter:
```typescript
Math.round(gaussianRandom(3.5, 2, 0, 7))
```

0-7 days instead of 0-3, with less edge clustering than uniform picks.

#### Health Check Interval

`5 + Math.random() * 4` (uniform 5-9 **days**) → `gaussianRandom(7, 1.5, 4, 10)` (Gaussian 4-10 **days**).

## What Does NOT Change

- `name` field on `clients` — stays for backward compatibility and fallback; no removal needed for this rollout
- Promotion message content in promote-clients-local — uses channel data, not persona
- Warmup phase sequence (enrolled → settling → identity → growing → maturing → ready → session_rotated)
- Warmup timing thresholds (days between phases)
- Per-join delays (already Gaussian)
- Organic activity implementation (already Gaussian)
- Leave channel queue behavior

## What DOES Change in Warmup Behavior

- MATURING photo upload: was 1 photo, now 1-3 photos from assigned pool (extra 60-100s in that step)
- Identity name/bio: now picks from pool with deduplication instead of using `client.name`
- New fields written during warmup: `assignedFirstName`, `assignedLastName`, `assignedBio`, `assignedPhotoFilenames`, `assignedPersonaPoolVersion`

## Fallback Behavior

If a client has **empty pools** (not yet migrated):
- Warmup `updateNameAndBio` uses `client.name` as before
- Warmup `updateProfilePhotos` uses local `dp*.jpg` as before
- promote-clients-local uses env `name` as before
- tg-aut-local uses env `name` as before
- No persona assignment fields written
- Zero breakage for unmigrated clients

## Migration and Rollout Plan

### Phase 1: Schema Migration (Non-Breaking)

Add new nullable fields to all three collections. No enforcement, no verification. This is a **database-only** change:

1. Deploy schema changes (all `default: null` / `default: []`). Existing docs unaffected.
2. No migration script needed — Mongoose defaults handle new docs, old docs simply lack the fields (treated as null/empty).

### Phase 2: Pool Population (Operator Action)

Operator populates pools via API for **one test client** first:
```
PUT /clients/:clientId { firstNames: [...], lastNames: [...], bios: [...], profilePics: [...] }
```
This computes and stores `personaPoolVersion`.

### Phase 3: Warmup-Only Rollout (New Accounts)

Deploy warmup assignment logic. Only accounts entering `identity` phase for the first time will get persona assignments. **Already-ready accounts are NOT touched.** The verifier is deployed but only runs for accounts that have `assignedFirstName` set.

**Key safety rule:** `needsReassignment()` returns `false` for accounts with no pool version AND no assignment. These accounts were warmed up before persona pools existed — they keep their current TG profiles until they're naturally swapped and re-enrolled.

### Phase 4: Service Verification (One Client)

Deploy verifier to promote-clients-local and tg-aut-local for the **one test client** only. Gate with a config flag:

```typescript
const PERSONA_ENABLED_CLIENTS = process.env.PERSONA_ENABLED_CLIENTS?.split(',') || [];
if (!PERSONA_ENABLED_CLIENTS.includes(clientId)) {
    // Skip verification — legacy behavior
}
```

Monitor for 48h. Check logs for:
- Correction count (should be low — most accounts were assigned during warmup)
- Photo hash mismatches (calibrate `AHASH_MATCH_THRESHOLD` if too many false mismatches)
- Timing of corrections (should not spike at service startup)

### Phase 5: Gradual Rollout

Add clients to `PERSONA_ENABLED_CLIENTS` one at a time. Wait 24h between each.

### Existing Ready Accounts

Accounts that are already `ready` or `active` when pools are first populated:
- **In warmup pipeline (before identity):** Will get assigned naturally when they first hit identity.
- **Already past identity with no assignment fields:** Stay on legacy profile behavior. They are **not** force-assigned by the verifier during rollout.
- **Already active in promote/tg-aut with no assignment fields:** Verifier detects legacy state and skips reassignment. They keep their current TG profile until the next natural re-enrollment / buffer swap.
- **NOT all at once on first deploy:** The `PERSONA_ENABLED_CLIENTS` gate plus the legacy-skip rule prevents burst rewrites of old accounts.

### Pool Version Update Handling

When an operator updates the pool (e.g., changes photos):
- `personaPoolVersion` changes on the `clients` doc
- On next verification cycle, each service detects version mismatch **only for already-assigned accounts**
- **Staggered re-assignment:** promote-clients verifies on each mobile connection (sequential). tg-aut verifies at startup only. CommonTgService warmup verifies per warmup cycle. No thundering herd.
- **Operator urgency:** If immediate propagation is needed, operator restarts the specific PM2 process. The 6-hour TTL cache ensures non-restarted processes pick it up within 6 hours.

### Legacy Photo Fallback in Downstream Services

If `assignedPhotoFilenames.length === 0`, the service does **not** run persona-photo verification. Instead it keeps the legacy safety rule:

- If profile photo count is below the legacy threshold, use existing `dp*.jpg` fallback upload behavior
- If profile photos are already present, do nothing

This preserves current behavior for partially migrated clients that use persona names/bios but still rely on legacy photos.

## Photo Matching Policy (Detailed)

### What Telegram Does to Uploads

Telegram recompresses all uploaded images (JPEG quality reduction, possible resize). This means:
- A downloaded profile photo will never be byte-identical to the uploaded source
- JPEG artifacts can shift pixel values, especially in high-frequency areas
- But the overall structure (brightness pattern) is preserved

### aHash Resilience

aHash (average hash) reduces an image to an 8×8 grayscale grid and compares each pixel to the mean. This is specifically designed to survive:
- JPEG recompression (tested: 3-6 bit drift on typical photos)
- Minor color shifts
- Resolution changes

**It does NOT survive:** Cropping, rotation, significant filters, or completely different images.

### Matching Rules

```
Match = (count matches) AND (bidirectional hash match within threshold)
```

1. **Count mismatch** (e.g., 2 TG photos vs 3 assigned) → upload assigned replacements, then prune extras
2. **Hash mismatch on any photo** (hamming distance >= 10) → upload assigned replacements, then prune extras
3. **All match** → no action

**Why upload-first then prune:** Delete-before-upload creates a zero-photo window if uploads fail midway. The safer approach is to upload the assigned replacements first and only then prune extras. This may create a temporary extra-photo window, but avoids leaving the account with no photos.

### Threshold Calibration

The `AHASH_MATCH_THRESHOLD = 10` was chosen based on aHash properties:
- 64-bit hash → max distance is 64
- Identical images: distance 0
- Same image after JPEG recompression: distance 3-6 (empirical)
- Visually similar but different images: distance 15-30
- Completely different images: distance 25-45

Threshold of 10 gives comfortable margin above compression drift and well below false-positive range. If monitoring shows false positives, increase to 12-14.

## Observability

### Logging

Each verification run logs:
```typescript
logger.info(`[Persona] ${mobile}: name=${correctedName ? 'CORRECTED' : 'ok'}, lastName=${correctedLastName ? 'CORRECTED' : 'ok'}, bio=${correctedBio ? 'CORRECTED' : 'ok'}, photos=${correctedPhotos ? 'CORRECTED' : 'ok'}, poolVersion=${doc.assignedPersonaPoolVersion}`);
```

### Metrics to Watch (Manual / Dashboard)

| Metric | Where to check | Alert threshold |
|--------|---------------|-----------------|
| Correction count per cycle | Service logs: `[Persona].*CORRECTED` | >50% of accounts correcting = investigate |
| Pool version mismatch rate | Service logs: `needsReassignment` | Expected spike after pool update, should settle in 6h |
| Photo hash false positives | Service logs: photo correction when photos haven't changed | Any = calibrate threshold |
| Persona-combo collision rate | DB query grouped by `(clientId, assignedFirstName, assignedLastName, assignedBio, sortedAssignedPhotoSet)` | Expected when pool < account count |
| Persona folder missing | Service logs: `Persona folder missing` | Any = deploy issue |
| Assignment took > 1 retry | Not applicable — atomic guard, no retry needed | — |

### Test Coverage

Unit tests for:
- `computeAHash` — known image → known hash
- `hammingDistance` — known pairs
- `nameMatchesAssignment` — with/without obfuscation, emoji, edge cases
- `lastNameMatches` — null handling, exact match
- `bioMatches` — null handling, exact match
- `hasAssignment` / `needsReassignment` — per-field enablement rules
- `generateCandidateCombinations` — bounded sample size, no cartesian explosion
- `assignPersona` atomic guard — mock concurrent calls
- `computePersonaPoolVersion` — deterministic for same input

Integration tests for:
- `verifyAndCorrectPersona` — mock TG client, verify correct corrections applied
- Pool version change → reassignment triggered
- Empty pool → fallback behavior
- Photo-only pool → photo assignment and verification without name rewrite
- Bio-only pool → bio assignment and verification without name/photo rewrite
- Pool removal for last names/photos → no unintended clears or legacy-photo reversion
- Missing persona folder → graceful degradation
- `setupClient` → persona fields copied correctly

## Implementation Order

1. **Image hash utility** (`src/utils/image-hash.ts`) — standalone, testable
2. **Homoglyph normalizer** — reverse map from `obfuscateText.ts` for name comparison
3. **Schema + DTO changes** — pool fields on `clients`, assignment fields on buffer/promote, `personaPoolVersion`, `assignedPersonaPoolVersion`
4. **Persona-pool API endpoint** — `GET /clients/:clientId/persona-pool`, `GET /clients/:clientId/existing-assignments`
5. **Photo folder structure** — `persona/{dbcoll}/` directories, aHash utility script, `PERSONA_PATH` env var
6. **Persona assignment logic** — `assignPersona()` with atomic reservation and deduplication
7. **Warmup integration** — `updateNameAndBio()`, `updateProfilePhotos()` use persisted assignments, write bio
8. **`setupClient` changes** — copy persona assignment fields from buffer doc to clients doc on swap
9. **Shared persona verifier** — `verifyAndCorrectPersona()` with per-field enablement, pool version check, name/bio/lastName/photo verification
10. **Randomization hardening** — replace uniform delays, widen jitter
11. **promote-clients-local integration** — import verifier, `PersonaPoolCache.getInstance()` with 6h TTL, direct DB query for existing assignments, call on connect, per-mobile name
12. **tg-aut-local integration** — read assignment from clients doc, verify at startup, override env name, API call for existing assignments
13. **Migration gating** — `PERSONA_ENABLED_CLIENTS` env var, staged rollout per client

Steps 1-10, 13 in CommonTgService. Steps 11-12 in respective services. Steps 11 and 12 are independent. Both depend on 1-9.
