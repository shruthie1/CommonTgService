import { Api, TelegramClient } from 'telegram';
import { EntityLike } from 'telegram/define';
import bigInt from 'big-integer';
import { GroupOptions } from '../../../interfaces/telegram';
import { sleep } from 'telegram/Helpers';
import { parseError } from '../../../utils/parseError';
import { CustomFile } from 'telegram/client/uploads';

// Configuration interface for group creation
interface GroupCreationConfig {
    defaultGroupName: string;
    defaultFolderId: number;
    memberLimit: number;
    retryAttempts: number;
    delayBetweenOperations: number;
}

// Default configuration
const DEFAULT_CONFIG: GroupCreationConfig = {
    defaultGroupName: "Auto Created Group",
    defaultFolderId: 1,
    memberLimit: 200,
    retryAttempts: 3,
    delayBetweenOperations: 1000
};

// Input validation helper
function validateInput(value: any, name: string, type: 'string' | 'array' | 'object'): void {
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


/**
 * Create a new group with proper error handling and validation
 */
export async function createGroup(
    client: TelegramClient,
    phoneNumber: string,
    config?: Partial<GroupCreationConfig & { usersToAdd?: string[] }>
): Promise<{ id: bigInt.BigInteger; accessHash: bigInt.BigInteger }> {
    validateInput(client, 'client', 'object');
    validateInput(phoneNumber, 'phoneNumber', 'string');

    const groupConfig = { ...DEFAULT_CONFIG, ...config };
    const groupName = config?.defaultGroupName || `Group_${phoneNumber.slice(-4)}_${Date.now()}`;
    const groupDescription = `Created for ${phoneNumber}`;

    try {
        console.log("Creating group:", groupName);

        const result = await client.invoke(
            new Api.channels.CreateChannel({
                title: groupName,
                about: groupDescription,
                megagroup: true,
                forImport: true,
            })
        ) as Api.Updates;

        if (!result.chats || result.chats.length === 0) {
            throw new Error('Failed to create group: No chat returned');
        }

        const chat = result.chats[0] as Api.Channel;
        if (!chat.id || !chat.accessHash) {
            throw new Error('Invalid group creation response: Missing ID or access hash');
        }

        const { id, accessHash } = chat;
        console.log("Group created successfully with ID:", id.toString());

        // Archive the chat
        try {
            await archiveChat(client, id, accessHash);
        } catch (archiveError) {
            console.warn("Failed to archive chat, but group was created:", archiveError);
        }

        // Add users if provided
        if (config?.usersToAdd && config.usersToAdd.length > 0) {
            try {
                await addMembersToGroup(client, id.toString(), config.usersToAdd);
            } catch (addUsersError) {
                console.warn("Failed to add some users, but group was created:", addUsersError);
            }
        }

        return { id, accessHash };
    } catch (error) {
        console.error("Error creating group:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to create group: ${errorDetails.message}`);
    }
}

/**
 * Archive a chat/channel with proper error handling
 */
export async function archiveChat(
    client: TelegramClient,
    id: bigInt.BigInteger,
    accessHash: bigInt.BigInteger,
    folderId: number = DEFAULT_CONFIG.defaultFolderId
): Promise<void> {
    validateInput(client, 'client', 'object');
    validateInput(id, 'id', 'object');
    validateInput(accessHash, 'accessHash', 'object');

    try {
        console.log("Archiving chat", id.toString());

        await client.invoke(
            new Api.folders.EditPeerFolders({
                folderPeers: [
                    new Api.InputFolderPeer({
                        peer: new Api.InputPeerChannel({
                            channelId: id,
                            accessHash: accessHash,
                        }),
                        folderId: folderId,
                    }),
                ],
            })
        );

        console.log("Chat archived successfully");
    } catch (error) {
        console.error("Error archiving chat:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to archive chat: ${errorDetails.message}`);
    }
}

/**
 * Join a channel with proper error handling
 */
export async function joinChannel(client: TelegramClient, entity: EntityLike): Promise<Api.Updates> {
    validateInput(client, 'client', 'object');
    validateInput(entity, 'entity', 'string');

    try {
        console.log("Attempting to join channel:", entity);

        const channelEntity = await client.getEntity(entity);
        const result = await client.invoke(
            new Api.channels.JoinChannel({
                channel: channelEntity
            })
        );

        console.log("Successfully joined channel");
        return result as Api.Updates;
    } catch (error) {
        console.error("Error joining channel:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to join channel: ${errorDetails.message}`);
    }
}

/**
 * Get group/channel members with pagination support and proper error handling
 */
export async function getGroupMembers(
    client: TelegramClient,
    entity: EntityLike,
    options?: { limit?: number; offset?: number }
): Promise<Array<{ tgId: string; name: string; username: string }>> {
    validateInput(client, 'client', 'object');
    validateInput(entity, 'entity', 'string');

    const { limit = DEFAULT_CONFIG.memberLimit, offset = 0 } = options || {};

    try {
        const result: Array<{ tgId: string; name: string; username: string }> = [];

        // Fetch the group entity
        const chat = await client.getEntity(entity);

        if (!(chat instanceof Api.Chat || chat instanceof Api.Channel)) {
            throw new Error("Invalid group or channel entity");
        }

        console.log(`Fetching members of ${chat.title || (chat as Api.Channel).username}...`);

        // Fetch members with direct API call
        const participants = await client.invoke(
            new Api.channels.GetParticipants({
                channel: chat,
                filter: new Api.ChannelParticipantsRecent(),
                offset: offset,
                limit: Math.min(limit, 200), // Telegram API limit
                hash: bigInt(0),
            })
        );

        if (participants instanceof Api.channels.ChannelParticipants) {
            const users = participants.participants;
            console.log(`Found ${users.length} members`);

            for (const participant of users) {
                try {
                    const userId = participant instanceof Api.ChannelParticipant ? participant.userId : null;
                    if (userId) {
                        const userDetails = await client.getEntity(userId);
                        if (userDetails instanceof Api.User) {
                            result.push({
                                tgId: userDetails.id.toString(),
                                name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim(),
                                username: userDetails.username || "",
                            });

                            // Log deleted accounts for monitoring
                            if (userDetails.firstName === 'Deleted Account' && !userDetails.username) {
                                console.warn("Found deleted account:", userDetails.id.toString());
                            }
                        }
                    } else {
                        console.warn("Invalid participant data:", participant);
                    }
                } catch (userError) {
                    console.warn("Error processing user:", userError);
                    // Continue with other users instead of failing completely
                }
            }
        } else {
            console.warn("No members found or invalid group type");
        }

        console.log(`Successfully retrieved ${result.length} members`);
        return result;
    } catch (error) {
        console.error("Error fetching group members:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to fetch group members: ${errorDetails.message}`);
    }
}

/**
 * Add contacts one by one with proper error handling and validation
 */
export async function addContact(
    client: TelegramClient,
    data: { mobile: string, tgId: string }[],
    namePrefix: string
): Promise<{ success: number; failed: number; errors: string[] }> {
    validateInput(client, 'client', 'object');
    validateInput(data, 'data', 'array');
    validateInput(namePrefix, 'namePrefix', 'string');

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
        console.log(`Adding ${data.length} contacts individually...`);

        for (let i = 0; i < data.length; i++) {
            const user = data[i];
            const firstName = `${namePrefix}${i + 1}`;
            const lastName = "";

            // Validate user data
            if (!user.mobile || !user.tgId) {
                const error = `Invalid user data at index ${i}: missing mobile or tgId`;
                errors.push(error);
                failedCount++;
                continue;
            }

            try {
                await client.invoke(
                    new Api.contacts.AddContact({
                        firstName,
                        lastName,
                        phone: user.mobile,
                        id: user.tgId
                    })
                );

                successCount++;
                console.log(`Added contact ${i + 1}/${data.length}: ${firstName}`);

                // Add small delay to avoid rate limiting
                if (i < data.length - 1) {
                    await sleep(DEFAULT_CONFIG.delayBetweenOperations);
                }
            } catch (contactError) {
                const errorMsg = `Failed to add contact ${firstName}: ${(contactError as Error).message}`;
                errors.push(errorMsg);
                failedCount++;
                console.warn(errorMsg);
            }
        }

        console.log(`Contact addition completed. Success: ${successCount}, Failed: ${failedCount}`);
        return { success: successCount, failed: failedCount, errors };
    } catch (error) {
        console.error("Error in contact addition process:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to add contacts: ${errorDetails.message}`);
    }
}

/**
 * Add multiple contacts in batch with proper error handling and validation
 */
export async function addContacts(
    client: TelegramClient,
    mobiles: string[],
    namePrefix: string
): Promise<{ imported: number; retryContacts: string[]; failed: string[] }> {
    validateInput(client, 'client', 'object');
    validateInput(mobiles, 'mobiles', 'array');
    validateInput(namePrefix, 'namePrefix', 'string');

    try {
        console.log(`Importing ${mobiles.length} contacts in batch...`);
        const inputContacts: Api.TypeInputContact[] = [];
        const retryContacts: string[] = [];
        const failed: string[] = [];

        // Validate and prepare contacts
        for (let i = 0; i < mobiles.length; i++) {
            const mobile = mobiles[i];

            // Basic phone number validation
            if (!mobile || typeof mobile !== 'string' || mobile.length < 10) {
                failed.push(mobile || `Invalid mobile at index ${i}`);
                continue;
            }

            const firstName = `${namePrefix}${i + 1}`;
            const lastName = "";
            const clientId = bigInt((i << 16 | 0).toString(10));

            inputContacts.push(new Api.InputPhoneContact({
                clientId: clientId,
                phone: mobile.replace(/\D/g, ''), // Remove non-digits
                firstName: firstName,
                lastName: lastName
            }));
        }

        if (inputContacts.length === 0) {
            throw new Error('No valid contacts to import');
        }

        // Import contacts with retry logic
        const result = await client.invoke(
            new Api.contacts.ImportContacts({
                contacts: inputContacts,
            })
        ) as Api.contacts.ImportedContacts;

        const importedCount = result.imported?.length || 0;
        const retryContactsFromResult = result.retryContacts?.map(contact =>
            contact instanceof Api.InputPhoneContact ? contact.phone : String(contact)
        ) || [];

        console.log(`Contact import completed. Imported: ${importedCount}, Retry needed: ${retryContactsFromResult.length}, Failed: ${failed.length}`);

        return {
            imported: importedCount,
            retryContacts: retryContactsFromResult,
            failed: failed
        };
    } catch (error) {
        console.error("Error importing contacts:", error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to import contacts: ${errorDetails.message}`);
    }
}

/**
 * Leave multiple channels with proper error handling and continuation
 */
export async function leaveChannels(
    client: TelegramClient,
    phoneNumber: string,
    chats: string[]
): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    validateInput(client, 'client', 'object');
    validateInput(phoneNumber, 'phoneNumber', 'string');
    validateInput(chats, 'chats', 'array');

    console.log(`${phoneNumber} - Starting to leave ${chats.length} channels`);

    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < chats.length; i++) {
        const chatId = chats[i];

        try {
            const channelId = chatId.startsWith('-100') ? chatId : `-100${chatId}`;

            await client.invoke(
                new Api.channels.LeaveChannel({
                    channel: channelId
                })
            );

            success.push(chatId);
            console.log(`${phoneNumber} - Left channel ${i + 1}/${chats.length}: ${chatId}`);

            // Add delay between operations to avoid rate limiting
            if (i < chats.length - 1) {
                await sleep(DEFAULT_CONFIG.delayBetweenOperations);
            }
        } catch (error) {
            const errorDetails = parseError(error);
            const errorMessage = errorDetails.message;

            failed.push({ id: chatId, error: errorMessage });
            console.warn(`${phoneNumber} - Failed to leave channel ${chatId}: ${errorMessage}`);

            // Continue with other channels instead of breaking
            // Only break on critical errors that indicate client issues
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

/**
 * Create group with specific options and proper validation
 */
export async function createGroupWithOptions(client: TelegramClient, options: GroupOptions): Promise<Api.Chat | Api.Channel> {
    validateInput(client, 'client', 'object');
    validateInput(options, 'options', 'object');
    validateInput(options.title, 'options.title', 'string');

    try {
        const result = await createGroupOrChannel(client, options);

        if (!result.chats || result.chats.length === 0) {
            throw new Error('No chat returned from group creation');
        }

        const createdGroup = result.chats[0] as Api.Chat | Api.Channel;

        // Add members if specified
        if (options.members && options.members.length > 0) {
            try {
                const groupId = createdGroup.id.toString();
                await addMembersToGroup(client, groupId, options.members);
            } catch (memberError) {
                console.warn('Failed to add some members to the group:', memberError);
            }
        }

        return createdGroup;
    } catch (error) {
        console.error('Error creating group with options:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to create group: ${errorDetails.message}`);
    }
}

/**
 * Create group or channel based on options with proper error handling
 */
export async function createGroupOrChannel(client: TelegramClient, options: GroupOptions): Promise<Api.Updates> {
    validateInput(client, 'client', 'object');
    validateInput(options, 'options', 'object');
    validateInput(options.title, 'options.title', 'string');

    try {
        console.log('Creating group/channel:', options.title);

        // Create a supergroup (default behavior)
        const result = await client.invoke(
            new Api.channels.CreateChannel({
                title: options.title,
                about: options.about || '',
                megagroup: options.megagroup ?? true,
                broadcast: false,
                forImport: options.forImport ?? false,
            })
        );
        console.log('Group/channel created successfully:', options.title);
        return result as Api.Updates;
    } catch (error) {
        console.error('Error creating group/channel:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to create group/channel: ${errorDetails.message}`);
    }
}

/**
 * Add members to a group/channel with batch processing and error handling
 */
export async function addMembersToGroup(
    client: TelegramClient,
    groupId: string,
    userIds: string[]
): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userIds, 'userIds', 'array');

    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
        const channel = await client.getInputEntity(groupId);
        console.log(`Adding ${userIds.length} members to group ${groupId}`);

        // Process users in smaller batches to avoid API limits
        const batchSize = 50;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);

            try {
                const users = await Promise.all(
                    batch.map(async (id) => {
                        try {
                            return await client.getInputEntity(id);
                        } catch (error) {
                            failed.push({ id, error: `Failed to resolve user: ${(error as Error).message}` });
                            return null;
                        }
                    })
                );

                const validUsers = users.filter(user => user !== null);

                if (validUsers.length > 0) {
                    await client.invoke(
                        new Api.channels.InviteToChannel({
                            channel,
                            users: validUsers
                        })
                    );
                    // Track successful additions
                    const validUserIds = batch.filter((_, index) => users[index] !== null);
                    success.push(...validUserIds);
                }

                // Add delay between batches
                if (i + batchSize < userIds.length) {
                    await sleep(DEFAULT_CONFIG.delayBetweenOperations * 2);
                }
            } catch (batchError) {
                // If batch fails, mark all users in batch as failed
                batch.forEach(id => {
                    if (!failed.find(f => f.id === id)) {
                        failed.push({ id, error: `Batch processing failed: ${(batchError as Error).message}` });
                    }
                });
            }
        }

        console.log(`Member addition completed. Success: ${success.length}, Failed: ${failed.length}`);
        return { success, failed };
    } catch (error) {
        console.error('Error adding members to group:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to add members to group: ${errorDetails.message}`);
    }
}

/**
 * Remove members from a group/channel with proper error handling
 */
export async function removeMembersFromGroup(
    client: TelegramClient,
    groupId: string,
    userIds: string[]
): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userIds, 'userIds', 'array');

    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
        const channel = await client.getInputEntity(groupId);
        console.log(`Removing ${userIds.length} members from group ${groupId}`);

        for (const userId of userIds) {
            try {
                const user = await client.getInputEntity(userId);

                await client.invoke(
                    new Api.channels.EditBanned({
                        channel,
                        participant: user,
                        bannedRights: new Api.ChatBannedRights({
                            viewMessages: true,
                            untilDate: 0
                        })
                    })
                );

                success.push(userId);
                console.log(`Removed user ${userId} from group`);

                // Add delay to avoid rate limiting
                if (userIds.length > 1) {
                    await sleep(DEFAULT_CONFIG.delayBetweenOperations);
                }
            } catch (error) {
                const errorMessage = `Failed to remove user ${userId}: ${(error as Error).message}`;
                failed.push({ id: userId, error: errorMessage });
                console.warn(errorMessage);
            }
        }

        console.log(`Member removal completed. Success: ${success.length}, Failed: ${failed.length}`);
        return { success, failed };
    } catch (error) {
        console.error('Error removing members from group:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to remove members from group: ${errorDetails.message}`);
    }
}

/**
 * Promote user to admin with comprehensive admin rights configuration
 */
export async function promoteUserToAdmin(
    client: TelegramClient,
    groupId: string,
    userId: string,
    adminRights?: Partial<Api.ChatAdminRights>,
    rank?: string
): Promise<void> {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(userId, 'userId', 'string');

    try {
        const channel = await client.getInputEntity(groupId);
        const user = await client.getInputEntity(userId);

        const defaultRights = new Api.ChatAdminRights({
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

        await client.invoke(new Api.channels.EditAdmin({
            channel,
            userId: user,
            adminRights: defaultRights,
            rank: rank || 'Admin'
        }));

        console.log(`User ${userId} promoted to admin successfully with rank: ${rank || 'Admin'}`);
    } catch (error) {
        console.error('Error promoting user to admin:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to promote user to admin: ${errorDetails.message}`);
    }
}

/**
 * Update group/channel info with comprehensive options and proper error handling
 */
export async function updateGroupInfo(client: TelegramClient, groupId: string, options: {
    title?: string;
    description?: string;
    photo?: string;
}): Promise<{ title: boolean; description: boolean; photo: boolean }> {
    validateInput(client, 'client', 'object');
    validateInput(groupId, 'groupId', 'string');
    validateInput(options, 'options', 'object');

    const results = { title: false, description: false, photo: false };

    try {
        const channel = await client.getInputEntity(groupId);

        // Update title
        if (options.title) {
            try {
                await client.invoke(new Api.channels.EditTitle({
                    channel,
                    title: options.title!
                }));
                results.title = true;
                console.log('Group title updated successfully');
            } catch (titleError) {
                console.error('Failed to update title:', titleError);
            }
        }

        // Update description - Note: EditAbout may not be available in all API versions
        if (options.description !== undefined) {
            try {
                // Try using messages.EditChatAbout for regular groups
                await client.invoke(new Api.messages.EditChatAbout({
                    peer: channel,
                    about: options.description!
                }))
                results.description = true;
                console.log('Group description updated successfully');
            } catch (descriptionError) {
                console.warn('Failed to update description (API limitation):', descriptionError);
                // Description update is not critical, continue with other operations
            }
        }

        // Update photo
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
                    file: new CustomFile('photo.jpg', bufferData.length, 'photo.jpg', bufferData),
                    workers: 1
                });

                await client.invoke(new Api.channels.EditPhoto({
                    channel,
                    photo: new Api.InputChatUploadedPhoto({
                        file
                    })
                }));

                results.photo = true;
                console.log('Group photo updated successfully');
            } catch (photoError) {
                console.error('Failed to update photo:', photoError);
            }
        }

        console.log('Group info update completed:', results);
        return results;
    } catch (error) {
        console.error('Error updating group info:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to update group info: ${errorDetails.message}`);
    }
}

/**
 * Get channel information including permissions and statistics with pagination and proper error handling
 */
export async function getChannelInfo(
    client: TelegramClient,
    sendIds: boolean = false,
    options?: { limit?: number; includeArchived?: boolean }
): Promise<{
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
    errors: string[];
}> {
    validateInput(client, 'client', 'object');

    const { limit = 1500, includeArchived = true } = options || {};
    const errors: string[] = [];

    try {
        console.log('Fetching channel information...');

        const chats = await client.getDialogs({
            limit: Math.min(limit, 1500), // Respect API limits
            archived: includeArchived ? undefined : false
        });

        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        const channelArray: string[] = [];
        const canSendFalseChats: string[] = [];

        console.log(`Processing ${chats.length} dialogs out of ${chats.total} total chats`);

        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = chat.entity;

                    // Type guard to ensure we have the right type
                    if (chatEntity instanceof Api.Channel || chatEntity instanceof Api.Chat) {
                        const id = chatEntity.id;
                        totalCount++;

                        // Check if it's a broadcast channel or has send restrictions
                        const isBroadcast = chatEntity instanceof Api.Channel && chatEntity.broadcast;
                        const hasSendRestriction = chatEntity instanceof Api.Channel &&
                            chatEntity.defaultBannedRights?.sendMessages;

                        const cleanId = id.toString().replace(/^-100/, "");

                        if (!isBroadcast && !hasSendRestriction) {
                            canSendTrueCount++;
                            if (sendIds) {
                                channelArray.push(cleanId);
                            }
                        } else {
                            canSendFalseCount++;
                            canSendFalseChats.push(cleanId);
                        }
                    }
                } catch (chatError) {
                    const errorMsg = `Error processing chat ${chat.title || 'Unknown'}: ${(chatError as Error).message}`;
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
    } catch (error) {
        console.error('Error getting channel info:', error);
        const errorDetails = parseError(error);
        throw new Error(`Failed to get channel info: ${errorDetails.message}`);
    }
}