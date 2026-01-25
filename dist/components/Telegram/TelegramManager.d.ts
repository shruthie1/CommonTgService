import { Api, TelegramClient } from 'telegram';
import { NewMessageEvent } from 'telegram/events';
import { TotalList } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { GroupOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
import { SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
import { SendTgMessageDto } from './dto/send-message.dto';
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
    private logger;
    private session;
    phoneNumber: string;
    client: TelegramClient | null;
    apiId: number;
    apiHash: string;
    private timeoutErr;
    private static activeClientSetup;
    private readonly MAX_FILE_SIZE;
    private readonly FILE_DOWNLOAD_TIMEOUT;
    private readonly TEMP_FILE_CLEANUP_DELAY;
    private readonly THUMBNAIL_CONCURRENCY_LIMIT;
    private readonly THUMBNAIL_BATCH_DELAY_MS;
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
    forwardMediaToBot(fromChatId: string): Promise<void>;
    forwardSecretMsgs(fromChatId: string, toChatId: string): Promise<void>;
    forwardMessages(fromChatId: string, toChatId: string, messageIds: number[]): Promise<number>;
    destroy(): Promise<void>;
    getchatId(username: string): Promise<any>;
    getMe(): Promise<Api.User>;
    clearTimeoutErr(): void;
    errorHandler(error: any): Promise<void>;
    createClient(handler?: boolean, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient>;
    getGrpMembers(entity: EntityLike): Promise<any[]>;
    getMessages(entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
    getDialogs(params: IterDialogsParams): Promise<any[] & {
        total: number;
    }>;
    getSelfMSgsInfo(limit?: number): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
        ownPhotoCount: number;
        otherPhotoCount: number;
        ownVideoCount: number;
        otherVideoCount: number;
        analyzedMessages: number;
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
    private getThumbnailBuffer;
    private getMessageWithMedia;
    private getMediaFileInfo;
    sendInlineMessage(chatId: string, message: string, url: string): Promise<Api.Message>;
    getMediaMessages(): Promise<Api.messages.Messages>;
    getCallLog(limit?: number): Promise<{
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
        chatCallCounts: Array<{
            chatId: string;
            phone?: string;
            username?: string;
            name: string;
            count: number;
            msgs?: number;
            video?: number;
            photo?: number;
            peerType: 'user' | 'group' | 'channel';
        }>;
        totalCalls: number;
        analyzedCalls: number;
    }>;
    getCallLogsInternal(): Promise<Record<string, {
        outgoing: number;
        incoming: number;
        video: number;
        totalCalls: number;
    }>>;
    handleEvents(event: NewMessageEvent): Promise<void>;
    updatePrivacyforDeletedAccount(): Promise<void>;
    updateProfile(firstName: string, about: string): Promise<void>;
    downloadProfilePic(photoIndex: number): Promise<string>;
    getLastActiveTime(): Promise<string>;
    getContacts(): Promise<Api.contacts.TypeContacts>;
    deleteChat(params: {
        peer: string | Api.TypeInputPeer;
        maxId?: number;
        justClear?: boolean;
        revoke?: boolean;
        minDate?: number;
        maxDate?: number;
    }): Promise<void>;
    blockUser(chatId: string): Promise<void>;
    getMediaMetadata(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }): Promise<{
        groups: {
            type: "document" | "video" | "photo" | "voice";
            count: number;
            items: {
                messageId: number;
                chatId: string;
                type: "document" | "video" | "photo";
                date: number;
                caption: string;
                fileSize: number;
                mimeType: string;
                filename: string;
                width: number;
                height: number;
                duration: number;
                mediaDetails: any;
            }[];
            pagination: {
                page: number;
                limit: number;
                total: number;
                totalPages: number;
                hasMore: boolean;
                nextMaxId: number;
                firstMessageId: number;
                lastMessageId: number;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
            nextMaxId: number;
            prevMaxId: number;
            firstMessageId: number;
            lastMessageId: number;
        };
        filters: {
            chatId: string;
            types: string[];
            startDate: string;
            endDate: string;
        };
        data?: undefined;
    } | {
        data: {
            messageId: number;
            chatId: string;
            type: "document" | "video" | "photo";
            date: number;
            caption: string;
            fileSize: number;
            mimeType: string;
            filename: string;
            width: number;
            height: number;
            duration: number;
            mediaDetails: any;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
            nextMaxId: number;
            prevMaxId: number;
            firstMessageId: number;
            lastMessageId: number;
        };
        filters: {
            chatId: string;
            types: ("document" | "video" | "photo" | "voice")[];
            startDate: string;
            endDate: string;
        };
        groups?: undefined;
    }>;
    getThumbnail(messageId: number, chatId?: string): Promise<{
        buffer: Buffer;
        etag: string;
        contentType: string;
        filename: string;
    }>;
    getMediaFileDownloadInfo(messageId: number, chatId?: string): Promise<{
        fileLocation: Api.TypeInputFileLocation;
        contentType: string;
        filename: string;
        fileSize: number;
        etag: string;
        inputLocation: Api.Photo | Api.Document;
    }>;
    streamMediaFile(fileLocation: Api.TypeInputFileLocation, offset?: bigInt.BigInteger, limit?: number, requestSize?: number): AsyncGenerator<Buffer>;
    private downloadWithTimeout;
    private processWithConcurrencyLimit;
    private getMediaDetails;
    private downloadFileFromUrl;
    private detectContentType;
    private generateETag;
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
    sendMediaAlbum(album: MediaAlbumOptions): Promise<{
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 3809980286;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdatesTooLong";
        originalArgs: void;
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 826001400;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdateShortMessage";
        out?: boolean;
        mentioned?: boolean;
        mediaUnread?: boolean;
        silent?: boolean;
        id: Api.int;
        userId: Api.long;
        message: string;
        pts: Api.int;
        ptsCount: Api.int;
        date: Api.int;
        fwdFrom?: Api.TypeMessageFwdHeader;
        viaBotId?: Api.long;
        replyTo?: Api.TypeMessageReplyHeader;
        entities?: Api.TypeMessageEntity[];
        ttlPeriod?: Api.int;
        originalArgs: {
            out?: boolean;
            mentioned?: boolean;
            mediaUnread?: boolean;
            silent?: boolean;
            id: Api.int;
            userId: Api.long;
            message: string;
            pts: Api.int;
            ptsCount: Api.int;
            date: Api.int;
            fwdFrom?: Api.TypeMessageFwdHeader;
            viaBotId?: Api.long;
            replyTo?: Api.TypeMessageReplyHeader;
            entities?: Api.TypeMessageEntity[];
            ttlPeriod?: Api.int;
        };
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 1299050149;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdateShortChatMessage";
        out?: boolean;
        mentioned?: boolean;
        mediaUnread?: boolean;
        silent?: boolean;
        id: Api.int;
        fromId: Api.long;
        chatId: Api.long;
        message: string;
        pts: Api.int;
        ptsCount: Api.int;
        date: Api.int;
        fwdFrom?: Api.TypeMessageFwdHeader;
        viaBotId?: Api.long;
        replyTo?: Api.TypeMessageReplyHeader;
        entities?: Api.TypeMessageEntity[];
        ttlPeriod?: Api.int;
        originalArgs: {
            out?: boolean;
            mentioned?: boolean;
            mediaUnread?: boolean;
            silent?: boolean;
            id: Api.int;
            fromId: Api.long;
            chatId: Api.long;
            message: string;
            pts: Api.int;
            ptsCount: Api.int;
            date: Api.int;
            fwdFrom?: Api.TypeMessageFwdHeader;
            viaBotId?: Api.long;
            replyTo?: Api.TypeMessageReplyHeader;
            entities?: Api.TypeMessageEntity[];
            ttlPeriod?: Api.int;
        };
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 2027216577;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdateShort";
        update: Api.TypeUpdate;
        date: Api.int;
        originalArgs: {
            update: Api.TypeUpdate;
            date: Api.int;
        };
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 1918567619;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdatesCombined";
        updates: Api.TypeUpdate[];
        users: Api.TypeUser[];
        chats: Api.TypeChat[];
        date: Api.int;
        seqStart: Api.int;
        seq: Api.int;
        originalArgs: {
            updates: Api.TypeUpdate[];
            users: Api.TypeUser[];
            chats: Api.TypeChat[];
            date: Api.int;
            seqStart: Api.int;
            seq: Api.int;
        };
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 1957577280;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "Updates";
        updates: Api.TypeUpdate[];
        users: Api.TypeUser[];
        chats: Api.TypeChat[];
        date: Api.int;
        seq: Api.int;
        originalArgs: {
            updates: Api.TypeUpdate[];
            users: Api.TypeUser[];
            chats: Api.TypeChat[];
            date: Api.int;
            seq: Api.int;
        };
    } | {
        success: number;
        failed: number;
        errors: {
            index: number;
            error: string;
        }[];
        CONSTRUCTOR_ID: 2417352961;
        SUBCLASS_OF_ID: 2331323052;
        classType: "constructor";
        className: "UpdateShortSentMessage";
        out?: boolean;
        id: Api.int;
        pts: Api.int;
        ptsCount: Api.int;
        date: Api.int;
        media?: Api.TypeMessageMedia;
        entities?: Api.TypeMessageEntity[];
        ttlPeriod?: Api.int;
        originalArgs: {
            out?: boolean;
            id: Api.int;
            pts: Api.int;
            ptsCount: Api.int;
            date: Api.int;
            media?: Api.TypeMessageMedia;
            entities?: Api.TypeMessageEntity[];
            ttlPeriod?: Api.int;
        };
    }>;
    sendMessage(params: SendTgMessageDto): Promise<Api.Message>;
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
        revoke?: boolean;
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
        period: "day" | "week" | "month";
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
    searchMessages(params: SearchMessagesDto): Promise<SearchMessagesResponseDto>;
    getAllMediaMetaData(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        maxId?: number;
        minId?: number;
    }): Promise<{
        groups: {
            type: "document" | "video" | "photo" | "voice";
            count: any;
            items: any;
            pagination: {
                page: number;
                limit: any;
                total: any;
                totalPages: number;
                hasMore: boolean;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
        };
        filters: {
            chatId: string;
            types: string[];
            startDate: string;
            endDate: string;
        };
        data?: undefined;
    } | {
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
        };
        filters: {
            chatId: string;
            types: ("document" | "video" | "photo" | "voice")[];
            startDate: string;
            endDate: string;
        };
        groups?: undefined;
    }>;
    getFilteredMedia(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }): Promise<{
        groups: {
            type: "document" | "video" | "photo" | "voice";
            count: number;
            items: {
                messageId: number;
                chatId: string;
                type: "document" | "video" | "photo";
                date: number;
                caption: string;
                thumbnail: string;
                fileSize: number;
                mimeType: string;
                filename: string;
                width: number;
                height: number;
                duration: number;
                mediaDetails: {
                    size: bigInt.BigInteger;
                    mimeType: string;
                    fileName: string;
                    duration: number;
                    width: number;
                    height: number;
                };
            }[];
            pagination: {
                page: number;
                limit: number;
                total: number;
                totalPages: number;
                hasMore: boolean;
                nextMaxId: number;
                firstMessageId: number;
                lastMessageId: number;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
            nextMaxId: number;
            prevMaxId: number;
            firstMessageId: number;
            lastMessageId: number;
        };
        filters: {
            chatId: string;
            types: string[];
            startDate: string;
            endDate: string;
        };
        data?: undefined;
    } | {
        data: {
            messageId: number;
            chatId: string;
            type: "document" | "video" | "photo";
            date: number;
            caption: string;
            thumbnail: string;
            fileSize: number;
            mimeType: string;
            filename: string;
            width: number;
            height: number;
            duration: number;
            mediaDetails: {
                size: bigInt.BigInteger;
                mimeType: string;
                fileName: string;
                duration: number;
                width: number;
                height: number;
            };
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            hasMore: boolean;
            nextMaxId: number;
            prevMaxId: number;
            firstMessageId: number;
            lastMessageId: number;
        };
        filters: {
            chatId: string;
            types: ("document" | "video" | "photo" | "voice")[];
            startDate: string;
            endDate: string;
        };
        groups?: undefined;
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
        id: any;
        title: any;
        username: any;
        type: string;
        unreadCount: any;
        lastMessage: {
            id: any;
            text: any;
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
    getTopPrivateChats(limit?: number): Promise<Array<{
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
    }>>;
    private analyzeChatEngagement;
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
    private createVCardContent;
    sendContactsFile(chatId: string, contacts: Api.contacts.Contacts, filename?: string): Promise<void>;
}
export default TelegramManager;
