import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import { contains, sleep } from "../../utils";
import TelegramManager from "./TelegramManager";
import { BadRequestException, HttpException, Inject, Injectable, OnModuleDestroy, forwardRef } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary';
import { Api, TelegramClient } from 'telegram';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import * as path from 'path';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { EntityLike } from 'telegram/define';
import { parseError } from '../../utils/parseError';
import { TelegramError, TelegramErrorCode } from './types/telegram-error';
import { ChannelInfo } from './types/telegram-responses';
import { ConnectionManager } from './utils/connection-manager';
import { TelegramLogger } from './utils/telegram-logger';
import { DialogsQueryDto } from './dto/metadata-operations.dto';
import { ClientMetadataTracker } from './utils/client-metadata';
import { ClientMetadata } from './types/client-operations';
import { ChatStatistics, ContentFilter, GroupOptions, MessageScheduleOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';

@Injectable()
export class TelegramService implements OnModuleDestroy {
    private static clientsMap: Map<string, TelegramManager> = new Map();
    private readonly connectionManager: ConnectionManager;
    private readonly logger: TelegramLogger;
    private readonly metadataTracker: ClientMetadataTracker;
    private cleanupInterval: NodeJS.Timer;

    constructor(
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ChannelsService))
        private channelsService: ChannelsService,
    ) {
        this.connectionManager = ConnectionManager.getInstance();
        this.logger = TelegramLogger.getInstance();
        this.metadataTracker = ClientMetadataTracker.getInstance();
        this.cleanupInterval = this.connectionManager.startCleanupInterval();
    }

    async onModuleDestroy() {
        this.logger.logOperation('system', 'Module destroy initiated');
        clearInterval(this.cleanupInterval as NodeJS.Timeout);
        await this.disconnectAll();
    }
    public getActiveClientSetup() {
        return TelegramManager.getActiveClientSetup();
    }

    public setActiveClientSetup(data: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string } | undefined) {
        TelegramManager.setActiveClientSetup(data);
    }

    private async executeWithConnection<T>(mobile: string, operation: string, handler: (client: TelegramManager) => Promise<T>): Promise<T> {
        this.logger.logOperation(mobile, `Starting operation: ${operation}`);
        const client = await this.getClientOrThrow(mobile);
        this.connectionManager.updateLastUsed(mobile);

        try {
            const result = await this.connectionManager.executeWithRateLimit(mobile, () => handler(client));
            this.metadataTracker.recordOperation(mobile, operation, true);
            this.logger.logOperation(mobile, `Completed operation: ${operation}`);
            return result;
        } catch (error) {
            this.metadataTracker.recordOperation(mobile, operation, false);
            throw error;
        }
    }

    private async getClientOrThrow(mobile: string): Promise<TelegramManager> {
        const client = await this.getClient(mobile);
        if (!client) {
            throw new TelegramError('Client not found', TelegramErrorCode.CLIENT_NOT_FOUND);
        }
        return client;
    }

    public async getClient(mobile: string): Promise<TelegramManager | undefined> {
        const client = TelegramService.clientsMap.get(mobile);
        try {
            if (client && client.connected()) {
                await client.connect();
                return client;
            }
        } catch (error) {
            console.error('Client connection error:', parseError(error));
        }
        return undefined;
    }

    public hasClient(number: string) {
        return TelegramService.clientsMap.has(number);
    }

    async deleteClient(number: string) {
        await this.connectionManager.releaseConnection(number);
        return TelegramService.clientsMap.delete(number);
    }

    async disconnectAll() {
        this.logger.logOperation('system', 'Disconnecting all clients');
        const clients = Array.from(TelegramService.clientsMap.keys());
        await Promise.all(
            clients.map(mobile => {
                this.logger.logOperation(mobile, 'Disconnecting client');
                return this.connectionManager.releaseConnection(mobile);
            })
        );
        TelegramService.clientsMap.clear();
        this.bufferClientService.clearJoinChannelInterval();
        this.logger.logOperation('system', 'All clients disconnected');
    }

    async createClient(mobile: string, autoDisconnect = true, handler = true): Promise<TelegramManager> {
        this.logger.logOperation(mobile, 'Creating new client', { autoDisconnect, handler });
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        if (!this.hasClient(mobile)) {
            let telegramManager = new TelegramManager(user.session, user.mobile);
            let client: TelegramClient
            try {
                client = await telegramManager.createClient(handler);
                await client.getMe();
                if (client) {
                    TelegramService.clientsMap.set(mobile, telegramManager);
                    await this.connectionManager.acquireConnection(mobile, telegramManager);
                    this.metadataTracker.initializeClient(mobile);
                    this.logger.logOperation(mobile, 'Client created successfully');
                    if (autoDisconnect) {
                        this.logger.logOperation(mobile, 'Auto Disconnecting initiated');
                        setTimeout(async () => {
                            this.logger.logOperation(mobile, 'Auto-disconnecting client');
                            if (client.connected || await this.getClient(mobile)) {
                                console.log("SELF destroy client : ", mobile);
                                await telegramManager.disconnect();
                            } else {
                                console.log("Client Already Disconnected : ", mobile);
                            }
                            await this.connectionManager.releaseConnection(mobile);
                            TelegramService.clientsMap.delete(mobile);
                            this.metadataTracker.removeClient(mobile);
                        }, 180000)
                    } else {
                        setInterval(async () => {
                            //console.log("destroying loop :", mobile)
                            //client._destroyed = true
                            // if (!client.connected) {
                            // await client.connect();
                            //}
                        }, 20000);
                    }
                    return telegramManager;
                } else {
                    throw new BadRequestException('Client Expired');
                }
            } catch (error) {
                this.logger.logError(mobile, 'Client creation failed', error);
                console.log("Parsing Error");
                if (telegramManager) {
                    await this.connectionManager.releaseConnection(mobile);
                    telegramManager = null;
                    TelegramService.clientsMap.delete(mobile);
                    this.metadataTracker.removeClient(mobile);
                }
                const errorDetails = parseError(error);
                if (contains(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                    console.log("Deleting User: ", user.mobile);
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                } else {
                    console.log('Not Deleting user');
                }
                throw new BadRequestException(errorDetails.message)
            }
        } else {
            console.log("Client Already exists")
            return await this.getClient(mobile)
        }
    }

    async getMessages(mobile: string, username: string, limit: number = 8) {
        const telegramClient = await this.getClient(mobile)
        return telegramClient.getMessages(username, limit);
    }


    async getMessagesNew(mobile: string, username: string, offset: number, limit: number) {
        const telegramClient = await this.getClient(mobile)
        return telegramClient.getMessagesNew(username, offset, limit);
    }

    async sendInlineMessage(mobile: string, chatId: string, message: string, url: string) {
        const telegramClient = await this.getClient(mobile)
        return telegramClient.sendInlineMessage(chatId, message, url);
    }

    async getChatId(mobile: string, username: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.getchatId(username);
    }

    async getLastActiveTime(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.getLastActiveTime();
    }

    async tryJoiningChannel(mobile: string, chatEntity: Channel) {
        const telegramClient = await this.getClient(mobile)
        try {
            await telegramClient.joinChannel(chatEntity.username);
            console.log(telegramClient.phoneNumber, " - Joined channel Success - ", chatEntity.username);
            if (chatEntity.canSendMsgs) {
                // try {
                //     await this.activeChannelsService.update(chatEntity.channelId, chatEntity);
                //     console.log("updated ActiveChannels");
                // } catch (error) {
                //     console.log(parseError(error));
                //     console.log("Failed to update ActiveChannels");
                // }
            } else {
                await this.channelsService.remove(chatEntity.channelId);
                await this.activeChannelsService.remove(chatEntity.channelId);
                console.log("Removed Channel- ", chatEntity.username);
            }
        } catch (error) {
            console.log(telegramClient.phoneNumber, " - Failed to join - ", chatEntity.username);
            this.removeChannels(error, chatEntity.channelId, chatEntity.username);
            throw error
        }
    };

    async removeChannels(error: any, channelId: string, username: string) {
        if (error.errorMessage == "USERNAME_INVALID" || error.errorMessage == 'CHAT_INVALID' || error.errorMessage == 'USERS_TOO_MUCH' || error.toString().includes("No user has")) {
            try {
                if (channelId) {
                    await this.channelsService.remove(channelId)
                    await this.activeChannelsService.remove(channelId);
                    console.log("Removed Channel- ", channelId);
                } else {
                    const channelDetails = (await this.channelsService.search({ username: username }))[0];
                    await this.channelsService.remove(channelDetails.channelId)
                    await this.activeChannelsService.remove(channelDetails.channelId);
                    console.log("Removed Channel - ", channelDetails.channelId);
                }
            } catch (searchError) {
                console.log("Failed to search/remove channel: ", searchError);
            }
        } else if (error.errorMessage === "CHANNEL_PRIVATE") {
            await this.channelsService.update(channelId, { private: true })
            await this.activeChannelsService.update(channelId, { private: true });
        }
    }

    async getGrpMembers(mobile: string, entity: EntityLike) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.getGrpMembers(entity)
        } catch (err) {
            console.error("Error fetching group members:", err);
        }
    }

    async addContact(mobile: string, data: { mobile: string, tgId: string }[], prefix: string) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContact(data, prefix)
        } catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }


    async addContacts(mobile: string, phoneNumbers: string[], prefix: string) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix)
        } catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }

    async getSelfMsgsInfo(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.getSelfMSgsInfo();
    }

    async createGroup(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.createGroup();
    }

    async forwardSecrets(mobile: string, fromChatId: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.createGroupAndForward(fromChatId);
    }


    async joinChannelAndForward(mobile: string, fromChatId: string, channel: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.joinChannelAndForward(fromChatId, channel);
    }

    async blockUser(mobile: string, chatId: string) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.blockUser(chatId);
    }


    async joinChannel(mobile: string, channelId: string) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.joinChannel(channelId);
    }

    async getCallLog(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.getCallLog();
    }

    async getmedia(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.getMediaMessages();
    }

    async getChannelInfo(mobile: string, sendIds: boolean = false): Promise<ChannelInfo> {
        return this.executeWithConnection(mobile, 'Get channel info', async (client) => {
            return await client.channelInfo(sendIds);
        });
    }

    async getMe(mobile: string) {
        return this.executeWithConnection(mobile, 'Get profile info', async (client) => {
            return await client.getMe();
        });
    }

    async getEntity(mobile: string, entity: EntityLike) {
        return this.executeWithConnection(mobile, 'Get entity info', async (client) => {
            return await client.getEntity(entity); // Assuming 'getEntity()' is a valid method
        });
    }

    async createNewSession(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.createNewSession();
    }

    async set2Fa(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        try {
            await telegramClient.set2fa();
            await telegramClient.disconnect();
            return '2Fa set successfully'
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, errorDetails.status)
        }
    }

    async updatePrivacyforDeletedAccount(mobile: string) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount()
    }

    async deleteProfilePhotos(mobile: string) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.deleteProfilePhotos()
    }

    async setProfilePic(
        mobile: string, name: string,
    ) {
        const telegramClient = await this.getClient(mobile)
        await telegramClient.deleteProfilePhotos();
        try {
            await CloudinaryService.getInstance(name);
            await sleep(2000);
            const rootPath = process.cwd();
            console.log("checking path", rootPath)
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await sleep(1000);
            await telegramClient.disconnect();
            return 'Profile pic set successfully'
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, errorDetails.status)
        }
    }

    async updatePrivacy(
        mobile: string,
    ) {
        const telegramClient = await this.getClient(mobile)
        try {
            await telegramClient.updatePrivacy()
            return "Privacy updated successfully";
        } catch (error) {
            const errorDetails = parseError(error)
            throw new HttpException(errorDetails.message, errorDetails.status)
        }
    }

    async downloadProfilePic(
        mobile: string, index: number
    ) {
        const telegramClient = await this.getClient(mobile)
        try {
            return await telegramClient.downloadProfilePic(index)
        } catch (error) {
            console.log("Some Error: ", parseError(error), error);
            throw new Error("Failed to update username");
        }
    }

    async updateUsername(
        mobile: string, username: string,
    ) {
        const telegramClient = await this.getClient(mobile)
        try {
            return await telegramClient.updateUsername(username)
        } catch (error) {
            console.log("Some Error: ", parseError(error), error);
            throw new Error("Failed to update username");
        }
    }

    async getMediaMetadata(mobile: string, chatId?: string, offset?: number, limit: number = 100) {
        return this.executeWithConnection(mobile, 'Get media metadata', async (client) => {
            return await client.getMediaMetadata(chatId, offset, limit);
        });
    }

    async downloadMediaFile(mobile: string, messageId: number, chatId: string, res: any) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.downloadMediaFile(messageId, chatId, res)
    }

    async forwardMessage(mobile: string, toChatId: string, fromChatId: string, messageId: number) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.forwardMessage(toChatId, fromChatId, messageId);
    }

    async leaveChannels(mobile: string) {
        const telegramClient = await this.getClient(mobile)
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats
        return await telegramClient.leaveChannels(leaveChannelIds);
    }

    async leaveChannel(mobile: string, channel: string): Promise<void> {
        await this.executeWithConnection(mobile, 'Leave channel',
            (client) => client.leaveChannels([channel]),
        );
    }

    async deleteChat(mobile: string, chatId: string) {
        const telegramClient = await this.getClient(mobile)
        return await telegramClient.deleteChat(chatId);
    }
    async updateNameandBio(
        mobile: string,
        firstName: string,
        about?: string,
    ): Promise<void> {
        await this.executeWithConnection(mobile, 'Update profile',
            (client) => client.updateProfile(firstName, about),
        );
    }

    async getDialogs(mobile: string, query: DialogsQueryDto) {
        return this.executeWithConnection(mobile, 'Get dialogs', async (client) => {
            const { limit = 10, offsetId, archived = false } = query;
            const dialogs = await client.getDialogs({ limit, offsetId, archived });
            const chatData = [];
            for (const chat of dialogs) {
                const chatEntity = await chat.entity.toJSON();
                chatData.push(chatEntity);
            }
            return chatData;
        });
    }

    async getConnectionStatus(): Promise<{
        activeConnections: number;
        rateLimited: number;
        totalOperations: number;
    }> {
        const status = {
            activeConnections: this.connectionManager.getActiveConnectionCount(),
            rateLimited: 0,
            totalOperations: 0
        };

        this.logger.logOperation('system', 'Connection status retrieved', status);
        return status;
    }

    async forwardBulkMessages(
        mobile: string,
        fromChatId: string,
        toChatId: string,
        messageIds: number[]
    ): Promise<void> {
        await this.executeWithConnection(mobile, 'Forward bulk messages',
            (client) => client.forwardMessages(fromChatId, toChatId, messageIds),
        );
    }

    async getAuths(mobile: string): Promise<any[]> {
        return this.executeWithConnection(mobile, 'Get authorizations', async (client) => {
            const auths = await client.getAuths();
            this.logger.logOperation(mobile, 'Retrieved authorizations', {
                count: auths?.length || 0
            });
            return auths;
        });
    }

    async removeOtherAuths(mobile: string): Promise<void> {
        return this.executeWithConnection(mobile, 'Remove other authorizations', async (client) => {
            await client.removeOtherAuths();
            this.logger.logOperation(mobile, 'Removed other authorizations');
        });
    }

    async getClientMetadata(mobile: string): Promise<ClientMetadata | undefined> {
        return this.metadataTracker.getMetadata(mobile);
    }

    async getClientStatistics() {
        return this.metadataTracker.getStatistics();
    }

    private async handleReconnect(mobile: string): Promise<void> {
        this.metadataTracker.recordReconnect(mobile);
        this.logger.logWarning(mobile, 'Client reconnection triggered');
        // Additional reconnection logic if needed
    }

    // Helper method to handle batch operations with rate limiting
    public async processBatch<T>(
        items: T[],
        batchSize: number,
        processor: (batch: T[]) => Promise<void>,
        delayMs: number = 2000
    ): Promise<{ processed: number, errors: Error[] }> {
        const errors: Error[] = [];
        let processed = 0;

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                await processor(batch);
                processed += batch.length;
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } catch (error) {
                errors.push(error);
                this.logger.logError('batch-process', 'Batch processing failed', error);
            }
        }

        return { processed, errors };
    }

    // Enhanced Group Management
    async createGroupWithOptions(mobile: string, options: GroupOptions) {
        return this.executeWithConnection(mobile, 'Create group with options', async (client) => {
            const result = await client.createGroupWithOptions(options);
            this.logger.logOperation(mobile, 'Group created', { id: result.id?.toString() });
            return result;
        });
    }

    async updateGroupSettings(
        mobile: string,
        settings: {
            groupId: string;
            username?: string;
            title?: string;
            description?: string;
            slowMode?: number;
            memberRestrictions?: any;
        }
    ) {
        return this.executeWithConnection(mobile, 'Update group settings', (client) =>
            client.updateGroupSettings(settings)
        );
    }

    // Message Scheduling
    async scheduleMessage(mobile: string, options: MessageScheduleOptions): Promise<void> {
        await this.executeWithConnection(mobile, 'Schedule message',
            async (client) => {
                await client.scheduleMessageSend({
                    chatId: options.chatId,
                    message: options.message,
                    scheduledTime: options.scheduledTime,
                    replyTo: options.replyTo,
                    silent: options.silent
                });
            },
        );
    }

    async getScheduledMessages(mobile: string, chatId: string) {
        return this.executeWithConnection(mobile, 'Get scheduled messages', (client) =>
            client.getScheduledMessages(chatId)
        );
    }

    // Enhanced Media Operations
    async sendMediaAlbum(mobile: string, album: MediaAlbumOptions) {
        return this.executeWithConnection(mobile, 'Send media album', (client) =>
            client.sendMediaAlbum(album)
        );
    }

    async sendVoiceMessage(
        mobile: string,
        voice: {
            chatId: string;
            url: string;
            duration?: number;
            caption?: string;
        }
    ) {
        return this.executeWithConnection(mobile, 'Send voice message', (client) =>
            client.sendVoiceMessage(voice)
        );
    }

    // Advanced Chat Operations
    async cleanupChat(
        mobile: string,
        cleanup: {
            chatId: string;
            beforeDate?: Date;
            onlyMedia?: boolean;
            excludePinned?: boolean;
        }
    ) {
        return this.executeWithConnection(mobile, 'Clean up chat', (client) =>
            client.cleanupChat(cleanup)
        );
    }

    async getChatStatistics(mobile: string, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics> {
        return this.executeWithConnection(mobile, 'Get chat statistics',
            (client) => client.getChatStatistics(chatId, period),
        );
    }

    // Enhanced Privacy Features
    async updatePrivacyBatch(
        mobile: string,
        settings: {
            phoneNumber?: 'everybody' | 'contacts' | 'nobody';
            lastSeen?: 'everybody' | 'contacts' | 'nobody';
            profilePhotos?: 'everybody' | 'contacts' | 'nobody';
            forwards?: 'everybody' | 'contacts' | 'nobody';
            calls?: 'everybody' | 'contacts' | 'nobody';
            groups?: 'everybody' | 'contacts' | 'nobody';
        }
    ) {
        return this.executeWithConnection(mobile, 'Update privacy settings batch', (client) =>
            client.updatePrivacyBatch(settings)
        );
    }
    // Content Filtering
    async setContentFilters(
        mobile: string,
        filters: ContentFilter
    ) {
        return this.executeWithConnection(mobile, 'Set content filters', (client) =>
            client.setContentFilters(filters)
        );
    }

    // Helper method for batch operations with progress tracking
    private async processBatchWithProgress<T>(
        items: T[],
        operation: (item: T) => Promise<void>,
        batchSize: number = 10,
        delayMs: number = 2000
    ): Promise<{ completed: number; total: number; errors: Error[] }> {
        const result = {
            completed: 0,
            total: items.length,
            errors: [] as Error[]
        };

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async (item) => {
                    try {
                        await operation(item);
                        result.completed++;
                    } catch (error) {
                        result.errors.push(error);
                    }
                })
            );

            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return result;
    }

    // Group Member Management
    async addGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void> {
        await this.executeWithConnection(mobile, 'Add group members',
            (client) => client.addGroupMembers(groupId, members),
        );
    }

    async removeGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void> {
        await this.executeWithConnection(mobile, 'Remove group members',
            (client) => client.removeGroupMembers(groupId, members),
        );
    }

    async promoteToAdmin(
        mobile: string,
        groupId: string,
        userId: string,
        permissions?: {
            changeInfo?: boolean;
            postMessages?: boolean;
            editMessages?: boolean;
            deleteMessages?: boolean;
            banUsers?: boolean;
            inviteUsers?: boolean;
            pinMessages?: boolean;
            addAdmins?: boolean;
            anonymous?: boolean;
            manageCall?: boolean;
        },
        rank?: string
    ): Promise<void> {
        await this.executeWithConnection(mobile, 'Promote to admin',
            (client) => client.promoteToAdmin(groupId, userId, permissions, rank)
        );
    }

    async demoteAdmin(mobile: string, groupId: string, userId: string): Promise<void> {
        return this.executeWithConnection(mobile, 'Demote admin', async (client) => {
            await client.demoteAdmin(groupId, userId);
            this.logger.logOperation(mobile, 'Demoted admin to regular member', { groupId, userId });
        });
    }

    async unblockGroupUser(mobile: string, groupId: string, userId: string): Promise<void> {
        return this.executeWithConnection(mobile, 'Unblock group user', async (client) => {
            await client.unblockGroupUser(groupId, userId);
            this.logger.logOperation(mobile, 'Unblocked user in group', { groupId, userId });
        });
    }

    async getGroupAdmins(mobile: string, groupId: string) {
        return this.executeWithConnection(mobile, 'Get group admins', (client) =>
            client.getGroupAdmins(groupId)
        );
    }

    async getGroupBannedUsers(mobile: string, groupId: string) {
        return this.executeWithConnection(mobile, 'Get group banned users', (client) =>
            client.getGroupBannedUsers(groupId)
        );
    }

    async searchMessages(
        mobile: string,
        params: {
            chatId: string;
            query?: string;
            types?: ('all' | 'text' | 'photo' | 'video' | 'voice' | 'document')[];
            offset?: number;
            limit?: number;
        }
    ) {
        return this.executeWithConnection(mobile, 'Search messages', (client) =>
            client.searchMessages(params)
        );
    }

    async getFilteredMedia(
        mobile: string,
        params: {
            chatId: string;
            types?: ('photo' | 'video' | 'document' | 'voice')[];
            startDate?: Date;
            endDate?: Date;
            offset?: number;
            limit?: number;            
            maxId?: number;
            minId?: number;
        }
    ) {
        return this.executeWithConnection(mobile, 'Get filtered media', (client) =>
            client.getFilteredMedia(params)
        );
    }

    // Contact Management
    async exportContacts(
        mobile: string,
        format: 'vcard' | 'csv',
        includeBlocked: boolean = false
    ) {
        return this.executeWithConnection(mobile, 'Export contacts', (client) =>
            client.exportContacts(format, includeBlocked)
        );
    }

    async importContacts(
        mobile: string,
        contacts: { firstName: string; lastName?: string; phone: string }[]
    ) {
        return this.executeWithConnection(mobile, 'Import contacts', (client) =>
            client.importContacts(contacts)
        );
    }

    async manageBlockList(
        mobile: string,
        userIds: string[],
        block: boolean
    ) {
        return this.executeWithConnection(mobile, block ? 'Block users' : 'Unblock users', (client) =>
            client.manageBlockList(userIds, block)
        );
    }

    async getContactStatistics(mobile: string) {
        return this.executeWithConnection(mobile, 'Get contact statistics', (client) =>
            client.getContactStatistics()
        );
    }

    // Chat Folder Management
    async createChatFolder(
        mobile: string,
        options: {
            name: string;
            includedChats: string[];
            excludedChats?: string[];
            includeContacts?: boolean;
            includeNonContacts?: boolean;
            includeGroups?: boolean;
            includeBroadcasts?: boolean;
            includeBots?: boolean;
            excludeMuted?: boolean;
            excludeRead?: boolean;
            excludeArchived?: boolean;
        }
    ) {
        return this.executeWithConnection(mobile, 'Create chat folder', (client) =>
            client.createChatFolder(options)
        );
    }

    async getChatFolders(mobile: string) {
        return this.executeWithConnection(mobile, 'Get chat folders', (client) =>
            client.getChatFolders()
        );
    }

    // Session Management
    async getSessionInfo(mobile: string) {
        return this.executeWithConnection(mobile, 'Get session info', (client) =>
            client.getSessionInfo()
        );
    }

    async terminateSession(
        mobile: string, 
        options: {
            hash: string;
            type: 'app' | 'web';
            exceptCurrent?: boolean;
        }
    ) {
        return this.executeWithConnection(mobile, 'Terminate session', (client) =>
            client.terminateSession(options)
        );
    }

    // Message Management
    async editMessage(
        mobile: string,
        options: {
            chatId: string;
            messageId: number;
            text?: string;
            media?: {
                type: 'photo' | 'video' | 'document';
                url: string;
            };
        }
    ) {
        return this.executeWithConnection(mobile, 'Edit message', (client) =>
            client.editMessage(options)
        );
    }

    // Chat Management
    async updateChatSettings(
        mobile: string,
        settings: {
            chatId: string;
            username?: string;
            title?: string;
            about?: string;
            photo?: string;
            slowMode?: number;
            linkedChat?: string;
            defaultSendAs?: string;
        }
    ) {

        if (!settings.chatId) {
            throw new Error('chatId is required');
        }

        return this.executeWithConnection(mobile, 'Update chat settings', (client) =>
            client.updateChatSettings(settings)
        );
    }

    // Media Handling
    async sendMediaBatch(
        mobile: string,
        options: {
            chatId: string;
            media: Array<{
                type: 'photo' | 'video' | 'document';
                url: string;
                caption?: string;
                fileName?: string;
            }>;
            silent?: boolean;
            scheduleDate?: number;
        }
    ) {
        return this.executeWithConnection(mobile, 'Send media batch', (client) =>
            client.sendMediaBatch(options)
        );
    }

    // Password Management
    async hasPassword(mobile: string): Promise<boolean> {
        return this.executeWithConnection(mobile, 'Check password status', (client) =>
            client.hasPassword()
        );
    }

    // Contact Management
    async getContacts(mobile: string) {
        return this.executeWithConnection(mobile, 'Get contacts list', (client) =>
            client.getContacts()
        );
    }

    // Extended Chat Functions
    async getChats(
        mobile: string,
        options: {
            limit?: number;
            offsetDate?: number;
            offsetId?: number;
            offsetPeer?: string;
            folderId?: number;
        }
    ) {
        return this.executeWithConnection(mobile, 'Get chats', (client) =>
            client.getChats(options)
        );
    }

    // File Operations
    async getFileUrl(mobile: string, url: string, filename: string): Promise<string> {
        return this.executeWithConnection(mobile, 'Get file URL', (client) =>
            client.getFileUrl(url, filename)
        );
    }

    // Message Stats
    async getMessageStats(
        mobile: string,
        options: {
            chatId: string;
            period: 'day' | 'week' | 'month';
            fromDate?: Date;
        }
    ) {
        return this.executeWithConnection(mobile, 'Get message statistics', (client) =>
            client.getMessageStats(options)
        );
    }

    // Chat Analytics
    async getTopPrivateChats(mobile: string): Promise<{
        chatId: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        totalMessages: number;
        interactionScore: number;
        calls: {
            total: number;
            incoming: {
                total: number;
                audio: number;
                video: number;
            };
            outgoing: {
                total: number;
                audio: number;
                video: number;
            };
        };
        media: {
            photos: number;
            videos: number;
        };
        activityBreakdown: {
            videoCalls: number;
            audioCalls: number;
            mediaSharing: number;
            textMessages: number;
        };
    }[]> {
        return this.executeWithConnection(mobile, 'Get top private chats', async (client) => {
            return client.getTopPrivateChats();
        });
    }
}
