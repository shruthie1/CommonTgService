"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelInfo = channelInfo;
const parseError_1 = require("../parseError");
async function channelInfo(client, sendIds = false) {
    if (!client)
        throw new Error('Client is not initialized');
    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    let totalCount = 0;
    let channelArray = [];
    const canSendFalseChats = [];
    for await (const dialog of client.iterDialogs({ limit: 1500 })) {
        if (dialog.isChannel || dialog.isGroup) {
            try {
                const chatEntity = dialog.entity.toJSON();
                const { broadcast, defaultBannedRights, id } = chatEntity;
                totalCount++;
                if (!broadcast && !defaultBannedRights?.sendMessages) {
                    canSendTrueCount++;
                    channelArray.push(id.toString()?.replace(/^-100/, ""));
                }
                else {
                    canSendFalseCount++;
                    canSendFalseChats.push(id.toString()?.replace(/^-100/, ""));
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error);
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