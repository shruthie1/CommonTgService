import { Api, TelegramClient } from "telegram";
import { parseError } from "../parseError";

export async function channelInfo(client: TelegramClient, sendIds = false): Promise<{ chatsArrayLength: number; canSendTrueCount: number; canSendFalseCount: number; ids: string[], canSendFalseChats: string[] }> {
    if (!client) throw new Error('Client is not initialized');

    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    let totalCount = 0;
    let channelArray: string[] = [];
    const canSendFalseChats = [];

    // Use iterDialogs instead of getDialogs for better performance with large dialog lists
    for await (const dialog of client.iterDialogs({ limit: 1500 })) {
        if (dialog.isChannel || dialog.isGroup) {
            try {
                const chatEntity = <Api.Channel>dialog.entity.toJSON();
                const { broadcast, defaultBannedRights, id } = chatEntity;
                totalCount++;

                if (!broadcast && !defaultBannedRights?.sendMessages) {
                    canSendTrueCount++;
                    channelArray.push(id.toString()?.replace(/^-100/, ""));
                } else {
                    canSendFalseCount++;
                    canSendFalseChats.push(id.toString()?.replace(/^-100/, ""));
                }
            } catch (error) {
                parseError(error, "Failed to Fetch Channel Info");
            }
        }
    }

    console.info("TotalChats:", totalCount);

    return {
        chatsArrayLength: totalCount,
        canSendTrueCount,
        canSendFalseCount,
        ids: sendIds ? channelArray : [],
        canSendFalseChats
    };
}