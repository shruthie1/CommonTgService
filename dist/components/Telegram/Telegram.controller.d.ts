/// <reference types="node" />
import { Response } from 'express';
import { TelegramService } from './Telegram.service';
import { SendMediaDto, MediaDownloadDto, MediaSearchDto, GroupSettingsDto, GroupMemberOperationDto, AdminOperationDto, ChatCleanupDto, UpdateProfileDto, PrivacySettingsDto, ProfilePhotoDto, ScheduleMessageDto, BatchProcessDto, ForwardBatchDto, ContactExportImportDto, ContactBlockListDto, AddContactsDto, MediaType } from './dto';
import { MessageType } from './dto/message-search.dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from 'src/interfaces/telegram';
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    private handleTelegramOperation;
    connect(mobile: string): Promise<import("./TelegramManager").default>;
    disconnect(mobile: string): Promise<boolean>;
    disconnectAllClients(): Promise<void>;
    getMe(mobile: string): Promise<import("telegram").Api.User>;
    getEntity(mobile: string, entity: string): Promise<import("telegram/define").Entity>;
    updateProfile(mobile: string, updateProfileDto: UpdateProfileDto): Promise<void>;
    setProfilePhoto(mobile: string, photoDto: ProfilePhotoDto): Promise<string>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    getMessages(mobile: string, chatId: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    forwardMessage(mobile: string, forwardDto: ForwardBatchDto): Promise<void>;
    processBatchMessages(mobile: string, batchOp: BatchProcessDto): Promise<{
        processed: number;
        errors: Error[];
    }>;
    forwardBulkMessages(mobile: string, bulkOp: ForwardBatchDto): Promise<void>;
    searchMessages(mobile: string, chatId: string, query: string, types?: MessageType[], offset?: number, limit?: number): Promise<{
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
    getChannelInfo(mobile: string, includeIds?: boolean): Promise<import("./types/telegram-responses").ChannelInfo>;
    joinChannel(mobile: string, channel: string, forward?: boolean, fromChatId?: string): Promise<void | import("telegram").Api.TypeUpdates>;
    leaveChannel(mobile: string, channel: string): Promise<void>;
    setup2FA(mobile: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updatePrivacyBatch(mobile: string, settings: PrivacySettingsDto): Promise<{
        success: boolean;
    }>;
    getActiveSessions(mobile: string): Promise<any[]>;
    terminateOtherSessions(mobile: string): Promise<void>;
    createNewSession(mobile: string): Promise<string>;
    getConnectionStatus(): Promise<{
        status: {
            activeConnections: number;
            rateLimited: number;
            totalOperations: number;
        };
    }>;
    getClientMetadata(mobile: string): Promise<import("./types/client-operations").ClientMetadata>;
    getClientStatistics(): Promise<{
        totalClients: number;
        totalOperations: number;
        failedOperations: number;
        averageReconnects: number;
    }>;
    getHealthStatus(): Promise<{
        connections: {
            activeConnections: number;
            rateLimited: number;
            totalOperations: number;
        };
        statistics: {
            totalClients: number;
            totalOperations: number;
            failedOperations: number;
            averageReconnects: number;
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
    getMediaInfo(mobile: string, chatId: string, types?: MediaType[], offset?: number, limit?: number): Promise<any>;
    sendMedia(mobile: string, sendMediaDto: SendMediaDto): Promise<void>;
    downloadMedia(mobile: string, downloadDto: MediaDownloadDto, res: Response): Promise<any>;
    sendMediaAlbum(mobile: string, albumDto: MediaAlbumOptions): Promise<import("telegram").Api.TypeUpdates>;
    getMediaMetadata(mobile: string, searchDto: MediaSearchDto): Promise<any>;
    getFilteredMedia(mobile: string, chatId: string, types?: ('photo' | 'video' | 'document' | 'voice')[], startDate?: string, endDate?: string): Promise<{
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
    getAllChats(mobile: string): Promise<any[]>;
    getGroupMembers(mobile: string, groupId: string): Promise<any[]>;
    blockChat(mobile: string, chatId: string): Promise<void>;
    deleteChatHistory(mobile: string, chatId: string): Promise<void>;
    sendMessageWithInlineButton(mobile: string, chatId: string, message: string, url: string): Promise<import("telegram").Api.Message>;
    getAllDialogs(mobile: string, limit?: number, archived?: boolean): Promise<{
        id: string;
        title: string;
        isChannel: boolean;
        isGroup: boolean;
        isUser: boolean;
        entity: import("telegram/define").EntityLike;
    }[]>;
    getLastActiveTime(mobile: string): Promise<string>;
    createGroupWithOptions(mobile: string, options: GroupSettingsDto): Promise<import("telegram").Api.Chat | import("telegram").Api.Channel>;
    updateGroupSettings(mobile: string, settings: GroupSettingsDto): Promise<boolean>;
    addGroupMembers(memberOp: GroupMemberOperationDto, mobile: string): Promise<void>;
    removeGroupMembers(memberOp: GroupMemberOperationDto, mobile: string): Promise<void>;
    handleAdminOperation(adminOp: AdminOperationDto, mobile: string): Promise<void>;
    cleanupChat(mobile: string, cleanup: ChatCleanupDto): Promise<{
        deletedCount: number;
    }>;
    getChatStatistics(mobile: string, chatId: string, period?: 'day' | 'week' | 'month'): Promise<ChatStatistics>;
    scheduleMessage(mobile: string, schedule: ScheduleMessageDto): Promise<void>;
    getScheduledMessages(mobile: string, chatId: string): Promise<import("telegram").Api.TypeMessage[]>;
    sendVoiceMessage(mobile: string, voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }): Promise<import("telegram").Api.TypeUpdates>;
    getChatHistory(mobile: string, chatId: string, offset?: number, limit?: number): Promise<any>;
    validateSession(mobile: string): Promise<{
        isValid: boolean;
        isConnected: boolean;
        phoneNumber: string;
    }>;
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
}
