/// <reference types="node" />
import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import TelegramManager from "./TelegramManager";
import { OnModuleDestroy } from '@nestjs/common';
import { Api } from 'telegram';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { EntityLike } from 'telegram/define';
import { ChannelInfo } from './types/telegram-responses';
import { DialogsQueryDto } from './dto/metadata-operations.dto';
import { ClientMetadata } from './types/client-operations';
import { ChatStatistics, ContentFilter, GroupOptions, MessageScheduleOptions } from '../../interfaces/telegram';
import { BackupOptions, MediaAlbumOptions } from './types/telegram-types';
export declare class TelegramService implements OnModuleDestroy {
    private usersService;
    private bufferClientService;
    private activeChannelsService;
    private channelsService;
    private static clientsMap;
    private readonly connectionManager;
    private readonly logger;
    private readonly metadataTracker;
    private cleanupInterval;
    constructor(usersService: UsersService, bufferClientService: BufferClientService, activeChannelsService: ActiveChannelsService, channelsService: ChannelsService);
    onModuleDestroy(): Promise<void>;
    getActiveClientSetup(): {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    };
    setActiveClientSetup(data: {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    } | undefined): void;
    private executeWithConnection;
    private getClientOrThrow;
    getClient(mobile: string): Promise<TelegramManager | undefined>;
    hasClient(number: string): boolean;
    deleteClient(number: string): Promise<boolean>;
    disconnectAll(): Promise<void>;
    createClient(mobile: string, autoDisconnect?: boolean, handler?: boolean): Promise<TelegramManager>;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<Api.Message>>;
    getMessagesNew(mobile: string, username: string, offset: number, limit: number): Promise<any>;
    sendInlineMessage(mobile: string, chatId: string, message: string, url: string): Promise<Api.Message>;
    getChatId(mobile: string, username: string): Promise<any>;
    getLastActiveTime(mobile: string): Promise<string>;
    tryJoiningChannel(mobile: string, chatEntity: Channel): Promise<void>;
    removeChannels(error: any, channelId: string, username: string): Promise<void>;
    getGrpMembers(mobile: string, entity: EntityLike): Promise<any[]>;
    addContact(mobile: string, data: {
        mobile: string;
        tgId: string;
    }[], prefix: string): Promise<void>;
    addContacts(mobile: string, phoneNumbers: string[], prefix: string): Promise<void>;
    getSelfMsgsInfo(mobile: string): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
        ownPhotoCount: number;
        otherPhotoCount: number;
        ownVideoCount: number;
        otherVideoCount: number;
    }>;
    createGroup(mobile: string): Promise<{
        id: any;
        accessHash: any;
    }>;
    forwardSecrets(mobile: string, fromChatId: string): Promise<void>;
    joinChannelAndForward(mobile: string, fromChatId: string, channel: string): Promise<void>;
    blockUser(mobile: string, chatId: string): Promise<void>;
    joinChannel(mobile: string, channelId: string): Promise<Api.TypeUpdates>;
    getCallLog(mobile: string): Promise<{
        chatCallCounts: any[];
        outgoing: number;
        incoming: number;
        video: number;
        totalCalls: number;
    }>;
    getmedia(mobile: string): Promise<Api.messages.Messages>;
    getChannelInfo(mobile: string, sendIds?: boolean): Promise<ChannelInfo>;
    getMe(mobile: string): Promise<Api.User>;
    getEntity(mobile: string, entity: EntityLike): Promise<import("telegram/define").Entity>;
    createNewSession(mobile: string): Promise<string>;
    set2Fa(mobile: string): Promise<string>;
    updatePrivacyforDeletedAccount(mobile: string): Promise<void>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    downloadProfilePic(mobile: string, index: number): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    getMediaMetadata(mobile: string, chatId?: string, offset?: number, limit?: number): Promise<any>;
    downloadMediaFile(mobile: string, messageId: number, chatId: string, res: any): Promise<any>;
    forwardMessage(mobile: string, toChatId: string, fromChatId: string, messageId: number): Promise<void>;
    leaveChannels(mobile: string): Promise<void>;
    leaveChannel(mobile: string, channel: string): Promise<void>;
    deleteChat(mobile: string, chatId: string): Promise<void>;
    updateNameandBio(mobile: string, firstName: string, about?: string): Promise<void>;
    getDialogs(mobile: string, query: DialogsQueryDto): Promise<import("telegram/Helpers").TotalList<import("telegram/tl/custom/dialog").Dialog>>;
    getConnectionStatus(): Promise<{
        activeConnections: number;
        rateLimited: number;
        totalOperations: number;
    }>;
    forwardBulkMessages(mobile: string, fromChatId: string, toChatId: string, messageIds: number[]): Promise<void>;
    getAuths(mobile: string): Promise<any[]>;
    removeOtherAuths(mobile: string): Promise<void>;
    getClientMetadata(mobile: string): Promise<ClientMetadata | undefined>;
    getClientStatistics(): Promise<{
        totalClients: number;
        totalOperations: number;
        failedOperations: number;
        averageReconnects: number;
    }>;
    private handleReconnect;
    processBatch<T>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<void>, delayMs?: number): Promise<{
        processed: number;
        errors: Error[];
    }>;
    createGroupWithOptions(mobile: string, options: GroupOptions): Promise<Api.Chat | Api.Channel>;
    updateGroupSettings(mobile: string, settings: {
        groupId: string;
        title?: string;
        description?: string;
        slowMode?: number;
        memberRestrictions?: any;
    }): Promise<boolean>;
    scheduleMessage(mobile: string, options: MessageScheduleOptions): Promise<void>;
    getScheduledMessages(mobile: string, chatId: string): Promise<Api.TypeMessage[]>;
    sendMediaAlbum(mobile: string, album: MediaAlbumOptions): Promise<Api.TypeUpdates>;
    sendVoiceMessage(mobile: string, voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }): Promise<Api.TypeUpdates>;
    cleanupChat(mobile: string, cleanup: {
        chatId: string;
        beforeDate?: Date;
        onlyMedia?: boolean;
        excludePinned?: boolean;
    }): Promise<{
        deletedCount: number;
    }>;
    getChatStatistics(mobile: string, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics>;
    updatePrivacyBatch(mobile: string, settings: {
        phoneNumber?: 'everybody' | 'contacts' | 'nobody';
        lastSeen?: 'everybody' | 'contacts' | 'nobody';
        profilePhotos?: 'everybody' | 'contacts' | 'nobody';
        forwards?: 'everybody' | 'contacts' | 'nobody';
        calls?: 'everybody' | 'contacts' | 'nobody';
        groups?: 'everybody' | 'contacts' | 'nobody';
    }): Promise<{
        success: boolean;
    }>;
    createBackup(mobile: string, options: BackupOptions): Promise<{
        backupId: string;
        path: string;
        format: "json" | "html";
        timestamp: string;
        chats: number;
        messages: any;
    }>;
    downloadBackup(mobile: string, options: BackupOptions): Promise<{
        messagesCount: number;
        mediaCount: number;
        outputPath: string;
        totalSize: number;
        backupId: string;
    }>;
    setContentFilters(mobile: string, filters: ContentFilter): Promise<{
        success: boolean;
        filterId: string;
    }>;
    private processBatchWithProgress;
    addGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void>;
    removeGroupMembers(mobile: string, groupId: string, members: string[]): Promise<void>;
    promoteToAdmin(mobile: string, groupId: string, userId: string, permissions?: {
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
    }, rank?: string): Promise<void>;
    demoteAdmin(mobile: string, groupId: string, userId: string): Promise<void>;
    unblockGroupUser(mobile: string, groupId: string, userId: string): Promise<void>;
    getGroupAdmins(mobile: string, groupId: string): Promise<{
        userId: string;
        rank?: string;
        permissions: {
            changeInfo: boolean;
            postMessages: boolean;
            editMessages: boolean;
            deleteMessages: boolean;
            banUsers: boolean;
            inviteUsers: boolean;
            pinMessages: boolean;
            addAdmins: boolean;
            anonymous: boolean;
            manageCall: boolean;
        };
    }[]>;
    getGroupBannedUsers(mobile: string, groupId: string): Promise<{
        userId: string;
        bannedRights: {
            viewMessages: boolean;
            sendMessages: boolean;
            sendMedia: boolean;
            sendStickers: boolean;
            sendGifs: boolean;
            sendGames: boolean;
            sendInline: boolean;
            embedLinks: boolean;
            untilDate: number;
        };
    }[]>;
    searchMessages(mobile: string, params: {
        chatId: string;
        query?: string;
        types?: ('all' | 'text' | 'photo' | 'video' | 'voice' | 'document')[];
        offset?: number;
        limit?: number;
    }): Promise<{
        messages: {
            id: number;
            message: string;
            date: number;
            sender: {
                id: string;
                is_self: boolean;
                username: string;
            };
            media: {
                type: "document" | "video" | "photo";
                thumbnailUrl: string | Buffer;
            };
        }[];
        total: number;
    }>;
    getFilteredMedia(mobile: string, params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice')[];
        startDate?: Date;
        endDate?: Date;
        offset?: number;
        limit?: number;
    }): Promise<{
        messages: {
            messageId: number;
            type: "document" | "video" | "photo";
            thumb: any;
            caption: string;
            date: number;
            mediaDetails: {
                filename: string;
                duration: number;
                mimeType: string;
                size: import("big-integer").BigInteger;
            };
        }[];
        total: number;
        hasMore: boolean;
    }>;
    exportContacts(mobile: string, format: 'vcard' | 'csv', includeBlocked?: boolean): Promise<string>;
    importContacts(mobile: string, contacts: {
        firstName: string;
        lastName?: string;
        phone: string;
    }[]): Promise<({
        success: boolean;
        phone: string;
        error?: undefined;
    } | {
        success: boolean;
        phone: string;
        error: any;
    })[]>;
    manageBlockList(mobile: string, userIds: string[], block: boolean): Promise<({
        success: boolean;
        userId: string;
        error?: undefined;
    } | {
        success: boolean;
        userId: string;
        error: any;
    })[]>;
    getContactStatistics(mobile: string): Promise<{
        total: any;
        online: any;
        withPhone: any;
        mutual: any;
        lastWeekActive: any;
    }>;
    createChatFolder(mobile: string, options: {
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
    }): Promise<{
        id: number;
        name: string;
        options: {
            includeContacts: boolean;
            includeNonContacts: boolean;
            includeGroups: boolean;
            includeBroadcasts: boolean;
            includeBots: boolean;
            excludeMuted: boolean;
            excludeRead: boolean;
            excludeArchived: boolean;
        };
    }>;
    getChatFolders(mobile: string): Promise<{
        id: any;
        title: any;
        includedChatsCount: any;
        excludedChatsCount: any;
    }[]>;
}
