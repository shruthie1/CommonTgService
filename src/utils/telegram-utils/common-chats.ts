import bigInt from 'big-integer';
import { Api } from 'telegram/tl';
import { normalizeTelegramChannelId } from './channel-live-facts';

export interface TelegramCommonChatsClient {
    invoke(request: unknown): Promise<{ chats?: Array<{ id?: unknown }> | null } | null | undefined>;
}

export async function getTelegramCommonChatIds(
    client: TelegramCommonChatsClient,
    input: { userId: unknown; maxId?: unknown; limit?: number },
): Promise<string[]> {
    if (!client || typeof client.invoke !== 'function') {
        throw new Error('Telegram client with invoke is required');
    }

    const result = await client.invoke(new Api.messages.GetCommonChats({
        userId: input.userId as Api.TypeEntityLike,
        maxId: normalizeMaxId(input.maxId),
        limit: normalizeLimit(input.limit),
    }));

    const seen = new Set<string>();
    const ids: string[] = [];
    for (const chat of Array.isArray(result?.chats) ? result.chats : []) {
        const channelId = normalizeTelegramChannelId(chat?.id);
        if (!channelId || seen.has(channelId)) continue;
        seen.add(channelId);
        ids.push(channelId);
    }
    return ids;
}

function normalizeLimit(input: unknown): number {
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
        return Math.min(Math.floor(input), 500);
    }
    return 100;
}

function normalizeMaxId(input: unknown): ReturnType<typeof bigInt> {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0) return bigInt(input);
    if (typeof input === 'string' && input.trim()) return bigInt(input);
    if (input && typeof input === 'object' && typeof (input as { toString?: unknown }).toString === 'function') {
        return bigInt((input as { toString(): string }).toString());
    }
    return bigInt(0);
}
