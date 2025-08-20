import { TelegramClient } from "telegram";
export declare function channelInfo(client: TelegramClient, sendIds?: boolean): Promise<{
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
}>;
