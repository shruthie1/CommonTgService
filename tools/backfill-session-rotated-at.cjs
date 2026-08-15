/**
 * Backfill `sessionRotatedAt` for terminal accounts whose stamp was erased by the buffer-return
 * path (client.service.ts wrote `sessionRotatedAt: null` on every return, now removed).
 *
 * ── WHY THIS IS SAFE, AND WHY THE SOURCE IS lastUsed ───────────────────────────────────────────
 * `lastUsed` is set when an account serves as a live primary. An account cannot become a primary
 * without having gone through rotation, so a present `lastUsed` is direct evidence that rotation
 * happened. Measured 2026-08-15: ALL 278 affected accounts (274 buffer + 4 promote) have it — none
 * are ambiguous, so nothing is guessed.
 *
 * `session_audits` is deliberately NOT used as the source: it records session CREATION, a different
 * event from rotation, so deriving a rotation time from it would fabricate a fact.
 *
 * ── WHY WRITING A VALUE IS NOW CORRECT (it was not, before the code fix) ────────────────────────
 * Two gates refuse rotation when the stamp is set (base-client.service.ts:1323, :2696). Before the
 * code change, backfilling would have suppressed legitimate rotations. It no longer does, because
 * rotation is a ONE-TIME provisioning step: it creates a distinct BACKUP session and retains the
 * active one ("active session retained, users backup verified"). An account that already has a
 * backup never needs another — so a set stamp blocking re-rotation is the CORRECT outcome, not a
 * side effect.
 *
 * Run the code fix FIRST, or the buffer-return path will re-null these on the next return.
 *
 * Usage (from the CommonTgService repo root):
 *   node tools/backfill-session-rotated-at.cjs            # dry run
 *   node tools/backfill-session-rotated-at.cjs --apply    # write
 */
const { MongoClient } = require('mongodb');
const config = require('/tmp/ums-config.json');

const COLLECTIONS = ['bufferClients', 'promoteClients'];
const HARD_TIMEOUT_MS = 60_000;

(async () => {
    const apply = process.argv.includes('--apply');
    console.log(`\n=== BACKFILL sessionRotatedAt ${apply ? '(APPLY — WILL WRITE)' : '(DRY RUN)'} ===\n`);

    const kill = setTimeout(() => {
        console.error('HARD TIMEOUT — aborting so no Mongo connection is leaked');
        process.exit(1);
    }, HARD_TIMEOUT_MS);

    const client = new MongoClient(config.mongodburi, { serverSelectionTimeoutMS: 15000 });
    await client.connect();

    let totalEligible = 0;
    let totalWritten = 0;
    let totalSkipped = 0;

    for (const name of COLLECTIONS) {
        const collection = client.db().collection(name);
        // Only terminal accounts with an ERASED stamp. Accounts that legitimately never rotated are
        // excluded by requiring the terminal phase; accounts with no lastUsed are excluded below
        // because there is no evidence to derive from.
        const filter = {
            warmupPhase: 'session_rotated',
            sessionRotatedAt: { $in: [null, undefined] },
        };

        const rows = await collection
            .find(filter)
            .project({ mobile: 1, lastUsed: 1, channels: 1, status: 1 })
            .toArray();

        const eligible = rows.filter((row) => {
            const stamp = row.lastUsed ? new Date(row.lastUsed).getTime() : 0;
            return Number.isFinite(stamp) && stamp > 0;
        });
        const skipped = rows.length - eligible.length;

        totalEligible += eligible.length;
        totalSkipped += skipped;

        console.log(`${name}:`);
        console.log(`  null-stamp terminal rows : ${rows.length}`);
        console.log(`  eligible (has lastUsed)  : ${eligible.length}`);
        console.log(`  skipped (no evidence)    : ${skipped}  <- left null deliberately`);

        for (const row of eligible.slice(0, 3)) {
            console.log(`    e.g. ${row.mobile} lastUsed=${new Date(row.lastUsed).toISOString().slice(0, 10)} ch=${row.channels}`);
        }

        if (apply && eligible.length > 0) {
            const operations = eligible.map((row) => ({
                updateOne: {
                    // Re-assert the null condition in the filter so a concurrent write that set a
                    // real stamp between read and write is never overwritten.
                    filter: { _id: row._id, sessionRotatedAt: { $in: [null, undefined] } },
                    update: { $set: { sessionRotatedAt: new Date(row.lastUsed) } },
                },
            }));
            const result = await collection.bulkWrite(operations, { ordered: false });
            totalWritten += result.modifiedCount || 0;
            console.log(`  WRITTEN                  : ${result.modifiedCount}`);
        }
        console.log();
    }

    console.log('── SUMMARY ──');
    console.log(`  eligible : ${totalEligible}`);
    console.log(`  skipped  : ${totalSkipped}`);
    console.log(`  written  : ${apply ? totalWritten : 0}${apply ? '' : '  (dry run — nothing written)'}`);
    if (!apply) console.log('\n  Re-run with --apply to write.');

    await client.close();
    clearTimeout(kill);
    process.exit(0);
})().catch((error) => {
    console.error('ERR', error.message);
    process.exit(1);
});
