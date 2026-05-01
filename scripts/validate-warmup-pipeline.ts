/**
 * LIVE VALIDATION SCRIPT — run against real DB to verify warmup logic
 *
 * Usage: npx ts-node scripts/validate-warmup-pipeline.ts
 *
 * This is READ-ONLY. It does NOT modify any data.
 * It simulates getWarmupPhaseAction for every active buffer client
 * and reports what action each would get, flagging any stuck scenarios.
 */

import { MongoClient } from 'mongodb';
import { getWarmupPhaseAction, WarmupPhase, WarmupPhaseType } from '../src/components/shared/warmup-phases';
import { ClientHelperUtils } from '../src/components/shared/client-helper.utils';

const MONGO_URI = process.env.mongouri || 'mongodb://sk123:B7lGqaFlMDnKAB1m@ac-oux75kn-shard-00-00.iucpdpe.mongodb.net:27017,ac-oux75kn-shard-00-01.iucpdpe.mongodb.net:27017,ac-oux75kn-shard-00-02.iucpdpe.mongodb.net:27017/tgclients?ssl=true&retryWrites=true&replicaSet=atlas-137i8d-shard-0&readPreference=primary&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface Issue {
    mobile: string;
    clientId: string;
    phase: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
}

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const col = client.db('tgclients').collection('bufferClients');
    const now = Date.now();

    const allActive = await col.find({ status: 'active' }).toArray();
    console.log(`\n=== LIVE WARMUP PIPELINE VALIDATION ===`);
    console.log(`Total active buffer clients: ${allActive.length}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    const issues: Issue[] = [];
    const actionCounts: Record<string, number> = {};
    const phaseCounts: Record<string, number> = {};
    const phaseActionMatrix: Record<string, Record<string, number>> = {};

    for (const doc of allActive) {
        const phase = doc.warmupPhase || 'null';
        phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;

        // Skip inUse accounts — they're active primaries
        if (doc.inUse === true) continue;

        // Simulate getWarmupPhaseAction
        const action = getWarmupPhaseAction({
            warmupPhase: doc.warmupPhase,
            warmupJitter: doc.warmupJitter || 0,
            enrolledAt: doc.enrolledAt,
            channels: doc.channels,
            privacyUpdatedAt: doc.privacyUpdatedAt,
            twoFASetAt: doc.twoFASetAt,
            otherAuthsRemovedAt: doc.otherAuthsRemovedAt,
            profilePicsDeletedAt: doc.profilePicsDeletedAt,
            nameBioUpdatedAt: doc.nameBioUpdatedAt,
            usernameUpdatedAt: doc.usernameUpdatedAt,
            profilePicsUpdatedAt: doc.profilePicsUpdatedAt,
            sessionRotatedAt: doc.sessionRotatedAt,
            organicActivityAt: doc.organicActivityAt,
            createdAt: doc.createdAt,
        }, now);

        const actionKey = `${action.phase}:${action.action}`;
        actionCounts[actionKey] = (actionCounts[actionKey] || 0) + 1;

        if (!phaseActionMatrix[phase]) phaseActionMatrix[phase] = {};
        phaseActionMatrix[phase][action.action] = (phaseActionMatrix[phase][action.action] || 0) + 1;

        const enrolledTs = ClientHelperUtils.getTimestamp(doc.enrolledAt) || ClientHelperUtils.getTimestamp(doc.createdAt);
        const ageDays = enrolledTs > 0 ? (now - enrolledTs) / ONE_DAY_MS : -1;
        const lastAttemptHours = doc.lastUpdateAttempt
            ? (now - new Date(doc.lastUpdateAttempt).getTime()) / (60 * 60 * 1000)
            : -1;

        // ── Detect stuck scenarios ──

        // 1. Missing enrolledAt AND createdAt
        if (!doc.enrolledAt && !doc.createdAt) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'CRITICAL', message: 'Missing both enrolledAt and createdAt — daysSinceEnrolled=0 forever' });
        }

        // 2. Missing enrolledAt (will be backfilled from createdAt, but flag it)
        if (!doc.enrolledAt && doc.createdAt) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'INFO', message: `Missing enrolledAt — will be backfilled from createdAt (${new Date(doc.createdAt).toISOString().split('T')[0]})` });
        }

        // 3. Zombie: 45+ days old, not terminal, has failures
        if (ageDays > 45 && phase !== WarmupPhase.SESSION_ROTATED && phase !== WarmupPhase.READY && (doc.failedUpdateAttempts || 0) >= 3) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'CRITICAL', message: `Zombie: ${Math.round(ageDays)}d old, ${doc.failedUpdateAttempts} fails — will be marked inactive` });
        }

        // 4. Stale: not processed in 7+ days, non-terminal
        if (lastAttemptHours > 168 && phase !== WarmupPhase.SESSION_ROTATED) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'WARNING', message: `Stale: last processed ${Math.round(lastAttemptHours)}h ago` });
        }

        // 5. Growing/maturing missing settling steps (catch-up will fire)
        if ((phase === WarmupPhase.GROWING || phase === WarmupPhase.MATURING) && !doc.twoFASetAt) {
            const catchupAction = action.action;
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'INFO', message: `Missing 2FA — catch-up will run: ${catchupAction}` });
        }

        // 6. upload_photo with no assignedProfilePics
        if (action.action === 'upload_photo' && (!doc.assignedProfilePics || doc.assignedProfilePics.length === 0)) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'INFO', message: 'upload_photo action but no assignedProfilePics — will stamp done to advance' });
        }

        // 7. update_name_bio action — check if client has persona pool
        // (Can't check client pool from here, but flag for manual verification)

        // 8. lastUsed on non-terminal
        if (doc.lastUsed && phase !== WarmupPhase.SESSION_ROTATED && phase !== WarmupPhase.READY) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'WARNING', message: 'lastUsed set on non-terminal account — was previously skipped, now will process' });
        }

        // 9. Action is 'wait' but account is old
        if (action.action === 'wait' && ageDays > 30 && phase !== WarmupPhase.SESSION_ROTATED) {
            issues.push({ mobile: doc.mobile, clientId: doc.clientId, phase, severity: 'WARNING', message: `Action=wait on ${Math.round(ageDays)}d old non-terminal account` });
        }
    }

    // ── Print phase distribution ──
    console.log('--- PHASE DISTRIBUTION ---');
    for (const [phase, count] of Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${phase.padEnd(20)} ${count}`);
    }

    // ── Print action matrix ──
    console.log('\n--- WHAT WOULD HAPPEN NEXT (phase → action) ---');
    for (const [phase, actions] of Object.entries(phaseActionMatrix).sort()) {
        const actionStr = Object.entries(actions).map(([a, c]) => `${a}:${c}`).join(', ');
        console.log(`  ${phase.padEnd(20)} → ${actionStr}`);
    }

    // ── Print issues by severity ──
    const criticals = issues.filter(i => i.severity === 'CRITICAL');
    const warnings = issues.filter(i => i.severity === 'WARNING');
    const infos = issues.filter(i => i.severity === 'INFO');

    if (criticals.length > 0) {
        console.log(`\n--- CRITICAL ISSUES (${criticals.length}) ---`);
        for (const i of criticals) {
            console.log(`  [${i.severity}] ${i.clientId.padEnd(12)} | ${i.mobile} | ${i.phase.padEnd(18)} | ${i.message}`);
        }
    }

    if (warnings.length > 0) {
        console.log(`\n--- WARNINGS (${warnings.length}) ---`);
        for (const w of warnings) {
            console.log(`  [${w.severity}] ${w.clientId.padEnd(12)} | ${w.mobile} | ${w.phase.padEnd(18)} | ${w.message}`);
        }
    }

    if (infos.length > 0) {
        console.log(`\n--- INFO (${infos.length}) ---`);
        for (const i of infos) {
            console.log(`  [${i.severity}] ${i.clientId.padEnd(12)} | ${i.mobile} | ${i.phase.padEnd(18)} | ${i.message}`);
        }
    }

    // ── Summary ──
    console.log('\n--- SUMMARY ---');
    console.log(`Total active: ${allActive.length}`);
    console.log(`Critical issues: ${criticals.length}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log(`Info: ${infos.length}`);
    console.log(`Accounts that WILL advance on next cycle: ${Object.entries(actionCounts).filter(([k]) => !k.includes('wait') && !k.includes('organic_only')).reduce((s, [, c]) => s + c, 0)}`);

    if (criticals.length === 0) {
        console.log('\n✓ NO CRITICAL ISSUES — pipeline looks healthy');
    } else {
        console.log('\n✗ CRITICAL ISSUES FOUND — review above before deploying');
    }

    await client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
