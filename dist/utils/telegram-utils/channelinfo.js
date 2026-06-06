"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelInfo = channelInfo;
const parseError_1 = require("../parseError");
const dialog_chat_utils_1 = require("./dialog-chat-utils");
const channel_live_facts_1 = require("./channel-live-facts");
async function channelInfo(client, sendIds = false) {
    if (!client)
        throw new Error('Client is not initialized');
    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    let totalCount = 0;
    const channelArray = [];
    const canSendFalseChats = [];
    for await (const dialog of client.iterDialogs({ limit: 1500 })) {
        if (dialog.isChannel || dialog.isGroup) {
            try {
                const entity = dialog.entity;
                if (!(0, dialog_chat_utils_1.isChannelOrGroupEntity)(entity)) {
                    continue;
                }
                const id = (0, dialog_chat_utils_1.normalizeChatId)(entity.id.toString());
                totalCount++;
                const liveFacts = await (0, channel_live_facts_1.getTelegramChannelLiveFacts)(client, {
                    channelId: id,
                    entity,
                });
                if (liveFacts?.canSendMsgs === true) {
                    canSendTrueCount++;
                    channelArray.push(id);
                }
                else {
                    canSendFalseCount++;
                    canSendFalseChats.push(id);
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error, "Failed to Fetch Channel Info");
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
//# sourceMappingURL=channelinfo.js.map