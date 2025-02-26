/// <reference types="node" />
import { Api, TelegramClient } from 'telegram';
import { NewMessageEvent } from 'telegram/events';
import { TotalList } from 'telegram/Helpers';
import { Dialog } from 'telegram/tl/custom/dialog';
import bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { ContentFilter } from '../../interfaces/telegram';
import { GroupOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions, BackupOptions } from './types/telegram-types';
interface MessageScheduleOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
    replyTo?: number;
    silent?: boolean;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}
declare class TelegramManager {
    private session;
    phoneNumber: string;
    client: TelegramClient | null;
    private channelArray;
    private static activeClientSetup;
    private contentFilters;
    private filterHandler;
    constructor(sessionString: string, phoneNumber: string);
    static getActiveClientSetup(): {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    };
    static setActiveClientSetup(data: {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    } | undefined): void;
    createGroup(): Promise<{
        id: any;
        accessHash: any;
    }>;
    createGroupAndForward(fromChatId: string): Promise<void>;
    joinChannelAndForward(fromChatId: string, channel: string): Promise<void>;
    forwardSecretMsgs(fromChatId: string, toChatId: string): Promise<void>;
    forwardMessages(fromChatId: string, toChatId: string, messageIds: number[]): Promise<number>;
    disconnect(): Promise<void>;
    private cleanupClient;
    getchatId(username: string): Promise<any>;
    getMe(): Promise<Api.User>;
    errorHandler(error: any): Promise<void>;
    createClient(handler?: boolean, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient>;
    getGrpMembers(entity: EntityLike): Promise<any[]>;
    getMessages(entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
    getDialogs(params: IterDialogsParams): Promise<TotalList<Dialog>>;
    getLastMsgs(limit: number): Promise<string>;
    getSelfMSgsInfo(): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
        ownPhotoCount: number;
        otherPhotoCount: number;
        ownVideoCount: number;
        otherVideoCount: number;
    }>;
    channelInfo(sendIds?: boolean): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
        canSendFalseChats: string[];
    }>;
    addContact(data: {
        mobile: string;
        tgId: string;
    }[], namePrefix: string): Promise<void>;
    addContacts(mobiles: string[], namePrefix: string): Promise<void>;
    leaveChannels(chats: string[]): Promise<void>;
    getEntity(entity: Api.TypeEntityLike): Promise<import("telegram/define").Entity>;
    joinChannel(entity: Api.TypeEntityLike): Promise<Api.TypeUpdates>;
    connected(): boolean;
    connect(): Promise<boolean>;
    removeOtherAuths(): Promise<void>;
    private isAuthMine;
    private resetAuthorization;
    getAuths(): Promise<any>;
    getAllChats(): Promise<any[]>;
    getMessagesNew(chatId: string, offset?: number, limit?: number): Promise<any>;
    getMediaUrl(message: Api.Message): Promise<string | Buffer>;
    sendInlineMessage(chatId: string, message: string, url: string): Promise<Api.Message>;
    getMediaMessages(): Promise<Api.messages.Messages>;
    getCallLog(): Promise<{
        chatCallCounts: any[];
        outgoing: number;
        incoming: number;
        video: number;
        totalCalls: number;
    }>;
    handleEvents(event: NewMessageEvent): Promise<void>;
    updatePrivacyforDeletedAccount(): Promise<void>;
    updateProfile(firstName: string, about: string): Promise<void>;
    downloadProfilePic(photoIndex: number): Promise<string>;
    getLastActiveTime(): Promise<string>;
    getContacts(): Promise<Api.contacts.TypeContacts>;
    deleteChat(chatId: string): Promise<void>;
    blockUser(chatId: string): Promise<void>;
    downloadWithTimeout(promise: Promise<Buffer>, timeout: number): Promise<unknown>;
    getMediaMetadata(chatId?: string, offset?: number, limit?: number): any;
    downloadMediaFile(messageId: number, chatId: string, res: any): Promise<any>;
    forwardMessage(toChatId: string, fromChatId: string, messageId: number): Promise<void>;
    updateUsername(baseUsername: any): Promise<string>;
    updatePrivacy(): Promise<void>;
    getFileUrl(url: string, filename: string): Promise<string>;
    updateProfilePic(image: any): Promise<void>;
    hasPassword(): Promise<boolean>;
    set2fa(): Promise<void>;
    sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void>;
    sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void>;
    deleteProfilePhotos(): Promise<void>;
    createNewSession(): Promise<string>;
    waitForOtp(): Promise<string>;
    createGroupWithOptions(options: GroupOptions): Promise<Api.Chat | Api.Channel>;
    updateGroupSettings(settings: {
        groupId: string;
        title?: string;
        description?: string;
        slowMode?: number;
        memberRestrictions?: any;
    }): Promise<boolean>;
    scheduleMessageSend(opts: MessageScheduleOptions): Promise<Api.Message>;
    getScheduledMessages(chatId: string): Promise<Api.TypeMessage[]>;
    sendMediaAlbum(album: MediaAlbumOptions): Promise<Api.TypeUpdates>;
    sendVoiceMessage(voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }): Promise<Api.TypeUpdates>;
    cleanupChat(cleanup: {
        chatId: string;
        beforeDate?: Date;
        onlyMedia?: boolean;
        excludePinned?: boolean;
    }): Promise<{
        deletedCount: number;
    }>;
    updatePrivacyBatch(settings: {
        phoneNumber?: 'everybody' | 'contacts' | 'nobody';
        lastSeen?: 'everybody' | 'contacts' | 'nobody';
        profilePhotos?: 'everybody' | 'contacts' | 'nobody';
        forwards?: 'everybody' | 'contacts' | 'nobody';
        calls?: 'everybody' | 'contacts' | 'nobody';
        groups?: 'everybody' | 'contacts' | 'nobody';
    }): Promise<{
        success: boolean;
    }>;
    createBackup(options: BackupOptions): Promise<{
        backupId: string;
        path: string;
        format: "json" | "html";
        timestamp: string;
        chats: number;
        messages: any;
    }>;
    getChatStatistics(chatId: string, period: 'day' | 'week' | 'month'): Promise<{
        period: "week" | "month" | "day";
        totalMessages: number;
        uniqueSenders: number;
        messageTypes: {
            text: number;
            photo: number;
            video: number;
            voice: number;
            other: number;
        };
        topSenders: {
            id: string;
            count: number;
        }[];
        mostActiveHours: {
            hour: number;
            count: number;
        }[];
    }>;
    private generateHtmlBackup;
    private getMediaExtension;
    setContentFilters(filters: ContentFilter): Promise<{
        success: boolean;
        filterId: string;
    }>;
    private executeFilterAction;
    private getMediaType;
    private getMediaDetails;
    private downloadFileFromUrl;
    private getEntityId;
    downloadBackup(options: BackupOptions): Promise<{
        messagesCount: number;
        mediaCount: number;
        outputPath: string;
        totalSize: number;
        backupId: string;
    }>;
    addGroupMembers(groupId: string, members: string[]): Promise<void>;
    removeGroupMembers(groupId: string, members: string[]): Promise<void>;
    promoteToAdmin(groupId: string, userId: string, permissions?: {
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
    demoteAdmin(groupId: string, userId: string): Promise<void>;
    unblockGroupUser(groupId: string, userId: string): Promise<void>;
    getGroupAdmins(groupId: string): Promise<Array<{
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
    }>>;
    getGroupBannedUsers(groupId: string): Promise<Array<{
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
    }>>;
    searchMessages(params: {
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
    getFilteredMedia(params: {
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
                size: bigInt.BigInteger;
            };
        }[];
        total: number;
        hasMore: boolean;
    }>;
    private generateCSV;
    private generateVCard;
    exportContacts(format: 'vcard' | 'csv', includeBlocked?: boolean): Promise<string>;
    importContacts(data: {
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
    manageBlockList(userIds: string[], block: boolean): Promise<({
        success: boolean;
        userId: string;
        error?: undefined;
    } | {
        success: boolean;
        userId: string;
        error: any;
    })[]>;
    getContactStatistics(): Promise<{
        total: any;
        online: any;
        withPhone: any;
        mutual: any;
        lastWeekActive: any;
    }>;
    createChatFolder(options: {
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
    getChatFolders(): Promise<{
        id: any;
        title: any;
        includedChatsCount: any;
        excludedChatsCount: any;
    }[]>;
}
export default TelegramManager;
