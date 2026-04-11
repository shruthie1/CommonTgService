import { Api, TelegramClient } from "telegram";
import { parseError } from "../parseError";
import { isChannelOrGroupEntity, normalizeChatId } from "./dialog-chat-utils";

export async function channelInfo(client: TelegramClient, sendIds = false): Promise<{ chatsArrayLength: number; canSendTrueCount: number; canSendFalseCount: number; ids: string[], canSendFalseChats: string[] }> {
    if (!client) throw new Error('Client is not initialized');

    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    let totalCount = 0;
    const channelArray: string[] = [];
    const canSendFalseChats: string[] = [];

    // Use iterDialogs instead of getDialogs for better performance with large dialog lists
    for await (const dialog of client.iterDialogs({ limit: 1500 })) {
        if (dialog.isChannel || dialog.isGroup) {
            try {
                const entity = dialog.entity;
                if (!isChannelOrGroupEntity(entity)) {
                    continue;
                }

                const broadcast = entity instanceof Api.Channel ? entity.broadcast : false;
                const defaultBannedRights = 'defaultBannedRights' in entity ? entity.defaultBannedRights : undefined;
                const id = normalizeChatId(entity.id.toString());
                totalCount++;

                if (!broadcast && !defaultBannedRights?.sendMessages) {
                    canSendTrueCount++;
                    channelArray.push(id);
                } else {
                    canSendFalseCount++;
                    canSendFalseChats.push(id);
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
