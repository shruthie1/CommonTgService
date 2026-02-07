import { Response } from 'express';
import { TelegramService } from './Telegram.service';
import { SendMediaDto, GroupSettingsDto, GroupMemberOperationDto, AdminOperationDto, ChatCleanupDto, PrivacySettingsDto, ProfilePhotoDto, ScheduleMessageDto, BatchProcessDto, ForwardBatchDto, ContactExportImportDto, ContactBlockListDto, AddContactsDto, createGroupDto, ViewOnceMediaDto, CreateTgBotDto } from './dto';
import { CreateChatFolderDto } from './dto/create-chat-folder.dto';
import { MediaAlbumOptions } from './types/telegram-types';
import { ChatStatistics } from '../../interfaces/telegram';
import { ConnectionStatusDto } from './dto/connection-management.dto';
import { SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
import { DeleteHistoryDto } from './dto/delete-chat.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { SendTgMessageDto } from './dto/send-message.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    connect(mobile: string, autoDisconnect?: boolean, handler?: boolean): Promise<{
        message: string;
    }>;
    disconnect(mobile: string): Promise<{
        message: string;
    }>;
    disconnectAll(): Promise<{
        message: string;
    }>;
    getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnected: number;
        error: number;
    };
    getClientState(mobile: string): ConnectionStatusDto | undefined;
    getActiveConnectionCount(): number;
    getMe(mobile: string): Promise<import("telegram").Api.User>;
    getEntity(mobile: string, entity: string): Promise<import("telegram").Api.User | import("telegram").Api.Chat | import("telegram").Api.Channel>;
    updateProfile(mobile: string, updateProfileDto: UpdateProfileDto): Promise<void>;
    setProfilePhoto(mobile: string, photoDto: ProfilePhotoDto): Promise<string>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    getMessages(mobile: string, chatId: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    sendMessage(mobile: string, dto: SendTgMessageDto): Promise<import("telegram").Api.Message>;
    forwardMessage(mobile: string, forwardDto: ForwardBatchDto): Promise<number>;
    processBatchMessages(mobile: string, batchOp: BatchProcessDto): Promise<{
        processed: number;
        errors: Error[];
    }>;
    searchMessages(mobile: string, queryParams: SearchMessagesDto): Promise<SearchMessagesResponseDto>;
    getChannelInfo(mobile: string, includeIds?: boolean): Promise<import("./types/telegram-responses").ChannelInfo>;
    forwardMedia(mobile: string, channel?: string, fromChatId?: string): Promise<string>;
    leaveChannel(mobile: string, channel: string): Promise<string>;
    updateUsername(mobile: string, updateUsernameDto: UpdateUsernameDto): Promise<string>;
    setup2FA(mobile: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updatePrivacyBatch(mobile: string, settings: PrivacySettingsDto): Promise<boolean>;
    getActiveSessions(mobile: string): Promise<any>;
    terminateOtherSessions(mobile: string): Promise<string>;
    createNewSession(mobile: string): Promise<string>;
    getSessionInfo(mobile: string): Promise<import("./manager").SessionInfo>;
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
    getCallLogStats(mobile: string, limit?: number, includeCallLog?: string): Promise<import("./manager").CallLogResult>;
    addContactsBulk(mobile: string, contactsDto: AddContactsDto): Promise<void>;
    getContacts(mobile: string): Promise<import("telegram").Api.contacts.TypeContacts>;
    sendMedia(mobile: string, sendMediaDto: SendMediaDto): Promise<void>;
    downloadMedia(mobile: string, chatId: string, messageId: number, res: Response): Promise<Response<any, Record<string, any>>>;
    getThumbnail(mobile: string, chatId: string, messageId: number, res: Response): Promise<Response<any, Record<string, any>>>;
    sendMediaAlbum(mobile: string, albumDto: MediaAlbumOptions): Promise<import("./manager").AlbumSendResult>;
    getMediaMetadata(mobile: string, chatId: string, types?: string | string[], startDate?: string, endDate?: string, limit?: number, maxId?: number, minId?: number): Promise<import("./manager").MediaListResponse>;
    getFilteredMedia(mobile: string, chatId: string, types?: string | string[], startDate?: string, endDate?: string, limit?: number, maxId?: number, minId?: number): Promise<import("./manager").FilteredMediaListResponse>;
    getGroupMembers(mobile: string, groupId: string): Promise<import("./manager").GroupMember[]>;
    blockChat(mobile: string, chatId: string): Promise<void>;
    deleteChatHistory(mobile: string, deleteHistoryDto: DeleteHistoryDto): Promise<void>;
    sendMessageWithInlineButton(mobile: string, chatId: string, message: string, url: string): Promise<import("telegram").Api.Message>;
    getDialogs(mobile: string, limit?: number, offsetDate?: number, folderId?: number, archived?: boolean, peerType?: string, ignorePinned?: boolean, includePhotos?: boolean): Promise<import("./manager").ChatListResult>;
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
    scheduleMessage(mobile: string, schedule: ScheduleMessageDto): Promise<import("telegram").Api.Message | import("telegram").Api.TypeUpdates>;
    getScheduledMessages(mobile: string, chatId: string): Promise<import("./manager").ScheduledMessageItem[]>;
    sendVoiceMessage(mobile: string, voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }): Promise<import("telegram").Api.TypeUpdates>;
    sendViewOnceMedia(mobile: string, file: Express.Multer.File, viewOnceDto: ViewOnceMediaDto): Promise<import("telegram").Api.TypeUpdates>;
    getChatHistory(mobile: string, chatId: string, offset?: number, limit?: number): Promise<import("./manager").MessageItem[]>;
    promoteToAdmin(mobile: string, adminOp: AdminOperationDto): Promise<void>;
    demoteAdmin(mobile: string, memberOp: GroupMemberOperationDto): Promise<void>;
    unblockGroupUser(mobile: string, data: {
        groupId: string;
        userId: string;
    }): Promise<void>;
    getGroupAdmins(mobile: string, groupId: string): Promise<import("./manager").AdminInfo[]>;
    getGroupBannedUsers(mobile: string, groupId: string): Promise<import("./manager").BannedUserInfo[]>;
    exportContacts(mobile: string, exportDto: ContactExportImportDto, res: Response): Promise<void>;
    importContacts(mobile: string, contacts: {
        firstName: string;
        lastName?: string;
        phone: string;
    }[]): Promise<import("./manager").ImportContactResult[]>;
    manageBlockList(mobile: string, blockList: ContactBlockListDto): Promise<import("./manager").BlockListResult[]>;
    getContactStatistics(mobile: string): Promise<import("./manager").ContactStats>;
    createChatFolder(mobile: string, folder: CreateChatFolderDto): Promise<{
        id: number;
        name: string;
        options: Record<string, boolean>;
    }>;
    getChatFolders(mobile: string): Promise<import("./manager").ChatFolder[]>;
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
    getFileUrl(mobile: string, url: string, filename: string): Promise<string>;
    getMessageStats(mobile: string, options: {
        chatId: string;
        period: 'day' | 'week' | 'month';
        fromDate?: Date;
    }): Promise<import("./manager").MessageStats>;
    getTopPrivateChats(mobile: string, limit?: number): Promise<{
        chatId: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        totalMessages: number;
        interactionScore: number;
        engagementLevel: "active" | "dormant";
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
    getSelfMsgsInfo(mobile: string, limit?: number): Promise<import("./manager").SelfMessagesInfo>;
    addBotsToChannel(mobile: string, body: {
        channelIds?: string[];
    }): Promise<void>;
    createBot(mobile: string, createBotDto: CreateTgBotDto): Promise<import("./manager").BotCreationResult>;
}
