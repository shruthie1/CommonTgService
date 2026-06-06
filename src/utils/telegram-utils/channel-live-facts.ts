export interface TelegramChannelLiveFacts {
    channelId: string;
    title: string | null;
    username: string | null;
    participantsCount: number | null;
    broadcast: boolean;
    restricted: boolean;
    left: boolean;
    private: boolean;
    forbidden: boolean;
    megagroup: boolean;
    sendMessages: boolean;
    sendPlain: boolean;
    canSendMsgs: boolean;
}

export interface TelegramChannelLiveFactsInput {
    channelId: unknown;
    peer?: unknown;
    entity?: unknown;
    resolveParticipantsCount?: (entity: unknown, normalizedChannelId: string) => Promise<unknown> | unknown;
}

export interface TelegramEntityLookupClient {
    getEntity(peer: unknown): Promise<unknown>;
}

export async function getTelegramChannelLiveFacts(
    client: TelegramEntityLookupClient,
    input: TelegramChannelLiveFactsInput,
): Promise<TelegramChannelLiveFacts | null> {
    const channelId = normalizeTelegramChannelId(input.channelId);
    if (!channelId) return null;

    const entity = input.entity ?? await client.getEntity(input.peer ?? `-100${channelId}`);
    if (!isRecord(entity)) return null;

    const forbiddenEntity = isForbiddenEntity(entity);
    const sendMessages = readBoolean(entity.defaultBannedRights, 'sendMessages') || readBoolean(entity, 'sendMessages');
    const sendPlain = readBoolean(entity.defaultBannedRights, 'sendPlain') || readBoolean(entity, 'sendPlain');
    const facts: TelegramChannelLiveFacts = {
        channelId,
        title: readString(entity, 'title'),
        username: readString(entity, 'username'),
        participantsCount: await resolveParticipantsCount(entity, channelId, input.resolveParticipantsCount),
        broadcast: readBoolean(entity, 'broadcast'),
        restricted: readBoolean(entity, 'restricted'),
        left: readBoolean(entity, 'left'),
        private: readBoolean(entity, 'private') || forbiddenEntity,
        forbidden: readBoolean(entity, 'forbidden') || forbiddenEntity,
        megagroup: readBoolean(entity, 'megagroup'),
        sendMessages,
        sendPlain,
        canSendMsgs: false,
    };

    facts.canSendMsgs = !facts.broadcast
        && !facts.restricted
        && !facts.left
        && !facts.private
        && !facts.forbidden
        && !facts.sendMessages
        && !facts.sendPlain;

    return facts;
}

export function normalizeTelegramChannelId(input: unknown): string {
    const normalized = String(input ?? '').trim().replace(/^-100/, '').replace(/^-/, '');
    return /^\d+$/.test(normalized) && normalized !== '0' ? normalized : '';
}

async function resolveParticipantsCount(
    entity: Record<string, unknown>,
    channelId: string,
    resolver?: TelegramChannelLiveFactsInput['resolveParticipantsCount'],
): Promise<number | null> {
    const resolved = resolver ? await resolver(entity, channelId) : undefined;
    return normalizeNonNegativeInteger(resolved) ?? normalizeNonNegativeInteger(entity.participantsCount);
}

function normalizeNonNegativeInteger(input: unknown): number | null {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return Math.floor(input);
    if (typeof input === 'string' && input.trim()) {
        const parsed = Number(input);
        if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
    }
    return null;
}

function readBoolean(source: unknown, key: string): boolean {
    return isRecord(source) && source[key] === true;
}

function readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized || null;
}

function isForbiddenEntity(entity: Record<string, unknown>): boolean {
    const className = readString(entity, 'className') || entity.constructor?.name || '';
    return className === 'ChannelForbidden' || className === 'ChatForbidden';
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object';
}
