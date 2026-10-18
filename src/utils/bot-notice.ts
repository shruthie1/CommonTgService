import axios from 'axios';
import { notifTarget, ppplTarget } from './logbots';
import { formatClassicNotificationHtml, formatRichMessageHtml } from './rich-message';
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

/**
 * Raw-token notices as a Bot API rich message (sendRichMessage) to the accounts / updates chat with
 * the BOT_TOKENS rotation. When Telegram refuses the payload (HTTP 400/404) the notice is resent
 * once as a classic sendMessage with the same token. Network errors / 429 get no second attempt.
 * Never throws; deliberately does not use fetchWithTimeout (its failure alerts would recurse here).
 */
export async function sendBotNotice(
    target: 'notif' | 'pppl',
    input: RichNotificationInput,
    opts: BotNoticeOptions = {},
): Promise<BotNoticeResult> {
    const timeout = opts.timeout ?? 10000;
    let t: { token: string; chatId: string };
    try {
        t = target === 'notif' ? notifTarget(opts.chatId, opts.token) : ppplTarget(opts.chatId, opts.token);
    } catch (error) {
        console.error('Bot notice skipped (no bot token):', (error as Error)?.message);
        return { sent: false };
    }
    const api = (method: string) => `https://api.telegram.org/bot${t.token}/${method}`;
    try {
        const response = await axios.post(
            api('sendRichMessage'),
            { chat_id: t.chatId, rich_message: { html: formatRichMessageHtml(input, { prefix: opts.prefix }) } },
            { timeout },
        );
        return { sent: response.data?.ok === true, data: response.data };
    } catch (error) {
        const status = Number((error as { response?: { status?: number } })?.response?.status);
        if (status !== 400 && status !== 404) {
            console.error('Bot notice failed:', (error as any)?.response?.data?.description || (error as Error)?.message);
            return { sent: false, data: (error as any)?.response?.data };
        }
    }
    try {
        const response = await axios.post(
            api('sendMessage'),
            { chat_id: t.chatId, text: formatClassicNotificationHtml(input, opts.prefix), parse_mode: 'HTML' },
            { timeout },
        );
        return { sent: response.data?.ok === true, data: response.data };
    } catch (error) {
        console.error('Bot notice fallback failed:', (error as any)?.response?.data?.description || (error as Error)?.message);
        return { sent: false, data: (error as any)?.response?.data };
    }
}
