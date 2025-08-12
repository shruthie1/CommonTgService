import { UsersService } from '../users/users.service';
import { OnModuleDestroy } from '@nestjs/common';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { EntityLike } from 'telegram/define';
import { ChannelInfo } from './types/telegram-responses';
import { DialogsQueryDto } from './dto/metadata-operations.dto';
import { ChatStatistics, GroupOptions, MessageScheduleOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
import { SearchMessagesDto } from './dto/message-search.dto';
import { CreateBotDto } from './dto/create-bot.dto';
import { Api } from 'telegram';
import { ConnectionStatsDto, ConnectionStatusDto, GetClientOptionsDto } from './dto/connection-management.dto';
import { ActiveChannel } from '../active-channels';
export declare class TelegramService implements OnModuleDestroy {
    private usersService;
    private activeChannelsService;
    private channelsService;
    private readonly logger;
    private cleanupInterval;
    constructor(usersService: UsersService, activeChannelsService: ActiveChannelsService, channelsService: ChannelsService);
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
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<Api.Message>>;
    getMessagesNew(mobile: string, username: string, offset: number, limit: number): Promise<any>;
    sendInlineMessage(mobile: string, chatId: string, message: string, url: string): Promise<Api.Message>;
    getChatId(mobile: string, username: string): Promise<any>;
    getLastActiveTime(mobile: string): Promise<string>;
    tryJoiningChannel(mobile: string, chatEntity: Channel | ActiveChannel): Promise<void>;
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
    forwardMedia(mobile: string, channel: string, fromChatId: string): Promise<string>;
    forwardMediaToBot(mobile: string, fromChatId: string): Promise<string>;
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
    getMediaMetadata(mobile: string, params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
        all?: boolean;
    }): Promise<{
        messages: any[];
        total: number;
    }>;
    downloadMediaFile(mobile: string, messageId: number, chatId: string, res: any): Promise<any>;
    forwardMessage(mobile: string, toChatId: string, fromChatId: string, messageId: number): Promise<void>;
    leaveChannels(mobile: string): Promise<string>;
    leaveChannel(mobile: string, channel: string): Promise<string>;
    deleteChat(mobile: string, params: {
        peer: string | Api.TypeInputPeer;
        maxId?: number;
        justClear?: boolean;
        revoke?: boolean;
        minDate?: number;
        maxDate?: number;
    }): Promise<void>;
    updateNameandBio(mobile: string, firstName: string, about?: string): Promise<void>;
    getDialogs(mobile: string, query: DialogsQueryDto): Promise<any[]>;
    getConnectionStatus(): Promise<{
        activeConnections: number;
        rateLimited: number;
        totalOperations: number;
    }>;
    forwardBulkMessages(mobile: string, fromChatId: string, toChatId: string, messageIds: number[]): Promise<number>;
    getAuths(mobile: string): Promise<any[]>;
    removeOtherAuths(mobile: string): Promise<string>;
    processBatch<T>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<void>, delayMs?: number): Promise<{
        processed: number;
        errors: Error[];
    }>;
    createGroupWithOptions(mobile: string, options: GroupOptions): Promise<Api.TypeUpdates>;
    updateGroupSettings(mobile: string, settings: {
        groupId: string;
        username?: string;
        title?: string;
        description?: string;
        slowMode?: number;
        memberRestrictions?: any;
    }): Promise<boolean>;
    scheduleMessage(mobile: string, options: MessageScheduleOptions): Promise<Api.Message>;
    getScheduledMessages(mobile: string, chatId: string): Promise<Api.TypeMessage[]>;
    sendMediaAlbum(mobile: string, album: MediaAlbumOptions): Promise<Api.TypeUpdates>;
    sendMessage(mobile: string, params: {
        peer: string;
        parseMode?: string;
        message: string;
    }): Promise<Api.Message>;
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
    searchMessages(mobile: string, params: SearchMessagesDto): Promise<import("./dto/message-search.dto").SearchMessagesResponseDto>;
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
            type: "document" | "photo" | "video";
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
    sendViewOnceMedia(mobile: string, options: {
        chatId: string;
        sourceType: 'path' | 'base64' | 'binary';
        path?: string;
        base64Data?: string;
        binaryData?: Buffer;
        caption?: string;
        filename?: string;
    }): Promise<Api.TypeUpdates>;
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
    addBotsToChannel(mobile: string, channelIds?: string[]): Promise<void>;
    getBotInfo(token: string): Promise<any>;
    setupBotInChannel(mobile: string, channelId: string, botId: string, botUsername: string, permissions: {
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
    }): Promise<void>;
    createBot(mobile: string, createBotDto: CreateBotDto): Promise<{
        botToken: string;
        username: string;
    }>;
    connect(mobile: string, options?: GetClientOptionsDto): Promise<void>;
    disconnect(mobile: string): Promise<void>;
    disconnectAll(): Promise<void>;
    getConnectionStats(): ConnectionStatsDto;
    getClientState(mobile: string): ConnectionStatusDto | undefined;
    getActiveConnectionCount(): number;
}
