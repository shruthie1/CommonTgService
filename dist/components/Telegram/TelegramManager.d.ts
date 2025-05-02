/// <reference types="node" />
import { Api, TelegramClient } from 'telegram';
import { NewMessageEvent } from 'telegram/events';
import { TotalList } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { ContentFilter } from '../../interfaces/telegram';
import { GroupOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
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
    archiveChat(id: bigInt.BigInteger, accessHash: bigInt.BigInteger): Promise<Api.TypeUpdates>;
    private createOrJoinChannel;
    forwardMedia(channel: string, fromChatId: string): Promise<void>;
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
    getDialogs(params: IterDialogsParams): Promise<TotalList<import("telegram/tl/custom/dialog").Dialog>>;
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
    getCallLogsInternal(): Promise<{}>;
    handleEvents(event: NewMessageEvent): Promise<void>;
    updatePrivacyforDeletedAccount(): Promise<void>;
    updateProfile(firstName: string, about: string): Promise<void>;
    downloadProfilePic(photoIndex: number): Promise<string>;
    getLastActiveTime(): Promise<string>;
    getContacts(): Promise<Api.contacts.TypeContacts>;
    deleteChat(chatId: string): Promise<void>;
    blockUser(chatId: string): Promise<void>;
    getMediaMetadata(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }): Promise<{
        messages: number[];
        total: number;
        hasMore: boolean;
        lastOffsetId: number;
    }>;
    downloadMediaFile(messageId: number, chatId: string, res: any): Promise<any>;
    private downloadWithTimeout;
    private getMediaDetails;
    private downloadFileFromUrl;
    forwardMessage(toChatId: string, fromChatId: string, messageId: number): Promise<void>;
    updateUsername(baseUsername: any): Promise<string>;
    updatePrivacy(): Promise<void>;
    sendViewOnceMedia(chatId: string, buffer: Buffer, caption?: string, isVideo?: boolean, filename?: string): Promise<Api.TypeUpdates>;
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
        username?: string;
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
    }): Promise<boolean>;
    getSessionInfo(): Promise<{
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
    terminateSession(options: {
        hash: string;
        type: 'app' | 'web';
        exceptCurrent?: boolean;
    }): Promise<boolean>;
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
    private getMediaExtension;
    setContentFilters(filters: ContentFilter): Promise<void>;
    private evaluateMessage;
    private executeFilterAction;
    private getSearchFilter;
    private getMediaType;
    private getEntityId;
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
        chatId?: string;
        query?: string;
        types?: ('all' | 'text' | 'photo' | 'video' | 'voice' | 'document' | "roundVideo")[];
        minId?: number;
        maxId?: number;
        limit?: number;
    }): Promise<{
        video?: {
            messages: number[];
            total: number;
        };
        photo?: {
            messages: number[];
            total: number;
        };
        document?: {
            messages: number[];
            total: number;
        };
        voice?: {
            messages: number[];
            total: number;
        };
        text?: {
            messages: number[];
            total: number;
        };
        all?: {
            messages: number[];
            total: number;
        };
        roundVideo?: {
            messages: number[];
            total: number;
        };
    }>;
    getAllMediaMetaData(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice')[];
        startDate?: Date;
        endDate?: Date;
        maxId?: number;
        minId?: number;
    }): Promise<{
        messages: any[];
        total: number;
    }>;
    getFilteredMedia(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice')[];
        startDate?: Date;
        endDate?: Date;
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
                size: bigInt.BigInteger;
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
    safeGetEntity(entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null>;
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
    sendMediaBatch(options: {
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
    private getMimeType;
    private getMediaAttributes;
    editMessage(options: {
        chatId: string;
        messageId: number;
        text?: string;
        media?: {
            type: 'photo' | 'video' | 'document';
            url: string;
        };
    }): Promise<Api.TypeUpdates>;
    getChats(options: {
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
    updateChatSettings(settings: {
        chatId: string;
        username?: string;
        title?: string;
        about?: string;
        photo?: string;
        slowMode?: number;
        linkedChat?: string;
        defaultSendAs?: string;
    }): Promise<boolean>;
    getMessageStats(options: {
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
    getTopPrivateChats(): Promise<Array<{
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
    }>>;
    createGroupOrChannel(options: GroupOptions): Promise<Api.TypeUpdates>;
    createBot(options: {
        name: string;
        username: string;
        description?: string;
        aboutText?: string;
        profilePhotoUrl?: string;
    }): Promise<{
        botToken: string;
        username: string;
    }>;
}
export default TelegramManager;
