/// <reference types="node" />
import { Api, TelegramClient } from 'telegram';
import { NewMessageEvent } from 'telegram/events';
import { TotalList } from 'telegram/Helpers';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { BackupOptions, ContentFilter } from '../../interfaces/telegram';
import { MediaAlbumOptions, GroupOptions } from '../../interfaces/telegram';
interface MessageScheduleOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
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
    getDialogs(params: IterDialogsParams): Promise<{
        id: string;
        title: string;
    }[]>;
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
    forwardMessage(chatId: string, messageId: number): Promise<void>;
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
    private downloadFileFromUrl;
    private getEntityId;
    downloadBackup(options: BackupOptions): Promise<{
        messagesCount: number;
        mediaCount: number;
        outputPath: string;
        totalSize: number;
        backupId: string;
    }>;
}
export default TelegramManager;
