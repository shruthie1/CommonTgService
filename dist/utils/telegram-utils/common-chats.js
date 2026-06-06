"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramCommonChatIds = getTelegramCommonChatIds;
const big_integer_1 = __importDefault(require("big-integer"));
const tl_1 = require("telegram/tl");
const channel_live_facts_1 = require("./channel-live-facts");
async function getTelegramCommonChatIds(client, input) {
    if (!client || typeof client.invoke !== 'function') {
        throw new Error('Telegram client with invoke is required');
    }
    const result = await client.invoke(new tl_1.Api.messages.GetCommonChats({
        userId: input.userId,
        maxId: normalizeMaxId(input.maxId),
        limit: normalizeLimit(input.limit),
    }));
    const seen = new Set();
    const ids = [];
    for (const chat of Array.isArray(result?.chats) ? result.chats : []) {
        const channelId = (0, channel_live_facts_1.normalizeTelegramChannelId)(chat?.id);
        if (!channelId || seen.has(channelId))
            continue;
        seen.add(channelId);
        ids.push(channelId);
    }
    return ids;
}
function normalizeLimit(input) {
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
        return Math.min(Math.floor(input), 500);
    }
    return 100;
}
function normalizeMaxId(input) {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0)
        return (0, big_integer_1.default)(input);
    if (typeof input === 'string' && input.trim())
        return (0, big_integer_1.default)(input);
    if (input && typeof input === 'object' && typeof input.toString === 'function') {
        return (0, big_integer_1.default)(input.toString());
    }
    return (0, big_integer_1.default)(0);
}
//# sourceMappingURL=common-chats.js.map