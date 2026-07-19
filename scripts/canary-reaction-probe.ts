/**
 * One-account canary for validating reactions from a non-pool user session.
 *
 * It selects one active user that is not represented in clients, bufferClients, or
 * promoteClients; resolves a high-conversion, promotion-safe channel through its public
 * username; then uses channels.GetFullChannel to discover Telegram's allowed reactions.
 * It never joins a channel or writes to MongoDB.
 *
 * Default: probe only. `--execute` sends exactly one reaction after all checks pass.
 * A deliberately explicit broad batch is available for a controlled live canary: it
 * requires `--broad-conversion-targets --count <1-10> --delay-seconds <>=10>`.
 *
 * Usage:
 *   UMS_API_KEY=... npx ts-node --transpile-only scripts/canary-reaction-probe.ts \
 *     --allow-direct-network
 *
 * To send one reaction after a successful probe:
 *   UMS_API_KEY=... npx ts-node --transpile-only scripts/canary-reaction-probe.ts \
 *     --allow-direct-network --execute
 *
 * Re-run the same selected canary without exposing its session by supplying `--mobile <mobile>`.
 * A proxy may be supplied instead of direct local networking:
 *   TG_REACTION_PROXY_HOST=... TG_REACTION_PROXY_PORT=... \
 *   UMS_API_KEY=... npx ts-node --transpile-only scripts/canary-reaction-probe.ts
 */

import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { generateTGConfig, type TGProxyConfig } from '../src/components/Telegram/utils/tg-config';

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const execute = args.has('--execute');
const allowDirectNetwork = args.has('--allow-direct-network');
const mobileArgumentIndex = rawArgs.indexOf('--mobile');
const requestedMobile = mobileArgumentIndex >= 0 ? rawArgs[mobileArgumentIndex + 1]?.trim() : undefined;
const fingerprintArgumentIndex = rawArgs.indexOf('--user-fingerprint');
const requestedUserFingerprint = fingerprintArgumentIndex >= 0 ? rawArgs[fingerprintArgumentIndex + 1]?.trim().toLowerCase() : undefined;
const broadConversionTargets = args.has('--broad-conversion-targets');
const countArgumentIndex = rawArgs.indexOf('--count');
const requestedReactionCount = countArgumentIndex >= 0 ? Number(rawArgs[countArgumentIndex + 1]) : 1;
const delayArgumentIndex = rawArgs.indexOf('--delay-seconds');
const delaySeconds = delayArgumentIndex >= 0 ? Number(rawArgs[delayArgumentIndex + 1]) : 10;

const MAX_CHANNEL_CANDIDATES = Math.max(20, requestedReactionCount * 5);
const MESSAGE_LIMIT = 10;
const DIRECT_NETWORK_WARNING =
  'Direct local Telegram networking was not explicitly allowed. Pass --allow-direct-network or configure TG_REACTION_PROXY_HOST and TG_REACTION_PROXY_PORT.';

interface CanaryUser {
  mobile: string;
  session: string;
}

interface ChannelCandidate {
  channelId: string;
  username: string;
  creditedDms: number;
  survivalRate: number;
}

interface ResolvedChannel {
  channelId: string;
  username: string;
  entity: Api.Channel;
  creditedDms: number;
  survivalRate: number;
}

interface ReactionReadyTarget {
  target: ResolvedChannel;
  inputChannel: Api.TypeInputPeer;
  emoticons: string[];
}

function log(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...details }));
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function isTruthyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseProxy(): TGProxyConfig | undefined {
  const host = process.env.TG_REACTION_PROXY_HOST?.trim();
  const port = Number(process.env.TG_REACTION_PROXY_PORT);
  if (!host && !process.env.TG_REACTION_PROXY_PORT) {
    return undefined;
  }
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Both TG_REACTION_PROXY_HOST and a valid TG_REACTION_PROXY_PORT are required when configuring a proxy.');
  }
  return {
    ip: host,
    port,
    socksType: 5,
    username: process.env.TG_REACTION_PROXY_USERNAME?.trim() || undefined,
    password: process.env.TG_REACTION_PROXY_PASSWORD || undefined,
    timeout: 10,
  };
}

async function resolveMongoUri(): Promise<string> {
  const direct = process.env.MONGO_URI || process.env.mongouri || process.env.mongodburi;
  if (isTruthyString(direct)) return direct.trim();

  const apiKey = process.env.UMS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Set MONGO_URI or UMS_API_KEY; no database connection value is printed or persisted by this script.');
  }
  const response = await fetch(`https://ums.paidgirls.site/configuration?apiKey=${encodeURIComponent(apiKey)}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Unable to resolve Mongo configuration (${response.status}).`);
  const config = await response.json() as { mongouri?: unknown; mongodburi?: unknown };
  const uri = config.mongouri ?? config.mongodburi;
  if (!isTruthyString(uri)) throw new Error('Live configuration did not contain a Mongo URI.');
  return uri.trim();
}

async function selectCanaryUser(db: ReturnType<MongoClient['db']>, mobile?: string): Promise<CanaryUser | null> {
  const [bufferMobiles, promoteMobiles, clientMobiles] = await Promise.all([
    db.collection('bufferClients').distinct('mobile', { mobile: { $type: 'string' } }),
    db.collection('promoteClients').distinct('mobile', { mobile: { $type: 'string' } }),
    db.collection('clients').distinct('mobile', { mobile: { $type: 'string' } }),
  ]);
  const excludedMobiles = [...new Set([...bufferMobiles, ...promoteMobiles, ...clientMobiles].filter(isTruthyString))];
  const userMatch = {
    mobile: mobile ? mobile : { $type: 'string', $nin: excludedMobiles },
    session: { $type: 'string', $ne: '' },
    expired: { $ne: true },
  };
  if (mobile && excludedMobiles.includes(mobile)) {
    throw new Error('The requested mobile belongs to a client, buffer, or promote pool and cannot be used as this canary.');
  }
  const pipeline: Record<string, unknown>[] = [
    {
      $match: userMatch,
    },
  ];
  if (!mobile) pipeline.push({ $sample: { size: 1 } });
  pipeline.push({ $project: { _id: 0, mobile: 1, session: 1 } });
  const users = await db.collection('users').aggregate<CanaryUser>(pipeline).toArray();
  return users[0] ?? null;
}

async function resolveMobileByFingerprint(
  db: ReturnType<MongoClient['db']>,
  userFingerprint: string | undefined,
): Promise<string | undefined> {
  if (!userFingerprint) return undefined;
  if (!/^[a-f0-9]{12}$/.test(userFingerprint)) {
    throw new Error('--user-fingerprint must be the 12-character canary fingerprint emitted by this script.');
  }
  const users = await db.collection('users')
    .find({ mobile: { $type: 'string' } }, { projection: { _id: 0, mobile: 1 } })
    .toArray();
  const matched = users.find((user) => isTruthyString(user.mobile) && fingerprint(user.mobile) === userFingerprint);
  if (!matched || !isTruthyString(matched.mobile)) {
    throw new Error('The requested canary fingerprint no longer resolves to an active user record.');
  }
  return matched.mobile;
}

async function selectHighConversionChannels(db: ReturnType<MongoClient['db']>): Promise<ChannelCandidate[]> {
  const intelligenceMatch: Record<string, unknown> = {
    'safety.status': 'active',
    'DMs.credited': { $gt: 0 },
  };
  if (!broadConversionTargets) {
    intelligenceMatch['outcomes.attempted'] = { $gte: 10 };
    intelligenceMatch['outcomes.survived'] = { $gte: 1 };
  }
  return db.collection('channelIntelligence').aggregate<ChannelCandidate>([
    {
      $match: intelligenceMatch,
    },
    { $lookup: { from: 'activeChannels', localField: 'channelId', foreignField: 'channelId', as: 'activeChannel' } },
    { $unwind: '$activeChannel' },
    {
      $match: {
        'activeChannel.canSendMsgs': true,
        'activeChannel.username': { $type: 'string', $ne: '' },
        'activeChannel.banned': { $ne: true },
        'activeChannel.forbidden': { $ne: true },
        'activeChannel.private': { $ne: true },
      },
    },
    {
      $project: {
        _id: 0,
        channelId: 1,
        username: '$activeChannel.username',
        creditedDms: '$DMs.credited',
        survivalRate: { $divide: ['$outcomes.survived', '$outcomes.attempted'] },
        deletionRate: { $divide: ['$outcomes.deleted', '$outcomes.attempted'] },
      },
    },
    ...(broadConversionTargets ? [] : [{ $match: { survivalRate: { $gte: 0.8 }, deletionRate: { $lte: 0.1 } } }]),
    { $sort: { creditedDms: -1, survivalRate: -1 } },
    { $limit: MAX_CHANNEL_CANDIDATES },
  ]).toArray();
}

function validateBatchArguments(): void {
  if (!Number.isInteger(requestedReactionCount) || requestedReactionCount < 1 || requestedReactionCount > 10) {
    throw new Error('--count must be an integer from 1 to 10.');
  }
  if (!Number.isInteger(delaySeconds) || delaySeconds < 10 || delaySeconds > 60) {
    throw new Error('--delay-seconds must be an integer from 10 to 60.');
  }
  if (requestedReactionCount > 1 && !broadConversionTargets) {
    throw new Error('A multi-reaction canary requires --broad-conversion-targets so target quality is explicit.');
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isAccountSafetyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(FLOOD_WAIT|PEER_FLOOD|SESSION_REVOKED|AUTH_KEY_UNREGISTERED|USER_DEACTIVATED|PHONE_NUMBER_BANNED)/.test(message);
}

function normalizeDialogId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).replace(/^-100/, '').trim() || null;
}

async function resolvePublicCandidate(
  client: TelegramClient,
  candidates: ChannelCandidate[],
): Promise<ResolvedChannel | null> {
  for (const candidate of candidates) {
    try {
      const entity = await client.getEntity(candidate.username);
      if (!(entity instanceof Api.Channel)) continue;
      return {
        channelId: candidate.channelId,
        username: candidate.username,
        entity,
        creditedDms: Number(candidate.creditedDms) || 0,
        survivalRate: Number(candidate.survivalRate) || 0,
      };
    } catch {
      // A stale username should not stop the one-shot canary from testing the next valid target.
    }
  }
  return null;
}

async function resolveReactionReadyTarget(
  client: TelegramClient,
  candidates: ChannelCandidate[],
): Promise<ReactionReadyTarget | null> {
  const remaining = [...candidates];
  while (remaining.length > 0) {
    const target = await resolvePublicCandidate(client, remaining);
    if (!target) return null;

    const inputChannel = await client.getInputEntity(target.entity);
    const fullChannel = await client.invoke(new Api.channels.GetFullChannel({ channel: inputChannel }));
    const emoticons = allowedEmoticons(fullChannel);
    if (emoticons.length > 0) return { target, inputChannel, emoticons };

    log('reactions_disabled', {
      channel: fingerprint(target.channelId),
      creditedDms: target.creditedDms,
      survivalRate: target.survivalRate,
    });
    const selectedIndex = remaining.findIndex((candidate) => candidate.channelId === target.channelId);
    if (selectedIndex < 0) return null;
    remaining.splice(selectedIndex, 1);
  }
  return null;
}

function allowedEmoticons(fullChannel: Api.messages.ChatFull): string[] {
  const reactions = fullChannel.fullChat instanceof Api.ChannelFull
    ? fullChannel.fullChat.availableReactions
    : undefined;
  if (reactions instanceof Api.ChatReactionsAll) return ['👍'];
  if (reactions instanceof Api.ChatReactionsSome) {
    return reactions.reactions
      .filter((reaction): reaction is Api.ReactionEmoji => reaction instanceof Api.ReactionEmoji)
      .map((reaction) => reaction.emoticon)
      .filter(isTruthyString);
  }
  return [];
}

function alreadyReacted(message: Api.Message): boolean {
  return message.reactions?.results?.some((reaction) => 'chosen' in reaction && reaction.chosen) ?? false;
}

async function main(): Promise<void> {
  validateBatchArguments();
  const proxy = parseProxy();
  if (!proxy && !allowDirectNetwork) throw new Error(DIRECT_NETWORK_WARNING);

  const mongoUri = await resolveMongoUri();
  const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  let telegram: TelegramClient | null = null;

  try {
    await mongo.connect();
    const db = mongo.db('tgclients');
    if (requestedMobile && requestedUserFingerprint) {
      throw new Error('Use only one of --mobile or --user-fingerprint.');
    }
    const resolvedMobile = requestedMobile ?? await resolveMobileByFingerprint(db, requestedUserFingerprint);
    const [canary, candidates] = await Promise.all([
      selectCanaryUser(db, resolvedMobile),
      selectHighConversionChannels(db),
    ]);
    if (!canary) throw new Error('No active non-pool user with a session is available.');
    if (candidates.length === 0) throw new Error('No high-conversion reaction candidate channel is available.');

    const config = generateTGConfig(canary.mobile, proxy, {
      connectionRetries: 1,
      requestRetries: 1,
      retryDelay: 1_000,
      timeout: 15,
    });
    telegram = new TelegramClient(new StringSession(canary.session), config.apiId, config.apiHash, config);
    log('canary_selected', {
      user: fingerprint(canary.mobile),
      targetCandidates: candidates.length,
      targetMode: broadConversionTargets ? 'all_conversion_credited' : 'high_quality_conversion_credited',
      requestedReactionCount,
      delaySeconds,
      network: proxy ? 'proxy' : 'direct-local',
      execute,
    });

    await Promise.race([
      telegram.connect(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Telegram connect timed out.')), 30_000)),
    ]);
    const me = await telegram.getMe();
    if (!(me instanceof Api.User) || normalizeDialogId(me.phone) !== normalizeDialogId(canary.mobile)) {
      throw new Error('Connected session did not match the selected canary account.');
    }

    let sent = 0;
    let inspected = 0;
    for (const candidate of candidates) {
      if (sent >= requestedReactionCount) break;
      inspected += 1;
      const ready = await resolveReactionReadyTarget(telegram, [candidate]);
      if (!ready) continue;

      const { target, inputChannel, emoticons } = ready;
      const messages = await telegram.getMessages(target.entity, { limit: MESSAGE_LIMIT });
      const message = messages.find((candidateMessage) => candidateMessage instanceof Api.Message
        && !candidateMessage.out
        && !alreadyReacted(candidateMessage)
        && (candidateMessage.reactions?.recentReactions?.length ?? 0) < 4);
      if (!(message instanceof Api.Message)) {
        log('no_reactable_message', { channel: fingerprint(target.channelId), creditedDms: target.creditedDms, survivalRate: target.survivalRate });
        continue;
      }

      const emoticon = emoticons[Math.floor(Math.random() * emoticons.length)];
      const result = {
        channel: fingerprint(target.channelId),
        messageId: message.id,
        creditedDms: target.creditedDms,
        survivalRate: target.survivalRate,
        allowedReactionCount: emoticons.length,
        execute,
      };
      if (!execute) {
        log('probe_ready', result);
        return;
      }

      try {
        await Promise.race([
          telegram.invoke(new Api.messages.SendReaction({
            peer: inputChannel,
            msgId: message.id,
            reaction: [new Api.ReactionEmoji({ emoticon })],
          })),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Telegram reaction timed out.')), 10_000)),
        ]);
        sent += 1;
        log('reaction_sent', result);
        if (sent < requestedReactionCount) await wait(delaySeconds * 1_000);
      } catch (error) {
        log('reaction_rejected', { channel: fingerprint(target.channelId), reason: isAccountSafetyError(error) ? 'account_safety_limit' : 'channel_not_writable' });
        if (isAccountSafetyError(error)) break;
      }
    }
    log('canary_complete', { requestedReactionCount, sent, inspected, targetCandidates: candidates.length });
  } finally {
    if (telegram) {
      await telegram.destroy().catch(() => undefined);
    }
    await mongo.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log('canary_failed', { message });
  process.exitCode = 1;
});
