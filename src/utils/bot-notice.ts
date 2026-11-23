import axios from 'axios';
import { notifTarget, ppplTarget } from './logbots';
import { formatClassicNotificationHtml, formatRichMessageHtml, notificationKeyboard } from './rich-message';
import type { RichNotificationInput } from './rich-message';

export interface BotNoticeOptions {
    /** Override the default chat (accountsChannel / updatesChannel). */
    chatId?: string;
    /** Explicit bot token; skips the BOT_TOKENS rotation. */
    token?: string;
    /** Heading prefix. */
    prefix?: string;
    timeout?: number;
}

export interface BotNoticeResult {
    sent: boolean;
    /** Telegram's response body, when the request reached Telegram. */
    data?: any;
}

/** A failure about the token or its access to the chat (not the payload, not the network): another token may work. */
const REJECTION = /unauthorized|chat not found|PEER_ID_INVALID|FROZEN_METHOD_INVALID|bot was kicked|not a member|not enough rights|need administrator rights|CHAT_WRITE_FORBIDDEN|bot was blocked/i;

function isTokenOrChatRejection(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: { description?: string } } })?.response;
    const status = Number(response?.status);
    return status === 401 || status === 403 || REJECTION.test(String(response?.data?.description ?? ''));
}

const botId = (token: string) => String(token).split(':')[0];

interface Attempt extends BotNoticeResult {
    /** Telegram rejected the token or its access to the chat. */
    rejected: boolean;
}

/**
 * One token: sendRichMessage; when Telegram refuses the payload (HTTP 400/404, not a token/chat rejection) the
 * notice is resent once as a classic sendMessage with the same token. Network errors / 429 get no second attempt.
 */
async function sendWithToken(t: { token: string; chatId: string }, input: RichNotificationInput, opts: BotNoticeOptions, timeout: number): Promise<Attempt> {
    const api = (method: string) => `https://api.telegram.org/bot${t.token}/${method}`;
    try {
        const response = await axios.post(
            api('sendRichMessage'),
            { chat_id: t.chatId, rich_message: { html: formatRichMessageHtml(input, { prefix: opts.prefix }) }, reply_markup: notificationKeyboard(input) },
            { timeout },
        );
        return { sent: response.data?.ok === true, data: response.data, rejected: false };
    } catch (error) {
        const status = Number((error as { response?: { status?: number } })?.response?.status);
        const rejected = isTokenOrChatRejection(error);
        if (rejected || (status !== 400 && status !== 404)) {
            console.error('Bot notice failed:', (error as any)?.response?.data?.description || (error as Error)?.message);
            return { sent: false, data: (error as any)?.response?.data, rejected };
        }
    }
    try {
        const response = await axios.post(
            api('sendMessage'),
            { chat_id: t.chatId, text: formatClassicNotificationHtml(input, opts.prefix), parse_mode: 'HTML', reply_markup: notificationKeyboard(input) },
            { timeout },
        );
        return { sent: response.data?.ok === true, data: response.data, rejected: false };
    } catch (error) {
        console.error('Bot notice fallback failed:', (error as any)?.response?.data?.description || (error as Error)?.message);
        return { sent: false, data: (error as any)?.response?.data, rejected: isTokenOrChatRejection(error) };
    }
}

/**
 * Raw-token notices as a Bot API rich message (sendRichMessage) to the accounts / updates chat with the token
 * rotation of that chat (BOT_TOKENS, or the CLIENT_UPDATES bots for that channel). When Telegram rejects the token or
 * its access to the chat (401/403, PEER_ID_INVALID, chat not found, frozen...), the next token of the same rotation is
 * tried once. An explicit opts.token is never swapped. Never throws; deliberately does not use fetchWithTimeout (its
 * failure alerts would recurse here).
 */
export async function sendBotNotice(
    target: 'notif' | 'pppl',
    input: RichNotificationInput,
    opts: BotNoticeOptions = {},
): Promise<BotNoticeResult> {
    const timeout = opts.timeout ?? 10000;
    const pick = () => (target === 'notif' ? notifTarget(opts.chatId, opts.token) : ppplTarget(opts.chatId, opts.token));
    let t: { token: string; chatId: string };
    try {
        t = pick();
    } catch (error) {
        console.error('Bot notice skipped (no bot token):', (error as Error)?.message);
        return { sent: false };
    }
    const first = await sendWithToken(t, input, opts, timeout);
    if (first.sent || !first.rejected) return { sent: first.sent, data: first.data };
    if (opts.token) {
        console.warn(`[bot-notice] kind=all_tokens_failed reason=explicit_token target=${target} chat=${t.chatId} bot=${botId(t.token)}`);
        return { sent: false, data: first.data };
    }
    const next = pick();
    if (next.token === t.token) {
        console.warn(`[bot-notice] kind=all_tokens_failed reason=single_token target=${target} chat=${t.chatId} bot=${botId(t.token)}`);
        return { sent: false, data: first.data };
    }
    console.warn(`[bot-notice] kind=retry_next_token target=${target} chat=${t.chatId} failed_bot=${botId(t.token)} next_bot=${botId(next.token)}`);
    const second = await sendWithToken(next, input, opts, timeout);
    if (!second.sent) {
        console.warn(`[bot-notice] kind=all_tokens_failed reason=${second.rejected ? 'rejected' : 'send_failed'} target=${target} chat=${next.chatId} tried=2`);
    }
    return { sent: second.sent, data: second.data };
}
