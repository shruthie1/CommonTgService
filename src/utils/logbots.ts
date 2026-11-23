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

/** CLIENT_UPDATES channel + its bot tokens from TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES ("<chat>::CLIENT_UPDATES::tok1,tok2"). */
function clientUpdatesConfig(): { chatId: string; tokens: string[] } | null {
    const [chat = '', , tokens = ''] = String(process.env.TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES || '').split('::');
    const list = tokens.split(',').map(t => t.trim()).filter(Boolean);
    return chat.trim() && list.length ? { chatId: chat.trim(), tokens: list } : null;
}

let clientUpdatesIndex = 0;
let lastPpplSource = '';

function notePpplSource(source: string, chatId: string): void {
    const key = `${source}|${chatId}`;
    if (key === lastPpplSource) return;
    lastPpplSource = key;
    console.log(`[bot-notice] kind=pppl_source source=${source} chat=${chatId}`);
}

/**
 * Token + chat for the updates channel; used by the rich legacy sender. The chat is updatesChannel (else the
 * CLIENT_UPDATES config channel); no hard-coded fallback. A send to that channel without an explicit token rotates
 * through the CLIENT_UPDATES bots, which are admins there (2026-11-23: the shared BOT_TOKENS bots are not admins of
 * the new private channel). Any other chat keeps the BOT_TOKENS rotation.
 */
export function ppplTarget(chatId?: string, botToken?: string) {
    const cu = clientUpdatesConfig();
    const target = chatId || process.env.updatesChannel || cu?.chatId;
    if (!target) throw new Error('No updates channel configured (updatesChannel / TELEGRAM_CHANNEL_CONFIG_CLIENT_UPDATES)');
    if (!botToken && cu && target === cu.chatId) {
        const token = cu.tokens[clientUpdatesIndex % cu.tokens.length];
        clientUpdatesIndex = (clientUpdatesIndex + 1) % cu.tokens.length;
        notePpplSource('client_updates_config', target);
        return { token, chatId: target };
    }
    if (!botToken) notePpplSource('bot_tokens', target);
    return nextTarget(target, botToken);
}
