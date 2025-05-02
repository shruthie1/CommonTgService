/// <reference types="multer" />
import { Response } from 'express';
import { TelegramService } from './Telegram.service';
import { SendMediaDto, GroupSettingsDto, GroupMemberOperationDto, AdminOperationDto, ChatCleanupDto, UpdateProfileDto, PrivacySettingsDto, ProfilePhotoDto, ScheduleMessageDto, BatchProcessDto, ForwardBatchDto, ContactExportImportDto, ContactBlockListDto, AddContactsDto, createGroupDto, ViewOnceMediaDto, CreateBotDto } from './dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from '../../interfaces/telegram';
import { SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    connect(mobile: string): Promise<{
        message: string;
    }>;
    disconnect(mobile: string): Promise<{
        message: string;
    }>;
    disconnectAllClients(): Promise<{
        message: string;
    }>;
    getMe(mobile: string): Promise<import("telegram").Api.User>;
    getEntity(mobile: string, entity: string): Promise<import("telegram/define").Entity>;
    updateProfile(mobile: string, updateProfileDto: UpdateProfileDto): Promise<void>;
    setProfilePhoto(mobile: string, photoDto: ProfilePhotoDto): Promise<string>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    getMessages(mobile: string, chatId: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    forwardMessage(mobile: string, forwardDto: ForwardBatchDto): Promise<number>;
    processBatchMessages(mobile: string, batchOp: BatchProcessDto): Promise<{
        processed: number;
        errors: Error[];
    }>;
    searchMessages(mobile: string, queryParams: SearchMessagesDto): Promise<SearchMessagesResponseDto>;
    getChannelInfo(mobile: string, includeIds?: boolean): Promise<import("src/components/Telegram/types/telegram-responses").ChannelInfo>;
    forwardMedia(mobile: string, channel?: string, fromChatId?: string): Promise<string>;
    leaveChannel(mobile: string, channel: string): Promise<string>;
    setup2FA(mobile: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updatePrivacyBatch(mobile: string, settings: PrivacySettingsDto): Promise<boolean>;
    getActiveSessions(mobile: string): Promise<any[]>;
    terminateOtherSessions(mobile: string): Promise<string>;
    createNewSession(mobile: string): Promise<string>;
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
    terminateSession(mobile: string, data: {
        hash: string;
        type: 'app' | 'web';
        exceptCurrent?: boolean;
    }): Promise<boolean>;
    getConnectionStatus(): Promise<{
        status: {
            activeConnections: number;
            rateLimited: number;
            totalOperations: number;
        };
    }>;
    getCallLogStats(mobile: string): Promise<{
        chatCallCounts: any[];
        outgoing: number;
        incoming: number;
        video: number;
        totalCalls: number;
    }>;
    addContactsBulk(mobile: string, contactsDto: AddContactsDto): Promise<void>;
    getContacts(mobile: string): Promise<import("telegram").Api.contacts.TypeContacts>;
    sendMedia(mobile: string, sendMediaDto: SendMediaDto): Promise<void>;
    downloadMedia(mobile: string, chatId: string, messageId: number, res: Response): Promise<any>;
    sendMediaAlbum(mobile: string, albumDto: MediaAlbumOptions): Promise<import("telegram").Api.TypeUpdates>;
    getMediaMetadata(mobile: string, chatId: string, types?: ('photo' | 'video' | 'document' | 'voice')[], startDate?: string, endDate?: string, limit?: number, minId?: number, maxId?: number, all?: boolean): Promise<{
        messages: any[];
        total: number;
    }>;
    getFilteredMedia(mobile: string, chatId: string, types?: ('photo' | 'video' | 'document' | 'voice')[], startDate?: string, endDate?: string, limit?: number, minId?: number, maxId?: number): Promise<{
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
    getGroupMembers(mobile: string, groupId: string): Promise<any[]>;
    blockChat(mobile: string, chatId: string): Promise<void>;
    deleteChatHistory(mobile: string, chatId: string): Promise<void>;
    sendMessageWithInlineButton(mobile: string, chatId: string, message: string, url: string): Promise<import("telegram").Api.Message>;
    getAllDialogs(mobile: string, limit?: number, offsetId?: number, archived?: boolean): Promise<any[]>;
    getLastActiveTime(mobile: string): Promise<string>;
    createGroupWithOptions(mobile: string, options: createGroupDto): Promise<import("telegram").Api.TypeUpdates>;
    updateGroupSettings(mobile: string, settings: GroupSettingsDto): Promise<boolean>;
    addGroupMembers(memberOp: GroupMemberOperationDto, mobile: string): Promise<void>;
    removeGroupMembers(memberOp: GroupMemberOperationDto, mobile: string): Promise<void>;
    handleAdminOperation(adminOp: AdminOperationDto, mobile: string): Promise<void>;
    cleanupChat(mobile: string, cleanup: ChatCleanupDto): Promise<{
        deletedCount: number;
    }>;
    getChatStatistics(mobile: string, chatId: string, period?: 'day' | 'week' | 'month'): Promise<ChatStatistics>;
    scheduleMessage(mobile: string, schedule: ScheduleMessageDto): Promise<import("telegram").Api.Message>;
    getScheduledMessages(mobile: string, chatId: string): Promise<import("telegram").Api.TypeMessage[]>;
    sendVoiceMessage(mobile: string, voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }): Promise<import("telegram").Api.TypeUpdates>;
    sendViewOnceMedia(mobile: string, file: Express.Multer.File, viewOnceDto: ViewOnceMediaDto): Promise<import("telegram").Api.TypeUpdates>;
    getChatHistory(mobile: string, chatId: string, offset?: number, limit?: number): Promise<any>;
    promoteToAdmin(mobile: string, adminOp: AdminOperationDto): Promise<void>;
    demoteAdmin(mobile: string, memberOp: GroupMemberOperationDto): Promise<void>;
    unblockGroupUser(mobile: string, data: {
        groupId: string;
        userId: string;
    }): Promise<void>;
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
    exportContacts(mobile: string, exportDto: ContactExportImportDto, res: Response): Promise<void>;
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
    manageBlockList(mobile: string, blockList: ContactBlockListDto): Promise<({
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
    createChatFolder(mobile: string, folder: CreateChatFolderDto): Promise<{
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
    editMessage(mobile: string, options: {
        chatId: string;
        messageId: number;
        text?: string;
        media?: {
            type: 'photo' | 'video' | 'document';
            url: string;
        };
    }): Promise<import("telegram").Api.TypeUpdates>;
    updateChatSettings(mobile: string, settings: {
        chatId: string;
        title?: string;
        about?: string;
        photo?: string;
        slowMode?: number;
        linkedChat?: string;
        defaultSendAs?: string;
        username?: string;
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
    }): Promise<import("telegram").Api.TypeUpdates>;
    hasPassword(mobile: string): Promise<boolean>;
    getChats(mobile: string, limit?: number, offsetDate?: number, offsetId?: number, offsetPeer?: string, folderId?: number): Promise<{
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
    addBotsToChannel(mobile: string, body: {
        channelIds?: string[];
    }): Promise<void>;
    createBot(mobile: string, createBotDto: CreateBotDto): Promise<{
        botToken: string;
        username: string;
    }>;
}
