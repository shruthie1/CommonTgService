/**
 * Audit & clean stale TG configs from production Redis.
 *
 * Valid apiIds (from tg-config.ts API_CREDENTIALS):
 *   27919939, 25328268, 12777557, 27565391, 27586636, 29210552
 *
 * Any tg:config:* key with an _apiId NOT in this list is stale and should be deleted.
 *
 * Usage:
 *   npx ts-node scripts/audit-redis-configs.ts                  # dry-run (report only)
 *   npx ts-node scripts/audit-redis-configs.ts --execute        # actually delete stale configs
 *   npx ts-node scripts/audit-redis-configs.ts --execute --verbose
 */

import Redis from 'ioredis';

const VALID_API_IDS = new Set([27919939, 25328268, 12777557, 27565391, 27586636, 29210552]);

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || '187.127.137.163',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || 'Ajtdmwajt12!',
    db: Number(process.env.REDIS_DB) || 0,
};

const args = process.argv.slice(2);
const shouldExecute = args.includes('--execute');
const verbose = args.includes('--verbose');

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log(`Connecting to Redis at ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}...`);
    const redis = new Redis(REDIS_CONFIG);

    try {
        await redis.ping();
        log('Redis connected OK');
    } catch (err: any) {
        log(`Redis connection FAILED: ${err.message}`);
        process.exit(1);
    }

    // ── Step 1: Scan all tg:config:* keys ──
    log('Scanning tg:config:* keys...');
    const allKeys: string[] = [];
    let cursor = '0';
    do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'tg:config:*', 'COUNT', 500);
        cursor = nextCursor;
        allKeys.push(...batch);
    } while (cursor !== '0');

    log(`Found ${allKeys.length} tg:config:* keys`);

    // ── Step 2: Categorize (batch reads via pipeline) ──
    const stale: Array<{ key: string; mobile: string; apiId: number; device: string }> = [];
    const valid: Array<{ key: string; mobile: string; apiId: number }> = [];
    const broken: Array<{ key: string; error: string }> = [];

    const BATCH_SIZE = 500;
    for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
        const batch = allKeys.slice(i, i + BATCH_SIZE);
        const pipeline = redis.pipeline();
        for (const key of batch) pipeline.get(key);
        const results = await pipeline.exec();

        for (let j = 0; j < batch.length; j++) {
            const key = batch[j];
            const [err, raw] = results![j];
            if (err) { broken.push({ key, error: String(err) }); continue; }
            if (!raw) { broken.push({ key, error: 'empty value' }); continue; }

            try {
                const config = JSON.parse(raw as string);
                const apiId = config._apiId;
                const mobile = key.replace('tg:config:', '');

                if (!apiId || !VALID_API_IDS.has(apiId)) {
                    stale.push({ key, mobile, apiId: apiId || 0, device: config.deviceModel || 'unknown' });
                } else {
                    valid.push({ key, mobile, apiId });
                }
            } catch (parseErr: any) {
                broken.push({ key, error: parseErr.message });
            }
        }
        if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= allKeys.length) {
            log(`  Categorized ${Math.min(i + BATCH_SIZE, allKeys.length)}/${allKeys.length} keys...`);
        }
    }

    // ── Step 3: Also scan tg:proxy_map:* to report ──
    log('Scanning tg:proxy_map:* keys...');
    const proxyKeys: string[] = [];
    cursor = '0';
    do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'tg:proxy_map:*', 'COUNT', 500);
        cursor = nextCursor;
        proxyKeys.push(...batch);
    } while (cursor !== '0');

    // ── Step 4: Report ──
    console.log('\n════════════════════════════════════════');
    console.log('  REDIS TG CONFIG AUDIT REPORT');
    console.log('════════════════════════════════════════\n');
    console.log(`Valid API IDs: ${[...VALID_API_IDS].join(', ')}`);
    console.log(`Total tg:config:* keys: ${allKeys.length}`);
    console.log(`  Valid configs:  ${valid.length}`);
    console.log(`  STALE configs:  ${stale.length}`);
    console.log(`  Broken/empty:   ${broken.length}`);
    console.log(`Total tg:proxy_map:* keys: ${proxyKeys.length}`);

    if (stale.length > 0) {
        // Group stale by apiId
        const byApiId = new Map<number, typeof stale>();
        for (const s of stale) {
            const list = byApiId.get(s.apiId) || [];
            list.push(s);
            byApiId.set(s.apiId, list);
        }

        console.log('\n── Stale configs by apiId ──');
        for (const [apiId, entries] of [...byApiId.entries()].sort((a, b) => b[1].length - a[1].length)) {
            console.log(`  apiId=${apiId}: ${entries.length} entries`);
            if (verbose) {
                for (const e of entries) {
                    console.log(`    ${e.mobile} (device: ${e.device})`);
                }
            }
        }
    }

    if (broken.length > 0 && verbose) {
        console.log('\n── Broken keys ──');
        for (const b of broken) {
            console.log(`  ${b.key}: ${b.error}`);
        }
    }

    // ── Step 5: Execute deletion (if --execute) ──
    if (shouldExecute && stale.length > 0) {
        console.log(`\n── EXECUTING: Deleting ${stale.length} stale configs ──`);

        let deleted = 0;
        let proxyDeleted = 0;

        // Batch delete via pipeline
        for (let i = 0; i < stale.length; i += BATCH_SIZE) {
            const batch = stale.slice(i, i + BATCH_SIZE);
            const pipeline = redis.pipeline();
            for (const s of batch) {
                pipeline.del(s.key);
                pipeline.del(`tg:proxy_map:${s.mobile}`);
            }
            const results = await pipeline.exec();
            for (let j = 0; j < batch.length; j++) {
                const configDeleted = results![j * 2][1] as number;
                const proxyResult = results![j * 2 + 1][1] as number;
                if (configDeleted) deleted++;
                if (proxyResult) proxyDeleted++;
            }
            log(`  Deleted batch ${i}-${Math.min(i + BATCH_SIZE, stale.length)}...`);
        }

        // Also delete broken keys
        if (broken.length > 0) {
            const pipeline = redis.pipeline();
            for (const b of broken) pipeline.del(b.key);
            await pipeline.exec();
            deleted += broken.length;
        }

        console.log(`\nDone: ${deleted} config keys deleted, ${proxyDeleted} proxy mappings cleared`);
    } else if (!shouldExecute && stale.length > 0) {
        console.log(`\n⚠  DRY RUN — pass --execute to delete ${stale.length} stale configs`);
    } else if (stale.length === 0) {
        console.log('\nAll configs are valid — nothing to clean.');
    }

    // ── Step 6: Quick verification of valid configs ──
    if (valid.length > 0 && verbose) {
        console.log('\n── Valid configs sample ──');
        for (const v of valid.slice(0, 5)) {
            console.log(`  ${v.mobile}: apiId=${v.apiId}`);
        }
        if (valid.length > 5) console.log(`  ... and ${valid.length - 5} more`);
    }

    await redis.quit();
    log('Done');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
