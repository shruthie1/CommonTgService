import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { TotalList } from 'telegram/Helpers';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import bigInt from 'big-integer';

/**
 * Create and initialize a Telegram client
 */
export async function createClient(
    sessionString: string, 
    apiId: number, 
    apiHash: string,
    handler = true, 
    handlerFn?: (event: NewMessageEvent) => Promise<void>
): Promise<TelegramClient> {
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, {
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
        client.addEventHandler(handlerFn, new NewMessage({}));
        console.log('Event handler added');
    }

    return client;
}

/**
 * Destroy/disconnect the client
 */
export async function destroy(client: TelegramClient): Promise<void> {
    try {
        if (client.connected) {
            await client.disconnect();
            console.log('Client disconnected successfully');
        }
    } catch (error) {
        console.error('Error during client destruction:', error);
        throw error;
    }
}

/**
 * Get chat ID from username
 */
export async function getChatId(client: TelegramClient, username: string): Promise<any> {
    const entity = await client.getEntity(username);
    return entity;
}

/**
 * Get current user information
 */
export async function getMe(client: TelegramClient): Promise<Api.User> {
    const me = await client.getMe();
    return me;
}

/**
 * Handle errors
 */
export async function errorHandler(client: TelegramClient, error: any): Promise<void> {
    console.error('Telegram client error:', error);
    
    if (error.code === 420) {
        // Flood wait
        const seconds = error.seconds || 60;
        console.log(`Flood wait: waiting ${seconds} seconds`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    } else if (error.code === 401) {
        // Unauthorized
        console.error('Client unauthorized, session might be invalid');
        throw error;
    } else {
        throw error;
    }
}

/**
 * Get group members
 */
export async function getGrpMembers(client: TelegramClient, entity: EntityLike): Promise<{
    totalCount: number;
    members: Array<{
        id: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        isBot: boolean;
        isAdmin: boolean;
    }>;
}> {
    try {
        const result = await client.invoke(new Api.channels.GetParticipants({
            channel: entity,
            filter: new Api.ChannelParticipantsRecent(),
            offset: 0,
            limit: 200,
            hash: bigInt(0)
        }));

        if ('users' in result) {
            const members = result.users.map((user: Api.User) => ({
                id: user.id.toString(),
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                isBot: user.bot || false,
                isAdmin: false // Would need additional logic to determine admin status
            }));

            return {
                totalCount: result.count,
                members
            };
        }

        return { totalCount: 0, members: [] };
    } catch (error) {
        console.error('Error getting group members:', error);
        throw error;
    }
}

/**
 * Get messages from a chat
 */
export async function getMessages(client: TelegramClient, entityLike: Api.TypeEntityLike, limit: number = 8): Promise<TotalList<Api.Message>> {
    return await client.getMessages(entityLike, { limit });
}

/**
 * Get dialogs (chats list)
 */
export async function getDialogs(client: TelegramClient, params: IterDialogsParams): Promise<any> {
    return await client.getDialogs(params);
}


/**
 * Get channel information
 */
export async function channelInfo(client: TelegramClient, sendIds = false): Promise<{ 
    chatsArrayLength: number; 
    canSendTrueCount: number; 
    canSendFalseCount: number; 
    ids: string[], 
    canSendFalseChats: string[] 
}> {
    const chats = await client.getDialogs({ limit: 100 });
    
    let canSendTrueCount = 0;
    let canSendFalseCount = 0;
    const ids: string[] = [];
    const canSendFalseChats: string[] = [];

    for (const chat of chats) {
        if (chat.entity instanceof Api.Channel) {
            const channel = chat.entity;
            ids.push(channel.id.toString());
            
            if (channel.broadcast || channel.megagroup) {
                if (channel.defaultBannedRights?.sendMessages) {
                    canSendFalseCount++;
                    canSendFalseChats.push(channel.title || channel.id.toString());
                } else {
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

/**
 * Leave channels
 */
export async function leaveChannels(client: TelegramClient, chats: string[]): Promise<void> {
    for (const chat of chats) {
        try {
            const entity = await client.getEntity(chat);
            await client.invoke(new Api.channels.LeaveChannel({
                channel: entity
            }));
            console.log(`Left channel: ${chat}`);
        } catch (error) {
            console.error(`Failed to leave channel ${chat}:`, error);
        }
    }
}

/**
 * Get entity safely
 */
export async function getEntity(client: TelegramClient, entity: Api.TypeEntityLike): Promise<any> {
    try {
        return await client.getEntity(entity);
    } catch (error) {
        console.error('Error getting entity:', error);
        throw error;
    }
}

/**
 * Safe get entity with fallback
 */
export async function safeGetEntity(client: TelegramClient, entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null> {
    try {
        return await client.getEntity(entityId);
    } catch (error) {
        console.log(`Failed to get entity directly for ${entityId}, searching in dialogs...`);

        try {
            const dialogs = await client.getDialogs({ limit: 100 });
            const dialog = dialogs.find(d => 
                d.entity.id.toString() === entityId || 
                ('username' in d.entity && d.entity.username === entityId)
            );
            
            if (dialog) {
                return dialog.entity;
            }
            
            return null;
        } catch (dialogError) {
            return null;
        }
    }
}

/**
 * Create or join a channel
 */
export async function createOrJoinChannel(client: TelegramClient, channel: string): Promise<void> {
    try {
        console.log(`Trying to join channel: ${channel}`);
        const entity = await client.getEntity(channel);
        
        if (entity instanceof Api.Channel) {
            await client.invoke(new Api.channels.JoinChannel({
                channel: entity
            }));
            console.log(`Joined channel: ${channel}`);
        }
    } catch (error) {
        console.error(`Error joining channel ${channel}:`, error);
        throw error;
    }
}

/**
 * Get all chats with pagination
 */
export async function getChats(client: TelegramClient, options: {
    limit?: number;
    offsetDate?: number;
    offsetId?: number;
    offsetPeer?: string;
    folderId?: number;
}): Promise<Array<{
    id: string;
    title: string | null;
    username: string | null;
    type: 'user' | 'group' | 'channel' | 'unknown';
    unreadCount: number;
    lastMessage: {
        id: number;
        text: string;
        date: Date;
    } | null;
}>> {
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
            type: entity instanceof Api.User ? 'user' :
                entity instanceof Api.Chat ? 'group' :
                    entity instanceof Api.Channel ? 'channel' : 'unknown',
            unreadCount: dialog.unreadCount,
            lastMessage: dialog.message ? {
                id: dialog.message.id,
                text: dialog.message.message,
                date: new Date(dialog.message.date * 1000)
            } : null
        };
    }));
}
