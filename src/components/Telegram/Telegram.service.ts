import { UsersService } from '../users/users.service';
import TelegramManager from "./TelegramManager";
import { BadRequestException, HttpException, Inject, Injectable, OnModuleDestroy, forwardRef } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import * as path from 'path';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { EntityLike } from 'telegram/define';
import { parseError } from '../../utils/parseError';
import { ChannelInfo } from './types/telegram-responses';
import { connectionManager } from './utils/connection-manager';
import { TelegramLogger } from './utils/telegram-logger';
import { DialogsQueryDto } from './dto/metadata-operations.dto';
import { ChatStatistics, ContentFilter, GroupOptions, MessageScheduleOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
import * as fs from 'fs';
import { sleep } from 'telegram/Helpers';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { SearchMessagesDto } from './dto/message-search.dto';
import { CreateTgBotDto } from './dto/create-bot.dto';
import { Api } from 'telegram';
import { fetchNumbersFromString, shouldMatch } from '../../utils';
import { ConnectionStatusDto, GetClientOptionsDto } from './dto/connection-management.dto';
import { ActiveChannel } from '../active-channels';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import isPermanentError from '../../utils/isPermanentError';
import { SendTgMessageDto } from './dto/send-message.dto';

@Injectable()
export class TelegramService implements OnModuleDestroy {
    private readonly logger: TelegramLogger;

    constructor(
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ChannelsService))
        private channelsService: ChannelsService,
    ) {
        this.logger = new TelegramLogger('TgService');
        connectionManager.setUsersService(this.usersService);
    }

    async onModuleDestroy() {
        this.logger.info('system', 'Module destroy initiated');
    }
    public getActiveClientSetup() {
        return TelegramManager.getActiveClientSetup();
    }

    public setActiveClientSetup(data: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string } | undefined) {
        TelegramManager.setActiveClientSetup(data);
    }

    async getMessages(mobile: string, username: string, limit: number = 8) {
        const telegramClient = await connectionManager.getClient(mobile)
        return telegramClient.getMessages(username, limit);
    }


    async getMessagesNew(mobile: string, username: string, offset: number, limit: number) {
        const telegramClient = await connectionManager.getClient(mobile)
        return telegramClient.getMessagesNew(username, offset, limit);
    }

    async sendInlineMessage(mobile: string, chatId: string, message: string, url: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return telegramClient.sendInlineMessage(chatId, message, url);
    }

    async getChatId(mobile: string, username: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.getchatId(username);
    }

    async getLastActiveTime(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.getLastActiveTime();
    }

    async tryJoiningChannel(mobile: string, chatEntity: Channel | ActiveChannel) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            await telegramClient.joinChannel(chatEntity.username);
            this.logger.debug(telegramClient.phoneNumber, `Joined channel Success: `, `@${chatEntity.username}`);
            if (chatEntity.canSendMsgs) {
                // try {
                //     await this.activeChannelsService.update(chatEntity.channelId, chatEntity);
                //     this.logger.debug(mobile, "updated ActiveChannels");
                // } catch (error) {
                //     this.logger.debug(parseError(error));
                //     this.logger.debug(mobile, "Failed to update ActiveChannels");
                // }
            } else {
                // await this.channelsService.remove(chatEntity.channelId);
                // await this.activeChannelsService.remove(chatEntity.channelId);
                // this.logger.debug(mobile, `Removed Channel: `, `@${chatEntity.username}`);
            }
        } catch (error) {
            this.logger.debug(telegramClient.phoneNumber, `Failed to join: `, `@${chatEntity.username}`);

            //To check if Account is Frozen
            if (error.toString().includes("No user has")) {
                await telegramClient.client.invoke(
                    new Api.account.SetPrivacy({
                        key: new Api.InputPrivacyKeyPhoneCall(),
                        rules: [
                            new Api.InputPrivacyValueDisallowAll()
                        ],
                    })
                );
            }

            await this.removeChannels(error, chatEntity.channelId, chatEntity.username, mobile);
            throw error
        }
    };

    async removeChannels(error: any, channelId: string, username: string, mobile: string) {
        if (error.errorMessage == "USERNAME_INVALID" || error.errorMessage == 'CHAT_INVALID' || error.errorMessage == 'USERS_TOO_MUCH' || error.toString().includes("No user has")) {
            // try {
            //     if (channelId) {
            //         await this.channelsService.remove(channelId)
            //         await this.activeChannelsService.remove(channelId);
            //         this.logger.debug(mobile, `Removed Channel:  [${channelId}]`);
            //     } else {
            //         const channelDetails = (await this.channelsService.search({ username: username }))[0];
            //         await this.channelsService.remove(channelDetails.channelId)
            //         await this.activeChannelsService.remove(channelDetails.channelId);
            //         this.logger.debug(mobile, `Removed Channel: [${channelDetails.channelId}]`);
            //     }
            // } catch (searchError) {
            //     this.logger.debug(mobile, "Failed to search/remove channel: ", searchError);
            // }

        } else if (error.errorMessage === "CHANNEL_PRIVATE") {
            await this.channelsService.update(channelId, { private: true })
            await this.activeChannelsService.update(channelId, { private: true });
        }
    }

    async getGrpMembers(mobile: string, entity: EntityLike) {
        try {
            const telegramClient = await connectionManager.getClient(mobile);
            return await telegramClient.getGrpMembers(entity)
        } catch (err) {
            this.logger.error(mobile, "Error fetching group members:", err);
        }
    }

    async addContact(mobile: string, data: { mobile: string, tgId: string }[], prefix: string) {
        try {
            const telegramClient = await connectionManager.getClient(mobile);
            return await telegramClient.addContact(data, prefix)
        } catch (err) {
            this.logger.error(mobile, "Error fetching adding Contacts:", err);
        }
    }


    async addContacts(mobile: string, phoneNumbers: string[], prefix: string) {
        try {
            const telegramClient = await connectionManager.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix)
        } catch (err) {
            this.logger.error(mobile, "Error fetching adding Contacts:", err);
        }
    }

    async getSelfMsgsInfo(mobile: string, limit?: number) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            return await telegramClient.getSelfMSgsInfo(limit);
        } catch (error) {
            this.logger.error(mobile, 'Error getting self messages info:', error);
            throw error;
        }
    }

    async createGroup(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.createGroup();
    }

    async forwardMedia(mobile: string, channel: string, fromChatId: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        telegramClient.forwardMedia(channel, fromChatId);
        setTimeout(async () => {
            try {
                await this.leaveChannel(mobile, "2302868706");
            } catch (error) {
                this.logger.debug(mobile, "Error in forwardMedia: ", error);
            }
        }, 5 * 60000);
        return "Media forward initiated";
    }

    async forwardMediaToBot(mobile: string, fromChatId: string): Promise<string> {
        try {
            const telegramClient = await connectionManager.getClient(mobile);
            await telegramClient.forwardMediaToBot(fromChatId);
            const dialogs: any[] = [];
            // Use iterDialogs for memory-efficient iteration
            for await (const dialog of telegramClient.client.iterDialogs({ limit: 500 })) {
                dialogs.push(dialog);
            }
            
            const channels = dialogs
                .filter(chat => chat.isChannel || chat.isGroup)
                .map(chat => {
                    const chatEntity = chat.entity as Api.Channel;
                    const cannotSendMsgs = chatEntity.defaultBannedRights?.sendMessages;

                    if (!chatEntity.broadcast &&
                        !cannotSendMsgs &&
                        chatEntity.participantsCount > 50 &&
                        shouldMatch(chatEntity)) {

                        return {
                            channelId: chatEntity.id.toString(),
                            canSendMsgs: true,
                            participantsCount: chatEntity.participantsCount,
                            private: false,
                            title: chatEntity.title,
                            broadcast: chatEntity.broadcast,
                            megagroup: chatEntity.megagroup,
                            restricted: chatEntity.restricted,
                            sendMessages: true,
                            username: chatEntity.username,
                            forbidden: false
                        };
                    }
                    return null;
                })
                .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel));

            await connectionManager.unregisterClient(mobile);
            await this.channelsService.createMultiple(channels);
            await this.activeChannelsService.createMultiple(channels);
            return "Media forward initiated successfully";
        } catch (error) {
            this.logger.error(mobile, "Error forwarding media:", error);
            return `Media forward failed: ${error.message}`;
        }
    }

    async blockUser(mobile: string, chatId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.blockUser(chatId);
    }


    async joinChannel(mobile: string, channelId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.joinChannel(channelId);
    }

    async getCallLog(mobile: string, limit?: number) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            return await telegramClient.getCallLog(limit);
        } catch (error) {
            this.logger.error(mobile, 'Error getting call log:', error);
            throw error;
        }
    }

    async getmedia(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.getMediaMessages();
    }

    async getChannelInfo(mobile: string, sendIds: boolean = false): Promise<ChannelInfo> {
        const telegramClient = await connectionManager.getClient(mobile)
        const channels = await channelInfo(telegramClient.client, sendIds);
        return channels
    }

    async getMe(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.getMe();
    }

    async getEntity(mobile: string, entity: EntityLike) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.getEntity(entity); // Assuming 'getEntity()' is a valid method
    }

    async createNewSession(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.createNewSession();
    }

    async set2Fa(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            await telegramClient.set2fa();
            return '2Fa set successfully'
        } catch (error) {
            const errorDetails = parseError(error, `Faile to Set 2FA: ${mobile}`)
            throw new HttpException(errorDetails.message, errorDetails.status)
        }
    }

    async updatePrivacyforDeletedAccount(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount()
    }

    async deleteProfilePhotos(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        await telegramClient.deleteProfilePhotos()
    }

    async setProfilePic(
        mobile: string, name: string,
    ) {
        const telegramClient = await connectionManager.getClient(mobile)
        await telegramClient.deleteProfilePhotos();
        try {
            await CloudinaryService.getInstance(name);
            await sleep(2000);
            const rootPath = process.cwd();
            this.logger.debug(mobile, "checking path", rootPath)
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await sleep(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await sleep(1000);
            return 'Profile pic set successfully'
        } catch (error) {
            const errorDetails = parseError(error, `Failed to Set Profile Pics: ${mobile}`)
            throw new HttpException(errorDetails.message, errorDetails.status)
        } finally {
            await connectionManager.unregisterClient(mobile);
        }
    }

    async updatePrivacy(
        mobile: string,
    ) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            await telegramClient.updatePrivacy()
            return "Privacy updated successfully";
        } catch (error) {
            const errorDetails = parseError(error, `Failed to Update Privacy`)
            throw new HttpException(errorDetails.message, errorDetails.status)
        }
    }

    async downloadProfilePic(
        mobile: string, index: number
    ) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            return await telegramClient.downloadProfilePic(index)
        } catch (error) {
            const errorDetails = parseError(error, `Error Downloading Profile Picture:`)
            this.logger.error(mobile, errorDetails.message, error);
            throw new Error("Failed to update username");
        }
    }

    async updateUsername(
        mobile: string, username: string,
    ) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            return await telegramClient.updateUsername(username)
        } catch (error) {
            const errorDetails = parseError(error, `Error Updating Username:`)
            this.logger.error(mobile, errorDetails.message, error);
            throw new Error("Failed to update username");
        }
    }

    async updateUsernameForAClient(mobile: string, clientId: string, clientName: string, currentUsername: string,) {
        const telegramClient = await connectionManager.getClient(mobile)
        const [firstName, middleName = ''] = clientName.split(' ');
        const firstPart = firstName.slice(0, 4);
        const middlePart = middleName.slice(0, 3);

        // Build regex dynamically
        const pattern = `^${firstPart}${middlePart}\\d+$`;
        const usernameRegex = new RegExp(pattern, 'i');
        if (!usernameRegex.test(currentUsername)) {
            const firstNameCaps = firstPart[0].toUpperCase() + firstPart.slice(1);
            const middleNameCaps = middlePart ? middlePart[0].toUpperCase() + middlePart.slice(1) : '';
            const baseUsername = `${firstNameCaps.slice(0, 4)}${middleNameCaps.slice(0, 3)}` + fetchNumbersFromString(clientId) + Math.floor(Math.random() * 1000);
            return await telegramClient.updateUsername(baseUsername);
        }
        this.logger.log(mobile, "Username is already matching required regex, Skipping Username update");
        return currentUsername;
    }

    async getMediaMetadata(mobile: string,
        params: {
            chatId: string;
            types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
            startDate?: Date;
            endDate?: Date;
            limit?: number;
            maxId?: number;
            minId?: number;
        }) {
        const telegramClient = await connectionManager.getClient(mobile)
        try {
            return await telegramClient.getMediaMetadata(params);
        } catch (error) {
            this.logger.error(mobile, 'Error getting media metadata:', error);
            throw error;
        }
    }

    async getMediaFileDownloadInfo(mobile: string, messageId: number, chatId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            this.logger.info(mobile, 'Get media file download info', { messageId, chatId });
            return await telegramClient.getMediaFileDownloadInfo(messageId, chatId);
        } catch (error) {
            this.logger.error(mobile, 'Error getting media file download info:', error);
            throw error;
        }
    }

    async *streamMediaFile(mobile: string, fileLocation: any, offset?: bigInt.BigInteger, limit?: number, requestSize?: number) {
        const telegramClient = await connectionManager.getClient(mobile);
        yield* telegramClient.streamMediaFile(fileLocation, offset, limit, requestSize);
    }

    async getThumbnail(mobile: string, messageId: number, chatId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            this.logger.info(mobile, 'Get thumbnail', { messageId, chatId });
            return await telegramClient.getThumbnail(messageId, chatId);
        } catch (error) {
            this.logger.error(mobile, 'Error getting thumbnail:', error);
            throw error;
        }
    }

    async forwardMessage(mobile: string, toChatId: string, fromChatId: string, messageId: number) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.forwardMessage(toChatId, fromChatId, messageId);
    }

    async leaveChannels(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        const channelinfo = await channelInfo(telegramClient.client, false);
        const leaveChannelIds = channelinfo.canSendFalseChats
        telegramClient.leaveChannels(leaveChannelIds);
        return "Left channels initiated";
    }

    async leaveChannel(mobile: string, channel: string) {
        const telegramClient = await connectionManager.getClient(mobile)
        telegramClient.leaveChannels([channel]);
        return "Left channel initiated";
    }

    async deleteChat(mobile: string, params: {
        peer: string | Api.TypeInputPeer;
        maxId?: number;
        justClear?: boolean;
        revoke?: boolean;
        minDate?: number;
        maxDate?: number;
    }) {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.deleteChat(params);
    }
    async updateNameandBio(
        mobile: string,
        firstName?: string,
        about?: string,
    ): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile)
        return await telegramClient.updateProfile(firstName, about);
    }

    async getDialogs(mobile: string, query: DialogsQueryDto) {
        const telegramClient = await connectionManager.getClient(mobile);
        const { limit = 10, offsetId, archived = false } = query;
        const chatData = [];
        
        // Use iterDialogs for memory-efficient iteration
        for await (const chat of telegramClient.client.iterDialogs({ limit, offsetId, archived })) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
        }
        
        return chatData;
    }

    async getConnectionStatus(): Promise<{
        activeConnections: number;
        rateLimited: number;
        totalOperations: number;
    }> {
        const status = {
            activeConnections: connectionManager.getActiveConnectionCount(),
            rateLimited: 0,
            totalOperations: 0
        };

        this.logger.info('system', 'Connection status retrieved', status);
        return status;
    }

    async forwardBulkMessages(
        mobile: string,
        fromChatId: string,
        toChatId: string,
        messageIds: number[]
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.forwardMessages(fromChatId, toChatId, messageIds)
    }

    async getAuths(mobile: string): Promise<any[]> {
        const telegramClient = await connectionManager.getClient(mobile);
        const auths = await telegramClient.getAuths();
        this.logger.info(mobile, 'Retrieved authorizations', {
            count: auths?.length || 0
        });
        return auths;
    }

    async removeOtherAuths(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        await telegramClient.removeOtherAuths();
        this.logger.info(mobile, 'Removed other authorizations');
        return "Removed other authorizations";
    }

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
                this.logger.error('batch-process', 'Batch processing failed', error);
            }
        }

        return { processed, errors };
    }

    // Enhanced Group Management
    async createGroupWithOptions(mobile: string, options: GroupOptions) {
        const telegramClient = await connectionManager.getClient(mobile);
        const result = await telegramClient.createGroupOrChannel(options);
        // Attempt to extract the channel/group ID from the result
        let groupId: string | undefined;
        if ('chats' in result && Array.isArray(result.chats) && result.chats.length > 0) {
            // For most cases, the created group/channel will be the last chat in the array
            const chat = result.chats[result.chats.length - 1];
            groupId = chat.id?.toString();
        }
        this.logger.info(mobile, 'Group created', { id: groupId });
        return result;
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
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.updateGroupSettings(settings)
    }

    // Message Scheduling
    async scheduleMessage(mobile: string, options: MessageScheduleOptions) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.scheduleMessageSend({
            chatId: options.chatId,
            message: options.message,
            scheduledTime: options.scheduledTime,
            replyTo: options.replyTo,
            silent: options.silent
        });
    }

    async getScheduledMessages(mobile: string, chatId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.getScheduledMessages(chatId)
    }

    async sendMediaAlbum(mobile: string, album: MediaAlbumOptions) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            return await telegramClient.sendMediaAlbum(album)
        } catch (error) {
            this.logger.error(mobile, 'Error sending media album:', error);
            throw error;
        }
    }

    async sendMessage(mobile: string, params: SendTgMessageDto) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.sendMessage(params)
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
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            return await telegramClient.sendVoiceMessage(voice)
        } catch (error) {
            this.logger.error(mobile, 'Error sending voice message:', error);
            throw error;
        }
    }

    async cleanupChat(
        mobile: string,
        cleanup: {
            chatId: string;
            beforeDate?: Date;
            onlyMedia?: boolean;
            excludePinned?: boolean;
        }
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.cleanupChat(cleanup)
    }

    async getChatStatistics(mobile: string, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics> {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.getChatStatistics(chatId, period)
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
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.updatePrivacyBatch(settings)
    }

    async addGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.addGroupMembers(groupId, members)
    }

    async removeGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.removeGroupMembers(groupId, members)
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
        const telegramClient = await connectionManager.getClient(mobile);
        return await telegramClient.promoteToAdmin(groupId, userId, permissions, rank)
    }

    async demoteAdmin(mobile: string, groupId: string, userId: string): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Demoted admin to regular member', { groupId, userId });
        return await telegramClient.demoteAdmin(groupId, userId);
    }

    async unblockGroupUser(mobile: string, groupId: string, userId: string): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Unblocked user in group', { groupId, userId });
        return await telegramClient.unblockGroupUser(groupId, userId);
    }

    async getGroupAdmins(mobile: string, groupId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get group admins', { groupId });
        return await telegramClient.getGroupAdmins(groupId);
    }

    async getGroupBannedUsers(mobile: string, groupId: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get group banned users', { groupId });
        return await telegramClient.getGroupBannedUsers(groupId);
    }

    async searchMessages(
        mobile: string,
        params: SearchMessagesDto
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Search messages', params);
        return await telegramClient.searchMessages(params);
    }

    async getFilteredMedia(
        mobile: string,
        params: {
            chatId: string;
            types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
            startDate?: Date;
            endDate?: Date;
            limit?: number;
            maxId?: number;
            minId?: number;
        }
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        try {
            this.logger.info(mobile, 'Get filtered media', params);
            return await telegramClient.getFilteredMedia(params);
        } catch (error) {
            this.logger.error(mobile, 'Error getting filtered media:', error);
            throw error;
        }
    }

    // Contact Management
    async exportContacts(
        mobile: string,
        format: 'vcard' | 'csv',
        includeBlocked: boolean = false
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Export contacts', { format, includeBlocked });
        return await telegramClient.exportContacts(format, includeBlocked);
    }

    async importContacts(
        mobile: string,
        contacts: { firstName: string; lastName?: string; phone: string }[]
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Import contacts', { contactCount: contacts.length });
        return await telegramClient.importContacts(contacts);
    }

    async manageBlockList(
        mobile: string,
        userIds: string[],
        block: boolean
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, block ? 'Block users' : 'Unblock users', { userIds });
        return await telegramClient.manageBlockList(userIds, block);
    }

    async getContactStatistics(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get contact statistics');
        return await telegramClient.getContactStatistics();
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
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Create chat folder', { name: options.name });
        return await telegramClient.createChatFolder(options);
    }

    async getChatFolders(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get chat folders');
        return await telegramClient.getChatFolders();
    }

    // Session Management
    async getSessionInfo(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get session info');
        return await telegramClient.getSessionInfo();
    }

    async terminateSession(
        mobile: string,
        options: {
            hash: string;
            type: 'app' | 'web';
            exceptCurrent?: boolean;
        }
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Terminate session', options);
        return await telegramClient.terminateSession(options);
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
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Edit message', { chatId: options.chatId, messageId: options.messageId });
        return await telegramClient.editMessage(options);
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

        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Update chat settings', { chatId: settings.chatId });
        return await telegramClient.updateChatSettings(settings);
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
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Send media batch', { chatId: options.chatId, mediaCount: options.media.length });
        return await telegramClient.sendMediaBatch(options);
    }

    // Password Management
    async hasPassword(mobile: string): Promise<boolean> {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Check password status');
        return await telegramClient.hasPassword();
    }

    // Contact Management
    async getContacts(mobile: string) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get contacts list');
        return await telegramClient.getContacts();
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
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get chats', options);
        return await telegramClient.getChats(options);
    }

    async getFileUrl(mobile: string, url: string, filename: string): Promise<string> {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get file URL', { url, filename });
        return await telegramClient.getFileUrl(url, filename);
    }

    async getMessageStats(
        mobile: string,
        options: {
            chatId: string;
            period: 'day' | 'week' | 'month';
            fromDate?: Date;
        }
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Get message statistics', options);
        return await telegramClient.getMessageStats(options);
    }

    async sendViewOnceMedia(
        mobile: string,
        options: {
            chatId: string;
            sourceType: 'path' | 'base64' | 'binary';
            path?: string;
            base64Data?: string;
            binaryData?: Buffer;
            caption?: string;
            filename?: string;
        }
    ) {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Send view once media', { sourceType: options.sourceType, chatId: options.chatId });

        const { sourceType, chatId, caption, filename } = options;
        try {
            if (sourceType === 'path') {
                if (!options.path) throw new BadRequestException('Path is required when sourceType is url');

                try {
                    const localPath = options.path;
                    if (!fs.existsSync(localPath)) {
                        throw new BadRequestException(`File not found at path: ${localPath}`);
                    }
                    let isVideo = false;
                    const ext = path.extname(localPath).toLowerCase().substring(1);
                    if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }

                    const fileBuffer = fs.readFileSync(localPath);

                    this.logger.info(mobile, 'Sending view once media from local file', {
                        path: localPath,
                        isVideo,
                        size: fileBuffer.length,
                        filename: filename || path.basename(localPath)
                    });

                    return await telegramClient.sendViewOnceMedia(
                        chatId,
                        fileBuffer,
                        caption,
                        isVideo,
                        filename || path.basename(localPath)
                    );
                } catch (error) {
                    if (error instanceof BadRequestException) {
                        throw error;
                    }
                    this.logger.error(mobile, 'Failed to read local file', error);
                    throw new BadRequestException(`Failed to read local file: ${error.message}`);
                }
            }
            else if (sourceType === 'base64') {
                if (!options.base64Data) throw new BadRequestException('Base64 data is required when sourceType is base64');
                const base64String = options.base64Data;
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                this.logger.info(mobile, 'Sending view once media from base64', { isVideo, size: base64String.length });
                const mediaData = Buffer.from(base64String, 'base64');
                return await telegramClient.sendViewOnceMedia(chatId, mediaData, caption, isVideo, filename);
            }
            else if (sourceType === 'binary') {
                if (!options.binaryData) throw new BadRequestException('Binary data is required when sourceType is binary');

                this.logger.info(mobile, 'Sending view once media from binary', {
                    size: options.binaryData.length,
                    filename: filename || 'unknown'
                });
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                return await telegramClient.sendViewOnceMedia(chatId, options.binaryData, caption, isVideo, filename);
            }
            else {
                throw new BadRequestException('Invalid source type. Must be one of: url, base64, binary');
            }
        } catch (error) {
            this.logger.error(mobile, 'Failed to send view once media', error);
            throw error;
        }
    }

    async getTopPrivateChats(mobile: string, limit?: number): Promise<{
        chatId: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        totalMessages: number;
        interactionScore: number;
        engagementLevel: 'recent' | 'active' | 'dormant';
        lastActivityDays: number;
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
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, `Get top private chats with limit=${limit || 10}`);
        try {
            return await telegramClient.getTopPrivateChats(limit);
        } catch (error) {
            this.logger.error(mobile, 'Error getting top private chats:', error);
            throw error;
        }
    }

    async addBotsToChannel(
        mobile: string,
        channelIds: string[] = [process.env.accountsChannel, process.env.updatesChannel, process.env.notifChannel, "miscmessages", process.env.httpFailuresChannel],
    ) {
        this.logger.info(mobile, 'Add bots to channel', { channelIds });
        const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
        if (botTokens.length === 0) {
            console.warn('No bot tokens configured. Please set BOT_TOKENS environment variable');
            throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
        }
        for (const token of botTokens) {
            try {
                const botInfo = await this.getBotInfo(token);
                if (botInfo) {
                    for (const channelId of channelIds) {
                        await this.setupBotInChannel(mobile, channelId, botInfo.id, botInfo.username, {
                            changeInfo: true,
                            postMessages: true,
                            editMessages: true,
                            deleteMessages: true,
                            banUsers: true,
                            inviteUsers: true,
                            pinMessages: true,
                            addAdmins: true,
                            anonymous: true,
                            manageCall: true
                        });
                    };
                }
            } catch (error) {
                this.logger.error(mobile, 'Failed to setup bot in channel', error);
            }
        }


    }

    async getBotInfo(token: string) {
        try {
            const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`);
            if (response.data?.ok) {
                return response.data.result;
            }
            throw new Error('Failed to get bot info');
        } catch (error) {
            throw new Error(`Failed to get bot info: ${error.message}`);
        }
    }

    async setupBotInChannel(mobile: string, channelId: string, botId: string, botUsername: string, permissions: {
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
    }): Promise<void> {
        const telegramClient = await connectionManager.getClient(mobile);
        this.logger.info(mobile, 'Setup bot in channel', { channelId, botId, botUsername });
        try {
            await telegramClient.joinChannel(channelId);
        } catch (error) {
            this.logger.error(mobile, 'Failed to join channel', error);
        }
        try {
            await telegramClient.promoteToAdmin(channelId, botUsername, permissions);
            this.logger.info(mobile, 'Bot added to channel', { channelId, botUsername });
            await sleep(2000);
            this.logger.info(mobile, `Bot ${botUsername} successfully added to channel ${channelId}`);
        } catch (error) {
            this.logger.error(mobile, `Failed to add bot ${botUsername} to channel ${channelId}`, error);
        }
        try {
            await telegramClient.promoteToAdmin(channelId, botUsername, permissions);
            this.logger.debug(mobile, `Bot ${botUsername} promoted as admin in channel ${channelId}`);
        } catch (error) {
            this.logger.error(mobile, `Failed to setup bot ${botUsername} in channel ${channelId}`, error);
        }
    }

    async createBot(mobile: string, createBotDto: CreateTgBotDto) {
        const client = await connectionManager.getClient(mobile);
        return client.createBot(createBotDto);
    }

    // Connection Management Methods
    async connect(mobile: string, options?: GetClientOptionsDto): Promise<void> {
        await connectionManager.getClient(mobile, options);
    }

    async disconnect(mobile: string): Promise<void> {
        await connectionManager.unregisterClient(mobile);
    }

    async disconnectAll(): Promise<void> {
        await connectionManager.disconnectAll();
    }

    getConnectionStats() {
        return connectionManager.getConnectionStats();
    }

    getClientState(mobile: string): ConnectionStatusDto | undefined {
        const state = connectionManager.getClientState(mobile);
        return state;
    }

    getActiveConnectionCount(): number {
        return connectionManager.getActiveConnectionCount();
    }
}
