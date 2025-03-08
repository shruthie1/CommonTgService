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
import { MediaAlbumOptions } from './types/telegram-types';
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
    getDialogs(mobile: string, query: DialogsQueryDto): Promise<any[]>;
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
        username?: string;
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
    }): Promise<boolean>;
    setContentFilters(mobile: string, filters: ContentFilter): Promise<void>;
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
        maxId?: number;
        minId?: number;
    }): Promise<{
        messages: {
            messageId: number;
            type: "document" | "video" | "photo";
            thumb: any;
            caption: string;
            date: number;
            mediaDetails: {
                size: import("big-integer").BigInteger;
                mimeType: string;
                fileName: string;
                duration: number;
                width: number;
                height: number;
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
    getSessionInfo(mobile: string): Promise<{
        sessions: {
            hash: string;
            deviceModel: string;
            platform: string;
            systemVersion: string;
            appName: string;
            dateCreated: Date;
            dateActive: Date;
            ip: string;
            country: string;
            region: string;
        }[];
        webSessions: {
            hash: string;
            domain: string;
            browser: string;
            platform: string;
            dateCreated: Date;
            dateActive: Date;
            ip: string;
            region: string;
        }[];
    }>;
    terminateSession(mobile: string, options: {
        hash: string;
        type: 'app' | 'web';
        exceptCurrent?: boolean;
    }): Promise<boolean>;
    editMessage(mobile: string, options: {
        chatId: string;
        messageId: number;
        text?: string;
        media?: {
            type: 'photo' | 'video' | 'document';
            url: string;
        };
    }): Promise<Api.TypeUpdates>;
    updateChatSettings(mobile: string, settings: {
        chatId: string;
        username?: string;
        title?: string;
        about?: string;
        photo?: string;
        slowMode?: number;
        linkedChat?: string;
        defaultSendAs?: string;
    }): Promise<boolean>;
    sendMediaBatch(mobile: string, options: {
        chatId: string;
        media: Array<{
            type: 'photo' | 'video' | 'document';
            url: string;
            caption?: string;
            fileName?: string;
        }>;
        silent?: boolean;
        scheduleDate?: number;
    }): Promise<Api.TypeUpdates>;
    hasPassword(mobile: string): Promise<boolean>;
    getContacts(mobile: string): Promise<Api.contacts.TypeContacts>;
    getChats(mobile: string, options: {
        limit?: number;
        offsetDate?: number;
        offsetId?: number;
        offsetPeer?: string;
        folderId?: number;
    }): Promise<{
        id: string;
        title: string;
        username: string;
        type: string;
        unreadCount: number;
        lastMessage: {
            id: number;
            text: string;
            date: Date;
        };
    }[]>;
    getFileUrl(mobile: string, url: string, filename: string): Promise<string>;
    getMessageStats(mobile: string, options: {
        chatId: string;
        period: 'day' | 'week' | 'month';
        fromDate?: Date;
    }): Promise<{
        total: number;
        withMedia: number;
        withLinks: number;
        withForwards: number;
        byHour: any[];
        byType: {
            text: number;
            photo: number;
            video: number;
            document: number;
            other: number;
        };
    }>;
    getTopPrivateChats(mobile: string): Promise<{
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
    }[]>;
}
