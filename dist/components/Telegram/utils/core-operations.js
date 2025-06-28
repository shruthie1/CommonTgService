"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
exports.destroy = destroy;
exports.getChatId = getChatId;
exports.getMe = getMe;
exports.errorHandler = errorHandler;
exports.getGrpMembers = getGrpMembers;
exports.getMessages = getMessages;
exports.getDialogs = getDialogs;
exports.channelInfo = channelInfo;
exports.leaveChannels = leaveChannels;
exports.getEntity = getEntity;
exports.safeGetEntity = safeGetEntity;
exports.createOrJoinChannel = createOrJoinChannel;
exports.getChats = getChats;
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const big_integer_1 = __importDefault(require("big-integer"));
async function createClient(sessionString, apiId, apiHash, handler = true, handlerFn) {
    const session = new sessions_1.StringSession(sessionString);
    const client = new telegram_1.TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: true,
    });
    await client.start({
        phoneNumber: async () => {
            throw new Error('Phone number should already be authenticated');
        },
        password: async () => {
            throw new Error('Password should already be handled');
        },
        phoneCode: async () => {
            throw new Error('Phone code should already be handled');
        },
        onError: (err) => console.log(err),
    });
    console.log('Client created and started successfully');
    if (handler && handlerFn) {
        client.addEventHandler(handlerFn, new events_1.NewMessage({}));
        console.log('Event handler added');
    }
    return client;
}
async function destroy(client) {
    try {
        if (client.connected) {
            await client.disconnect();
            console.log('Client disconnected successfully');
        }
    }
    catch (error) {
        console.error('Error during client destruction:', error);
        throw error;
    }
}
async function getChatId(client, username) {
    const entity = await client.getEntity(username);
    return entity;
}
async function getMe(client) {
    const me = await client.getMe();
    return me;
}
async function errorHandler(client, error) {
    console.error('Telegram client error:', error);
    if (error.code === 420) {
        const seconds = error.seconds || 60;
        console.log(`Flood wait: waiting ${seconds} seconds`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
    else if (error.code === 401) {
        console.error('Client unauthorized, session might be invalid');
        throw error;
    }
    else {
        throw error;
    }
}
async function getGrpMembers(client, entity) {
    try {
        const result = await client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: entity,
            filter: new telegram_1.Api.ChannelParticipantsRecent(),
            offset: 0,
            limit: 200,
            hash: (0, big_integer_1.default)(0)
        }));
        if ('users' in result) {
            const members = result.users.map((user) => ({
                id: user.id.toString(),
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                isBot: user.bot || false,
                isAdmin: false
            }));
            return {
                totalCount: result.count,
                members
            };
        }
        return { totalCount: 0, members: [] };
    }
    catch (error) {
        console.error('Error getting group members:', error);
        throw error;
    }
}
async function getMessages(client, entityLike, limit = 8) {
    return await client.getMessages(entityLike, { limit });
}
async function getDialogs(client, params) {
    return await client.getDialogs(params);
}
async function channelInfo(client, sendIds = false) {
    const chats = await client.getDialogs({ limit: 100 });
    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    const ids = [];
    const canSendFalseChats = [];
    for (const chat of chats) {
        if (chat.entity instanceof telegram_1.Api.Channel) {
            const channel = chat.entity;
            ids.push(channel.id.toString());
            if (channel.broadcast || channel.megagroup) {
                if (channel.defaultBannedRights?.sendMessages) {
                    canSendFalseCount++;
                    canSendFalseChats.push(channel.title || channel.id.toString());
                }
                else {
                    canSendTrueCount++;
                }
            }
        }
    }
    return {
        chatsArrayLength: chats.length,
        canSendTrueCount,
        canSendFalseCount,
        ids: sendIds ? ids : [],
        canSendFalseChats
    };
}
async function leaveChannels(client, chats) {
    for (const chat of chats) {
        try {
            const entity = await client.getEntity(chat);
            await client.invoke(new telegram_1.Api.channels.LeaveChannel({
                channel: entity
            }));
            console.log(`Left channel: ${chat}`);
        }
        catch (error) {
            console.error(`Failed to leave channel ${chat}:`, error);
        }
    }
}
async function getEntity(client, entity) {
    try {
        return await client.getEntity(entity);
    }
    catch (error) {
        console.error('Error getting entity:', error);
        throw error;
    }
}
async function safeGetEntity(client, entityId) {
    try {
        return await client.getEntity(entityId);
    }
    catch (error) {
        console.log(`Failed to get entity directly for ${entityId}, searching in dialogs...`);
        try {
            const dialogs = await client.getDialogs({ limit: 100 });
            const dialog = dialogs.find(d => d.entity.id.toString() === entityId ||
                ('username' in d.entity && d.entity.username === entityId));
            if (dialog) {
                return dialog.entity;
            }
            return null;
        }
        catch (dialogError) {
            return null;
        }
    }
}
async function createOrJoinChannel(client, channel) {
    try {
        console.log(`Trying to join channel: ${channel}`);
        const entity = await client.getEntity(channel);
        if (entity instanceof telegram_1.Api.Channel) {
            await client.invoke(new telegram_1.Api.channels.JoinChannel({
                channel: entity
            }));
            console.log(`Joined channel: ${channel}`);
        }
    }
    catch (error) {
        console.error(`Error joining channel ${channel}:`, error);
        throw error;
    }
}
async function getChats(client, options) {
    const dialogs = await client.getDialogs({
        ...options,
        limit: options.limit || 100
    });
    return Promise.all(dialogs.map(async (dialog) => {
        const entity = dialog.entity;
        return {
            id: entity.id.toString(),
            title: 'title' in entity ? entity.title : null,
            username: 'username' in entity ? entity.username : null,
            type: entity instanceof telegram_1.Api.User ? 'user' :
                entity instanceof telegram_1.Api.Chat ? 'group' :
                    entity instanceof telegram_1.Api.Channel ? 'channel' : 'unknown',
            unreadCount: dialog.unreadCount,
            lastMessage: dialog.message ? {
                id: dialog.message.id,
                text: dialog.message.message,
                date: new Date(dialog.message.date * 1000)
            } : null
        };
    }));
}
//# sourceMappingURL=core-operations.js.map