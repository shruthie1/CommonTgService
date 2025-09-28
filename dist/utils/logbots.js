"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotToken = getBotToken;
exports.notifbot = notifbot;
exports.ppplbot = ppplbot;
const getBotTokens = () => {
    const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
    if (botTokens.length === 0) {
        throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
    }
    return botTokens;
};
let botTokens = null;
let currentTokenIndex = 0;
const initializeBotTokens = () => {
    if (botTokens === null) {
        botTokens = getBotTokens();
    }
    return botTokens;
};
function getBotToken() {
    return initializeBotTokens()[currentTokenIndex];
}
function notifbot(chatId = process.env.accountsChannel || "-1001801844217", botToken) {
    const tokens = initializeBotTokens();
    const token = botToken || tokens[currentTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
    }
    return apiUrl;
}
function ppplbot(chatId = process.env.updatesChannel || '-1001972065816', botToken) {
    const tokens = initializeBotTokens();
    const token = botToken || tokens[currentTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
    }
    return apiUrl;
}
//# sourceMappingURL=logbots.js.map