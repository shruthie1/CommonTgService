"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroup = createGroup;
exports.archiveChat = archiveChat;
exports.joinChannel = joinChannel;
exports.getGroupMembers = getGroupMembers;
exports.addContact = addContact;
exports.addContacts = addContacts;
exports.leaveChannels = leaveChannels;
exports.createGroupWithOptions = createGroupWithOptions;
exports.createGroupOrChannel = createGroupOrChannel;
exports.addMembersToGroup = addMembersToGroup;
exports.removeMembersFromGroup = removeMembersFromGroup;
exports.promoteUserToAdmin = promoteUserToAdmin;
exports.updateGroupInfo = updateGroupInfo;
exports.getChannelInfo = getChannelInfo;
const telegram_1 = require("telegram");
const big_integer_1 = __importDefault(require("big-integer"));
const Helpers_1 = require("telegram/Helpers");
const parseError_1 = require("../../../utils/parseError");
const uploads_1 = require("telegram/client/uploads");
const DEFAULT_CONFIG = {
    defaultGroupName: "Auto Created Group",
    defaultFolderId: 1,
    memberLimit: 200,
    retryAttempts: 3,
    delayBetweenOperations: 1000
};
function validateInput(value, name, type) {
    if (!value) {
        throw new Error(`${name} is required`);
    }
    switch (type) {
        case 'string':
            if (typeof value !== 'string' || value.trim().length === 0) {
                throw new Error(`${name} must be a non-empty string`);
            }
            break;
        case 'array':
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error(`${name} must be a non-empty array`);
            }
            break;
        case 'object':
            if (typeof value !== 'object') {
                throw new Error(`${name} must be an object`);
            }
            break;
    }
}
async function createGroup(client, phoneNumber, config) {
    validateInput(client, 'client', 'object');
    validateInput(phoneNumber, 'phoneNumber', 'string');
    const groupConfig = { ...DEFAULT_CONFIG, ...config };
    const groupName = config?.defaultGroupName || `Group_${phoneNumber.slice(-4)}_${Date.now()}`;
    const groupDescription = `Created for ${phoneNumber}`;
    try {
        console.log("Creating group:", groupName);
        const result = await client.invoke(new telegram_1.Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        }));
        if (!result.chats || result.chats.length === 0) {
            throw new Error('Failed to create group: No chat returned');
        }
        const chat = result.chats[0];
        if (!chat.id || !chat.accessHash) {
            throw new Error('Invalid group creation response: Missing ID or access hash');
        }
        const { id, accessHash } = chat;
        console.log("Group created successfully with ID:", id.toString());
        try {
            await archiveChat(client, id, accessHash);
        }
        catch (archiveError) {
            console.warn("Failed to archive chat, but group was created:", archiveError);
        }
        if (config?.usersToAdd && config.usersToAdd.length > 0) {
            try {
                await addMembersToGroup(client, id.toString(), config.usersToAdd);
            }
            catch (addUsersError) {
                console.warn("Failed to add some users, but group was created:", addUsersError);
            }
        }
        return { id, accessHash };
    }
    catch (error) {
        console.error("Error creating group:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to create group: ${errorDetails.message}`);
    }
}
async function archiveChat(client, id, accessHash, folderId = DEFAULT_CONFIG.defaultFolderId) {
    validateInput(client, 'client', 'object');
    validateInput(id, 'id', 'object');
    validateInput(accessHash, 'accessHash', 'object');
    try {
        console.log("Archiving chat", id.toString());
        await client.invoke(new telegram_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new telegram_1.Api.InputFolderPeer({
                    peer: new telegram_1.Api.InputPeerChannel({
                        channelId: id,
                        accessHash: accessHash,
                    }),
                    folderId: folderId,
                }),
            ],
        }));
        console.log("Chat archived successfully");
    }
    catch (error) {
        console.error("Error archiving chat:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to archive chat: ${errorDetails.message}`);
    }
}
async function joinChannel(client, entity) {
    validateInput(client, 'client', 'object');
    validateInput(entity, 'entity', 'string');
    try {
        console.log("Attempting to join channel:", entity);
        const channelEntity = await client.getEntity(entity);
        const result = await client.invoke(new telegram_1.Api.channels.JoinChannel({
            channel: channelEntity
        }));
        console.log("Successfully joined channel");
        return result;
    }
    catch (error) {
        console.error("Error joining channel:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to join channel: ${errorDetails.message}`);
    }
}
async function getGroupMembers(client, entity, options) {
    validateInput(client, 'client', 'object');
    validateInput(entity, 'entity', 'string');
    const { limit = DEFAULT_CONFIG.memberLimit, offset = 0 } = options || {};
    try {
        const result = [];
        const chat = await client.getEntity(entity);
        if (!(chat instanceof telegram_1.Api.Chat || chat instanceof telegram_1.Api.Channel)) {
            throw new Error("Invalid group or channel entity");
        }
        console.log(`Fetching members of ${chat.title || chat.username}...`);
        const participants = await client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: chat,
            filter: new telegram_1.Api.ChannelParticipantsRecent(),
            offset: offset,
            limit: Math.min(limit, 200),
            hash: (0, big_integer_1.default)(0),
        }));
        if (participants instanceof telegram_1.Api.channels.ChannelParticipants) {
            const users = participants.participants;
            console.log(`Found ${users.length} members`);
            for (const participant of users) {
                try {
                    const userId = participant instanceof telegram_1.Api.ChannelParticipant ? participant.userId : null;
                    if (userId) {
                        const userDetails = await client.getEntity(userId);
                        if (userDetails instanceof telegram_1.Api.User) {
                            result.push({
                                tgId: userDetails.id.toString(),
                                name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim(),
                                username: userDetails.username || "",
                            });
                            if (userDetails.firstName === 'Deleted Account' && !userDetails.username) {
                                console.warn("Found deleted account:", userDetails.id.toString());
                            }
                        }
                    }
                    else {
                        console.warn("Invalid participant data:", participant);
                    }
                }
                catch (userError) {
                    console.warn("Error processing user:", userError);
                }
            }
        }
        else {
            console.warn("No members found or invalid group type");
        }
        console.log(`Successfully retrieved ${result.length} members`);
        return result;
    }
    catch (error) {
        console.error("Error fetching group members:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to fetch group members: ${errorDetails.message}`);
    }
}
async function addContact(client, data, namePrefix) {
    validateInput(client, 'client', 'object');
    validateInput(data, 'data', 'array');
    validateInput(namePrefix, 'namePrefix', 'string');
    let successCount = 0;
    let failedCount = 0;
    const errors = [];
    try {
        console.log(`Adding ${data.length} contacts individually...`);
        for (let i = 0; i < data.length; i++) {
            const user = data[i];
            const firstName = `${namePrefix}${i + 1}`;
            const lastName = "";
            if (!user.mobile || !user.tgId) {
                const error = `Invalid user data at index ${i}: missing mobile or tgId`;
                errors.push(error);
                failedCount++;
                continue;
            }
            try {
                await client.invoke(new telegram_1.Api.contacts.AddContact({
                    firstName,
                    lastName,
                    phone: user.mobile,
                    id: user.tgId
                }));
                successCount++;
                console.log(`Added contact ${i + 1}/${data.length}: ${firstName}`);
                if (i < data.length - 1) {
                    await (0, Helpers_1.sleep)(DEFAULT_CONFIG.delayBetweenOperations);
                }
            }
            catch (contactError) {
                const errorMsg = `Failed to add contact ${firstName}: ${contactError.message}`;
                errors.push(errorMsg);
                failedCount++;
                console.warn(errorMsg);
            }
        }
        console.log(`Contact addition completed. Success: ${successCount}, Failed: ${failedCount}`);
        return { success: successCount, failed: failedCount, errors };
    }
    catch (error) {
        console.error("Error in contact addition process:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to add contacts: ${errorDetails.message}`);
    }
}
async function addContacts(client, mobiles, namePrefix) {
    validateInput(client, 'client', 'object');
    validateInput(mobiles, 'mobiles', 'array');
    validateInput(namePrefix, 'namePrefix', 'string');
    try {
        console.log(`Importing ${mobiles.length} contacts in batch...`);
        const inputContacts = [];
        const retryContacts = [];
        const failed = [];
        for (let i = 0; i < mobiles.length; i++) {
            const mobile = mobiles[i];
            if (!mobile || typeof mobile !== 'string' || mobile.length < 10) {
                failed.push(mobile || `Invalid mobile at index ${i}`);
                continue;
            }
            const firstName = `${namePrefix}${i + 1}`;
            const lastName = "";
            const clientId = (0, big_integer_1.default)((i << 16 | 0).toString(10));
            inputContacts.push(new telegram_1.Api.InputPhoneContact({
                clientId: clientId,
                phone: mobile.replace(/\D/g, ''),
                firstName: firstName,
                lastName: lastName
            }));
        }
        if (inputContacts.length === 0) {
            throw new Error('No valid contacts to import');
        }
        const result = await client.invoke(new telegram_1.Api.contacts.ImportContacts({
            contacts: inputContacts,
        }));
        const importedCount = result.imported?.length || 0;
        const retryContactsFromResult = result.retryContacts?.map(contact => contact instanceof telegram_1.Api.InputPhoneContact ? contact.phone : String(contact)) || [];
        console.log(`Contact import completed. Imported: ${importedCount}, Retry needed: ${retryContactsFromResult.length}, Failed: ${failed.length}`);
        return {
            imported: importedCount,
            retryContacts: retryContactsFromResult,
            failed: failed
        };
    }
    catch (error) {
        console.error("Error importing contacts:", error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to import contacts: ${errorDetails.message}`);
    }
}
async function leaveChannels(client, phoneNumber, chats) {
    validateInput(client, 'client', 'object');
    validateInput(phoneNumber, 'phoneNumber', 'string');
    validateInput(chats, 'chats', 'array');
    console.log(`${phoneNumber} - Starting to leave ${chats.length} channels`);
    const success = [];
    const failed = [];
    for (let i = 0; i < chats.length; i++) {
        const chatId = chats[i];
        try {
            const channelId = chatId.startsWith('-100') ? chatId : `-100${chatId}`;
            await client.invoke(new telegram_1.Api.channels.LeaveChannel({
                channel: channelId
            }));
            success.push(chatId);
            console.log(`${phoneNumber} - Left channel ${i + 1}/${chats.length}: ${chatId}`);
            if (i < chats.length - 1) {
                await (0, Helpers_1.sleep)(DEFAULT_CONFIG.delayBetweenOperations);
            }
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            const errorMessage = errorDetails.message;
            failed.push({ id: chatId, error: errorMessage });
            console.warn(`${phoneNumber} - Failed to leave channel ${chatId}: ${errorMessage}`);
            if (errorMessage.toLowerCase().includes('auth') ||
                errorMessage.toLowerCase().includes('session')) {
                console.error(`${phoneNumber} - Critical error detected, stopping operation: ${errorMessage}`);
                break;
            }
        }
    }
    console.log(`${phoneNumber} - Channel leaving completed. Success: ${success.length}, Failed: ${failed.length}`);
    return { success, failed };
}
async function createGroupWithOptions(client, options) {
    validateInput(client, 'client', 'object');
    validateInput(options, 'options', 'object');
    validateInput(options.title, 'options.title', 'string');
    try {
        const result = await createGroupOrChannel(client, options);
        if (!result.chats || result.chats.length === 0) {
            throw new Error('No chat returned from group creation');
        }
        const createdGroup = result.chats[0];
        if (options.members && options.members.length > 0) {
            try {
                const groupId = createdGroup.id.toString();
                await addMembersToGroup(client, groupId, options.members);
            }
            catch (memberError) {
                console.warn('Failed to add some members to the group:', memberError);
            }
        }
        return createdGroup;
    }
    catch (error) {
        console.error('Error creating group with options:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to create group: ${errorDetails.message}`);
    }
}
async function createGroupOrChannel(client, options) {
    validateInput(client, 'client', 'object');
    validateInput(options, 'options', 'object');
    validateInput(options.title, 'options.title', 'string');
    try {
        console.log('Creating group/channel:', options.title);
        const result = await client.invoke(new telegram_1.Api.channels.CreateChannel({
            title: options.title,
            about: options.about || '',
            megagroup: options.megagroup ?? true,
            broadcast: false,
            forImport: options.forImport ?? false,
        }));
        console.log('Group/channel created successfully:', options.title);
        return result;
    }
    catch (error) {
        console.error('Error creating group/channel:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to create group/channel: ${errorDetails.message}`);
    }
}
async function addMembersToGroup(client, groupId, userIds) {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userIds, 'userIds', 'array');
    const success = [];
    const failed = [];
    try {
        const channel = await client.getInputEntity(groupId);
        console.log(`Adding ${userIds.length} members to group ${groupId}`);
        const batchSize = 50;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            try {
                const users = await Promise.all(batch.map(async (id) => {
                    try {
                        return await client.getInputEntity(id);
                    }
                    catch (error) {
                        failed.push({ id, error: `Failed to resolve user: ${error.message}` });
                        return null;
                    }
                }));
                const validUsers = users.filter(user => user !== null);
                if (validUsers.length > 0) {
                    await client.invoke(new telegram_1.Api.channels.InviteToChannel({
                        channel,
                        users: validUsers
                    }));
                    const validUserIds = batch.filter((_, index) => users[index] !== null);
                    success.push(...validUserIds);
                }
                if (i + batchSize < userIds.length) {
                    await (0, Helpers_1.sleep)(DEFAULT_CONFIG.delayBetweenOperations * 2);
                }
            }
            catch (batchError) {
                batch.forEach(id => {
                    if (!failed.find(f => f.id === id)) {
                        failed.push({ id, error: `Batch processing failed: ${batchError.message}` });
                    }
                });
            }
        }
        console.log(`Member addition completed. Success: ${success.length}, Failed: ${failed.length}`);
        return { success, failed };
    }
    catch (error) {
        console.error('Error adding members to group:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to add members to group: ${errorDetails.message}`);
    }
}
async function removeMembersFromGroup(client, groupId, userIds) {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userIds, 'userIds', 'array');
    const success = [];
    const failed = [];
    try {
        const channel = await client.getInputEntity(groupId);
        console.log(`Removing ${userIds.length} members from group ${groupId}`);
        for (const userId of userIds) {
            try {
                const user = await client.getInputEntity(userId);
                await client.invoke(new telegram_1.Api.channels.EditBanned({
                    channel,
                    participant: user,
                    bannedRights: new telegram_1.Api.ChatBannedRights({
                        viewMessages: true,
                        untilDate: 0
                    })
                }));
                success.push(userId);
                console.log(`Removed user ${userId} from group`);
                if (userIds.length > 1) {
                    await (0, Helpers_1.sleep)(DEFAULT_CONFIG.delayBetweenOperations);
                }
            }
            catch (error) {
                const errorMessage = `Failed to remove user ${userId}: ${error.message}`;
                failed.push({ id: userId, error: errorMessage });
                console.warn(errorMessage);
            }
        }
        console.log(`Member removal completed. Success: ${success.length}, Failed: ${failed.length}`);
        return { success, failed };
    }
    catch (error) {
        console.error('Error removing members from group:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to remove members from group: ${errorDetails.message}`);
    }
}
async function promoteUserToAdmin(client, groupId, userId, adminRights, rank) {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userId, 'userId', 'string');
    try {
        const channel = await client.getInputEntity(groupId);
        const user = await client.getInputEntity(userId);
        const defaultRights = new telegram_1.Api.ChatAdminRights({
            changeInfo: adminRights?.changeInfo ?? true,
            postMessages: adminRights?.postMessages ?? true,
            editMessages: adminRights?.editMessages ?? true,
            deleteMessages: adminRights?.deleteMessages ?? true,
            banUsers: adminRights?.banUsers ?? true,
            inviteUsers: adminRights?.inviteUsers ?? true,
            pinMessages: adminRights?.pinMessages ?? true,
            addAdmins: adminRights?.addAdmins ?? false,
            anonymous: adminRights?.anonymous ?? false,
            manageCall: adminRights?.manageCall ?? false,
            other: adminRights?.other ?? false,
        });
        await client.invoke(new telegram_1.Api.channels.EditAdmin({
            channel,
            userId: user,
            adminRights: defaultRights,
            rank: rank || 'Admin'
        }));
        console.log(`User ${userId} promoted to admin successfully with rank: ${rank || 'Admin'}`);
    }
    catch (error) {
        console.error('Error promoting user to admin:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to promote user to admin: ${errorDetails.message}`);
    }
}
async function updateGroupInfo(client, groupId, options) {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(options, 'options', 'object');
    const results = { title: false, description: false, photo: false };
    try {
        const channel = await client.getInputEntity(groupId);
        if (options.title) {
            try {
                await client.invoke(new telegram_1.Api.channels.EditTitle({
                    channel,
                    title: options.title
                }));
                results.title = true;
                console.log('Group title updated successfully');
            }
            catch (titleError) {
                console.error('Failed to update title:', titleError);
            }
        }
        if (options.description !== undefined) {
            try {
                await client.invoke(new telegram_1.Api.messages.EditChatAbout({
                    peer: channel,
                    about: options.description
                }));
                results.description = true;
                console.log('Group description updated successfully');
            }
            catch (descriptionError) {
                console.warn('Failed to update description (API limitation):', descriptionError);
            }
        }
        if (options.photo) {
            try {
                console.log('Updating group photo...');
                const response = await fetch(options.photo);
                if (!response.ok) {
                    throw new Error(`Failed to fetch photo: ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                const bufferData = Buffer.from(buffer);
                const file = await client.uploadFile({
                    file: new uploads_1.CustomFile('photo.jpg', bufferData.length, 'photo.jpg', bufferData),
                    workers: 1
                });
                await client.invoke(new telegram_1.Api.channels.EditPhoto({
                    channel,
                    photo: new telegram_1.Api.InputChatUploadedPhoto({
                        file
                    })
                }));
                results.photo = true;
                console.log('Group photo updated successfully');
            }
            catch (photoError) {
                console.error('Failed to update photo:', photoError);
            }
        }
        console.log('Group info update completed:', results);
        return results;
    }
    catch (error) {
        console.error('Error updating group info:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to update group info: ${errorDetails.message}`);
    }
}
async function getChannelInfo(client, sendIds = false, options) {
    validateInput(client, 'client', 'object');
    const { limit = 1500, includeArchived = true } = options || {};
    const errors = [];
    try {
        console.log('Fetching channel information...');
        const chats = await client.getDialogs({
            limit: Math.min(limit, 1500),
            archived: includeArchived ? undefined : false
        });
        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        const channelArray = [];
        const canSendFalseChats = [];
        console.log(`Processing ${chats.length} dialogs out of ${chats.total} total chats`);
        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = chat.entity;
                    if (chatEntity instanceof telegram_1.Api.Channel || chatEntity instanceof telegram_1.Api.Chat) {
                        const id = chatEntity.id;
                        totalCount++;
                        const isBroadcast = chatEntity instanceof telegram_1.Api.Channel && chatEntity.broadcast;
                        const hasSendRestriction = chatEntity instanceof telegram_1.Api.Channel &&
                            chatEntity.defaultBannedRights?.sendMessages;
                        const cleanId = id.toString().replace(/^-100/, "");
                        if (!isBroadcast && !hasSendRestriction) {
                            canSendTrueCount++;
                            if (sendIds) {
                                channelArray.push(cleanId);
                            }
                        }
                        else {
                            canSendFalseCount++;
                            canSendFalseChats.push(cleanId);
                        }
                    }
                }
                catch (chatError) {
                    const errorMsg = `Error processing chat ${chat.title || 'Unknown'}: ${chatError.message}`;
                    errors.push(errorMsg);
                    console.warn(errorMsg);
                }
            }
        }
        const result = {
            chatsArrayLength: totalCount,
            canSendTrueCount,
            canSendFalseCount,
            ids: channelArray,
            canSendFalseChats,
            errors
        };
        console.log(`Channel analysis completed:`, {
            total: totalCount,
            canSend: canSendTrueCount,
            cannotSend: canSendFalseCount,
            errors: errors.length
        });
        return result;
    }
    catch (error) {
        console.error('Error getting channel info:', error);
        const errorDetails = (0, parseError_1.parseError)(error);
        throw new Error(`Failed to get channel info: ${errorDetails.message}`);
    }
}
//# sourceMappingURL=group-management.js.map