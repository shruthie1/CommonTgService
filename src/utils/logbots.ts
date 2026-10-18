const getBotTokens = () => {
    const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
    if (botTokens.length === 0) {
        console.error('No bot tokens configured. Please set BOT_TOKENS environment variable');
        throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
    }
    return botTokens;
};

let botTokens: string[] | null = null;
let currentTokenIndex = 0;

const initializeBotTokens = () => {
    if (botTokens === null) {
        botTokens = getBotTokens();
    }
    return botTokens;
};

export function getBotToken() {
    return initializeBotTokens()[currentTokenIndex];
}

function nextTarget(chatId: string, botToken?: string): { token: string; chatId: string } {
    const tokens = initializeBotTokens();
    const token = botToken || tokens[currentTokenIndex];
    if (!botToken) {
        currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
    }
    return { token, chatId };
}

/** Token (round-robin unless given) + chat for the accounts channel; used by the rich legacy sender. */
export function notifTarget(chatId: string = process.env.accountsChannel || "-1001801844217", botToken?: string) {
    return nextTarget(chatId, botToken);
}

/** Token (round-robin unless given) + chat for the updates channel; used by the rich legacy sender. */
export function ppplTarget(chatId: string = process.env.updatesChannel || '-1001972065816', botToken?: string) {
    return nextTarget(chatId, botToken);
}
