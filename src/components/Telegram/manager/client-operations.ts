import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { sleep } from 'telegram/Helpers';
import { TgContext } from './types';
import { parseError } from '../../../utils/parseError';
import { contains } from '../../../utils/common';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { notifbot } from '../../../utils/logbots';
import { generateTGConfig } from '../utils/generateTGConfig';
import { withTimeout } from '../../../utils/withTimeout';
import { unregisterClient } from '../utils/connection-manager';

export async function createClient(
    ctx: TgContext,
    session: StringSession,
    handler: boolean = true,
    handlerFn?: (event: NewMessageEvent) => Promise<void>
): Promise<{ client: TelegramClient; apiId: number; apiHash: string }> {
    const { apiId, apiHash, params: tgConfiguration } = await generateTGConfig(ctx.phoneNumber);

    let client: TelegramClient | null = null;

    try {
        await withTimeout(async () => {
            client = new TelegramClient(session, apiId, apiHash, tgConfiguration);
            client.setLogLevel(LogLevel.ERROR);
            (client as TelegramClient & { _errorHandler: (error: Error) => Promise<void> })._errorHandler = async (error: Error) => { handleClientError(ctx, error); };
            await client.connect();
            ctx.logger.info(ctx.phoneNumber, 'Connected Client Succesfully');
        }, {
            timeout: 180000,
            errorMessage: `[Tg Manager]\n${ctx.phoneNumber}: Client Creation TimeOut\n`,
        });

        if (!client) {
            throw new Error(`Client is null after connection attempt for ${ctx.phoneNumber}`);
        }

        if (handler && client) {
            if (handlerFn) {
                ctx.logger.info(ctx.phoneNumber, 'Adding Custom Event Handler');
                client.addEventHandler(async (event: NewMessageEvent) => { await handlerFn(event); }, new NewMessage());
            } else {
                ctx.logger.info(ctx.phoneNumber, 'Adding Default Event Handler');
                client.addEventHandler(async (event: NewMessageEvent) => { await handleIncomingEvent(ctx, event); }, new NewMessage());
            }
            if (!client.connected) {
                throw new Error(`Client not connected after connection attempt for ${ctx.phoneNumber}`);
            }
        }

        return { client, apiId, apiHash };
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Client creation failed', error);
        if (client) {
            try {
                await client.destroy();
            } catch (destroyError) {
                ctx.logger.error(ctx.phoneNumber, 'Error destroying failed client', destroyError);
            }
        }
        throw error;
    }
}

export async function destroyClient(ctx: TgContext, session: StringSession): Promise<void> {
    const client = ctx.client;
    if (!client) return;

    // 1. Detach the error handler first so a late RPC error during teardown can't
    //    re-enter handleClientError.
    try { client._errorHandler = null; } catch { /* best-effort */ }

    // 2. Primary teardown: the public destroy() disconnects the underlying MTProto
    //    sender and releases the socket. This is the action that actually matters.
    let destroyed = false;
    try {
        await client.destroy();
        destroyed = true;
        ctx.logger.info(ctx.phoneNumber, 'Client Disconnected Sucessfully');
    } catch (error) {
        parseError(error, `${ctx.phoneNumber}: Error during client.destroy()`);
    }

    // 3. Best-effort internal cleanup. Each step is independently guarded so a
    //    throw here can never abort teardown or leak the sender — the previous
    //    version let a throwing _eventBuilders/_sender access escape, leaving the
    //    MTProto sender connected (a memory leak AND a live fingerprint Telegram
    //    can still see after we think the client is gone).
    try { client._eventBuilders = []; } catch { /* best-effort */ }
    try { session?.delete(); } catch { /* best-effort */ }
    try { client._destroyed = true; } catch { /* best-effort */ }

    // 4. If destroy() failed/partially failed, force-disconnect the sender as a
    //    fallback so the socket can't linger. Guarded so it can't throw out.
    if (!destroyed) {
        try {
            if (client._sender && typeof client._sender.disconnect === 'function') {
                await client._sender.disconnect();
            }
        } catch (senderError) {
            parseError(senderError, `${ctx.phoneNumber}: Error force-disconnecting sender`);
        }
    }

    try { await sleep(2000); } catch { /* best-effort */ }
}

export function handleClientError(ctx: TgContext, error: Error): NodeJS.Timeout | null {
    const errorDetails = parseError(error, `${ctx.phoneNumber}: RPC Error`, false);
    if ((error.message && error.message == 'TIMEOUT') || contains(errorDetails.message, ['ETIMEDOUT'])) {
        ctx.logger.error(ctx.phoneNumber, `Timeout error occurred for ${ctx.phoneNumber}`, error);
        return setTimeout(async () => {
            if (ctx.client && !ctx.client.connected) {
                ctx.logger.debug(ctx.phoneNumber, 'disconnecting client Connection Manually');
                await unregisterClient(ctx.phoneNumber);
            } else if (ctx.client) {
                ctx.logger.debug(ctx.phoneNumber, 'Client Connected after Retry');
            } else {
                ctx.logger.debug(ctx.phoneNumber, 'Client does not exist');
            }
        }, 10000);
    }
    return null;
}

export async function handleIncomingEvent(ctx: TgContext, event: NewMessageEvent): Promise<void> {
    if (event.isPrivate) {
        if (event.message.chatId.toString() == '777000') {
            ctx.logger.info(ctx.phoneNumber, event.message.text.toLowerCase());
            ctx.logger.info(ctx.phoneNumber, `Login Code received for - ${ctx.phoneNumber}\nActiveClientSetup - TelegramManager.activeClientSetup`);
            ctx.logger.info(ctx.phoneNumber, 'Date :', new Date(event.message.date * 1000));
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Login Code Received\n\nClient: ${process.env.clientId || 'unknown'}\nMobile: ${ctx.phoneNumber}\nMessage: ${event.message.text?.substring(0, 100)}`)}`);
        }
    }
}
