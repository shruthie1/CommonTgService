"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChatId = normalizeChatId;
exports.expandChatIdVariants = expandChatIdVariants;
exports.isChannelOrGroupEntity = isChannelOrGroupEntity;
const telegram_1 = require("telegram");
function normalizeChatId(id) {
    return id.toString().replace(/^-100/, '');
}
function expandChatIdVariants(id) {
    const normalized = normalizeChatId(id);
    return [normalized, `-100${normalized}`];
}
function isChannelOrGroupEntity(entity) {
    return entity instanceof telegram_1.Api.Channel || entity instanceof telegram_1.Api.Chat;
}
//# sourceMappingURL=dialog-chat-utils.js.map