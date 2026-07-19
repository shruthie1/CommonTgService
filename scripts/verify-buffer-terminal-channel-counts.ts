/**
 * Verify the real joined-channel count for buffer accounts that were incorrectly
 * marked session_rotated below the operational floor.
 *
 * Read-only by default. `--apply` persists only the verified `channels` count
 * and `lastChecked`; it never creates/replaces sessions or changes lifecycle
 * state, availability, status, or ownership.
 *
 * Usage:
 *   npx ts-node scripts/verify-buffer-terminal-channel-counts.ts
 *   npx ts-node scripts/verify-buffer-terminal-channel-counts.ts --apply
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { sleep } from 'telegram/Helpers';
import { generateTGConfig } from '../src/components/Telegram/utils/tg-config';

const mongoUri = process.env.mongouri || process.env.MONGO_URI;
if (!mongoUri) throw new Error('mongouri or MONGO_URI is required');

const apply = process.argv.includes('--apply');
const CHANNEL_FLOOR = 200;
const MIN_DELAY_MS = 12_000;
const MAX_DELAY_MS = 20_000;

type BufferCandidate = {
  _id: ObjectId;
  mobile: string;
  channels?: number;
};

type UserSession = {
  mobile: string;
  session?: string;
};

function normalizedMobile(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

async function countJoinedChannels(client: TelegramClient): Promise<number> {
  let count = 0;
  for await (const dialog of client.iterDialogs({ limit: 1500 })) {
    if (dialog.isChannel || dialog.isGroup) count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  await mongo.connect();
  const collection = mongo.db('tgclients').collection<BufferCandidate>('bufferClients');
  const users = mongo.db('tgclients').collection<UserSession>('users');
  const candidates = await collection
    .find({
      status: 'active',
      inUse: { $ne: true },
      warmupPhase: 'session_rotated',
      channels: { $lt: CHANNEL_FLOOR },
    })
    .sort({ channels: 1, mobile: 1 })
    .toArray();

  console.log(`Verifying ${candidates.length} terminal buffer accounts (${apply ? 'APPLY' : 'DRY RUN'}).`);

  let verified = 0;
  let updated = 0;
  let failures = 0;
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const user = await users.findOne(
        { mobile: candidate.mobile },
        { projection: { mobile: 1, session: 1 } },
      );
      const session = user?.session?.trim();
      if (!session) {
        failures += 1;
        console.log(`${candidate.mobile}: skipped (missing users session)`);
        continue;
      }

      let telegramClient: TelegramClient | null = null;
      try {
        // This is a direct, deterministic local Telegram configuration. It does
        // not create, rotate, or persist a session, proxy, or device identity.
        const config = generateTGConfig(candidate.mobile, undefined, {
          connectionRetries: 1,
          requestRetries: 1,
          timeout: 15,
        });
        telegramClient = new TelegramClient(
          new StringSession(session),
          config.apiId,
          config.apiHash,
          {
            ...config,
            autoReconnect: false,
          },
        );
        await telegramClient.connect();

        const me = await telegramClient.getMe() as Api.User;
        if (normalizedMobile(me.phone) !== normalizedMobile(candidate.mobile)) {
          throw new Error('session identity does not match the buffer mobile');
        }

        const liveChannels = await countJoinedChannels(telegramClient);
        verified += 1;
        console.log(`${candidate.mobile}: stored=${candidate.channels ?? 0}, verified=${liveChannels}`);

        if (apply) {
          const result = await collection.updateOne(
            {
              _id: candidate._id,
              status: 'active',
              inUse: { $ne: true },
              warmupPhase: 'session_rotated',
            },
            { $set: { channels: liveChannels, lastChecked: new Date(), updatedAt: new Date() } },
          );
          updated += result.modifiedCount;
        }
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${candidate.mobile}: verification failed (${message})`);
      } finally {
        if (telegramClient) {
          try {
            await telegramClient.disconnect();
          } catch {
            // Best-effort cleanup only.
          }
        }
      }

      if (index < candidates.length - 1) {
        const delay = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
        await sleep(delay);
      }
    }
  } finally {
    await mongo.close();
  }

  console.log(JSON.stringify({ candidates: candidates.length, verified, updated, failures, apply }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
