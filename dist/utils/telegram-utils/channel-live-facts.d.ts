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
export declare function getTelegramChannelLiveFacts(client: TelegramEntityLookupClient, input: TelegramChannelLiveFactsInput): Promise<TelegramChannelLiveFacts | null>;
export declare function normalizeTelegramChannelId(input: unknown): string;
