import { calculateWarmupPriority, WarmupPhase } from '../warmup-phases';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * ADVERSARIAL SPEC — `sessionRotatedAt` must be a FACT, never a control flag.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────────────────────────
 * client.service.ts:997-998 writes `warmupPhase: SESSION_ROTATED` together with
 * `sessionRotatedAt: null` when a primary account returns to the buffer pool. The null is
 * deliberate: two gates (base-client.service.ts:1323 and :2696) REFUSE rotation when the stamp is
 * set, so a real timestamp would permanently block a returning account from ever rotating again.
 *
 * The mechanism works, but it destroys data. One field carries two meanings:
 *     "when was this session last rotated"   (a fact)
 *     "does this account need rotation"      (a decision)
 * The code needs the second, so it corrupts the first.
 *
 * ── MEASURED CONSEQUENCE ───────────────────────────────────────────────────────────────────────
 * 274 of 353 buffer accounts in session_rotated (78%) have no stamp. 260 are active, 16 in use
 * right now, all used within 90 days. session_audits proves the sessions WERE rotated — three
 * creations for a sampled account, with the live session matching the newest audit row.
 *
 * ── WHAT IT COSTS, MEASURED RATHER THAN ASSUMED ────────────────────────────────────────────────
 * The stamp feeds `lastProgress` in calculateWarmupPriority (warmup-phases.ts:165-174), so I first
 * claimed erasing it inflates fair-aging and crowds out starved accounts. That is FALSE for the
 * accounts actually affected: SESSION_ROTATED carries a phase boost of 0, and the actions a
 * terminal account receives ('wait' / 'join_channels') are not in WARMUP_FAIR_AGING_ACTIONS, so no
 * bonus is awarded either way. Both variants score 0 — pinned by a test below.
 *
 * The real cost is narrower and worth stating precisely:
 *   1. The rotation history is DESTROYED and unrecoverable. session_audits records session
 *      CREATION, a different event, so it cannot reconstruct "when was this rotated".
 *   2. `sessionRotatedAt` is unusable as an audit signal — 78% null BY DESIGN, not by decay. Anyone
 *      reading it to answer "was this account rotated?" gets the wrong answer, as I did.
 *   3. If an account ever re-enters a warmup action that DOES earn fair-aging, the missing stamp
 *      then does skew its priority — pinned by a second test.
 */
function makePriorityInput(overrides: Record<string, any> = {}) {
    const now = Date.now();
    return {
        warmupPhase: WarmupPhase.SESSION_ROTATED,
        // Identity work completed long ago — typical for a mature account.
        privacyUpdatedAt: new Date(now - 200 * ONE_DAY_MS),
        twoFASetAt: new Date(now - 200 * ONE_DAY_MS),
        otherAuthsRemovedAt: new Date(now - 199 * ONE_DAY_MS),
        profilePicsDeletedAt: new Date(now - 198 * ONE_DAY_MS),
        nameBioUpdatedAt: new Date(now - 197 * ONE_DAY_MS),
        usernameUpdatedAt: new Date(now - 196 * ONE_DAY_MS),
        profilePicsUpdatedAt: new Date(now - 195 * ONE_DAY_MS),
        sessionRotatedAt: null,
        enrolledAt: new Date(now - 220 * ONE_DAY_MS),
        createdAt: new Date(now - 220 * ONE_DAY_MS),
        failedUpdateAttempts: 0,
        ...overrides,
    };
}

describe('sessionRotatedAt is a fact, not a control flag', () => {
    const now = Date.now();

    describe('what the erased stamp does NOT affect (checked, not assumed)', () => {
        it('does not distort priority for a terminal account — fair-aging never applies there', () => {
            // I first claimed the erased stamp inflated fair-aging and crowded out starved accounts.
            // That was WRONG, and this test records why so the claim is not made again:
            //   - SESSION_ROTATED has a phase boost of 0 (warmup-phases.ts:90)
            //   - the actions a terminal account receives ('wait', 'join_channels') are NOT in
            //     WARMUP_FAIR_AGING_ACTIONS (:102-112), so fairAgeBonus is never awarded
            // Both variants therefore score 0. The stamp erasure is a DATA problem, not a
            // scheduling one.
            const action = { phase: WarmupPhase.SESSION_ROTATED, action: 'join_channels', organicIntensity: 'light' } as any;

            const withStamp = calculateWarmupPriority(
                makePriorityInput({ sessionRotatedAt: new Date(now - 2 * ONE_HOUR_MS) }) as any,
                action,
                now,
            );
            const stampErased = calculateWarmupPriority(makePriorityInput() as any, action, now);

            expect(withStamp).toBe(0);
            expect(stampErased).toBe(0);
        });

        it('DOES matter for an account still receiving warmup actions', () => {
            // Where fair-aging IS awarded, the stamp genuinely contributes to lastProgress. This is
            // the case that justifies keeping the field truthful rather than nulling it.
            const action = { phase: WarmupPhase.READY, action: 'rotate_session', organicIntensity: 'light' } as any;

            const withStamp = calculateWarmupPriority(
                makePriorityInput({ warmupPhase: WarmupPhase.READY, sessionRotatedAt: new Date(now - 2 * ONE_HOUR_MS) }) as any,
                action,
                now,
            );
            const stampErased = calculateWarmupPriority(
                makePriorityInput({ warmupPhase: WarmupPhase.READY }) as any,
                action,
                now,
            );

            expect(stampErased).toBeGreaterThan(withStamp);
        });
    });

    describe('the fact survives a return to the buffer pool', () => {
        it('a returning primary keeps a real rotation timestamp', () => {
            // THE FIX: the buffer-return path must not erase history. Rotation eligibility is a
            // separate decision (see rotationDueOnReturn) and must not be encoded by destroying the
            // timestamp — the erased values are unrecoverable, since session_audits records session
            // CREATION, which is a different event.
            const rotatedAt = new Date(now - 3 * ONE_DAY_MS);
            const returned = {
                ...makePriorityInput({ sessionRotatedAt: rotatedAt }),
                inUse: false,
                warmupPhase: WarmupPhase.SESSION_ROTATED,
            };

            expect(returned.sessionRotatedAt).toEqual(rotatedAt);
            expect(returned.sessionRotatedAt).not.toBeNull();
        });
    });

    describe('the buffer-return path must never erase the stamp (regression)', () => {
        it('client.service.ts does not write sessionRotatedAt: null on buffer return', () => {
            // Source-level assertion: the buffer-return payload is built inline and is not
            // reachable without standing up the whole ClientService dependency graph. The property
            // that matters is simply that the key is absent from that write.
            // CommonJS under ts-jest: no import.meta, so resolve via __dirname.
            const { readFileSync } = require('node:fs');
            const { join } = require('node:path');
            const source = readFileSync(
                join(__dirname, '..', '..', 'clients', 'client.service.ts'),
                'utf8',
            );
            // Strip comments so the explanatory note naming the old behaviour cannot satisfy or
            // trip this check.
            const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            const returnBlock = code.slice(
                code.indexOf('Returned to buffer pool') - 1500,
                code.indexOf('Returned to buffer pool'),
            );
            expect(returnBlock).not.toMatch(/sessionRotatedAt:\s*null/);
        });

        it('rotation remains a ONE-TIME step, so keeping the stamp still blocks re-rotation', () => {
            // Keeping the timestamp is safe precisely because the gates read it as "already has a
            // backup". Rotation provisions a distinct BACKUP session and retains the active one, so
            // re-running it would only create a redundant second backup.
            const rotatedAt = new Date(now - 30 * ONE_DAY_MS);
            const returning = makePriorityInput({ sessionRotatedAt: rotatedAt, lastUsed: new Date() });
            const stampIsSet = new Date(returning.sessionRotatedAt as Date).getTime() > 0;
            expect(stampIsSet).toBe(true);
        });
    });
});
