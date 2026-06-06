export interface TelegramCommonChatsClient {
    invoke(request: unknown): Promise<{
        chats?: Array<{
            id?: unknown;
        }> | null;
    } | null | undefined>;
}
export declare function getTelegramCommonChatIds(client: TelegramCommonChatsClient, input: {
    userId: unknown;
    maxId?: unknown;
    limit?: number;
}): Promise<string[]>;
