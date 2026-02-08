import { UsersService } from '../users/users.service';
import { OnModuleDestroy } from '@nestjs/common';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { EntityLike } from 'telegram/define';
import { ChannelInfo } from './types/telegram-responses';
import { ChatStatistics, GroupOptions, MessageScheduleOptions } from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
import { SearchMessagesDto } from './dto/message-search.dto';
import { CreateTgBotDto } from './dto/create-bot.dto';
import { Api } from 'telegram';
import { ConnectionStatusDto, GetClientOptionsDto } from './dto/connection-management.dto';
import { ActiveChannel } from '../active-channels';
import { SendTgMessageDto } from './dto/send-message.dto';
export declare class TelegramService implements OnModuleDestroy {
    private usersService;
    private activeChannelsService;
    private channelsService;
    private readonly logger;
    constructor(usersService: UsersService, activeChannelsService: ActiveChannelsService, channelsService: ChannelsService);
    onModuleDestroy(): Promise<void>;
    getActiveClientSetup(): import("./TelegramManager").ActiveClientSetup;
    setActiveClientSetup(data: {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    } | undefined): void;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<Api.Message>>;
    getMessagesNew(mobile: string, username: string, offset: number, limit: number): Promise<import("./TelegramManager").MessageItem[]>;
    sendInlineMessage(mobile: string, chatId: string, message: string, url: string): Promise<Api.Message>;
    getChatId(mobile: string, username: string): Promise<Api.TypeInputPeer>;
    getLastActiveTime(mobile: string): Promise<string>;
    tryJoiningChannel(mobile: string, chatEntity: Channel | ActiveChannel): Promise<void>;
    removeChannels(error: any, channelId: string, username: string, mobile: string): Promise<void>;
    getGrpMembers(mobile: string, entity: EntityLike): Promise<import("./TelegramManager").GroupMember[]>;
    addContact(mobile: string, data: {
        mobile: string;
        tgId: string;
    }[], prefix: string): Promise<void>;
    addContacts(mobile: string, phoneNumbers: string[], prefix: string): Promise<void>;
    getSelfMsgsInfo(mobile: string, limit?: number): Promise<import("./TelegramManager").SelfMessagesInfo>;
    createGroup(mobile: string): Promise<import("./TelegramManager").GroupCreationResult>;
    forwardMedia(mobile: string, channel: string, fromChatId: string): Promise<string>;
    forwardMediaToBot(mobile: string, fromChatId: string): Promise<string>;
    blockUser(mobile: string, chatId: string): Promise<void>;
    joinChannel(mobile: string, channelId: string): Promise<Api.TypeUpdates>;
    getCallLog(mobile: string, maxCalls?: number): Promise<Record<string, import("./TelegramManager").CallHistoryEntry[]>>;
    getmedia(mobile: string): Promise<Api.messages.Messages>;
    getChannelInfo(mobile: string, sendIds?: boolean): Promise<ChannelInfo>;
    getMe(mobile: string): Promise<Api.User>;
    getEntity(mobile: string, entity: EntityLike): Promise<Api.User | Api.Chat | Api.Channel>;
    createNewSession(mobile: string): Promise<string>;
    set2Fa(mobile: string): Promise<string>;
    updatePrivacyforDeletedAccount(mobile: string): Promise<void>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    downloadProfilePic(mobile: string, index: number): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    updateUsernameForAClient(mobile: string, clientId: string, clientName: string, currentUsername: string): Promise<string>;
    getMediaMetadata(mobile: string, params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }): Promise<import("./TelegramManager").MediaListResponse>;
    getMediaFileDownloadInfo(mobile: string, messageId: number, chatId: string): Promise<import("./TelegramManager").MediaFileDownloadInfo>;
    streamMediaFile(mobile: string, fileLocation: any, offset?: bigInt.BigInteger, limit?: number, requestSize?: number): AsyncGenerator<Buffer<ArrayBufferLike>, void, any>;
    getThumbnail(mobile: string, messageId: number, chatId: string): Promise<import("./TelegramManager").ThumbnailResult>;
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
    updateNameandBio(mobile: string, firstName?: string, about?: string): Promise<void>;
    getConnectionStatus(): Promise<{
        activeConnections: number;
        rateLimited: number;
        totalOperations: number;
    }>;
    forwardBulkMessages(mobile: string, fromChatId: string, toChatId: string, messageIds: number[]): Promise<number>;
    getAuths(mobile: string): Promise<any>;
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
    scheduleMessage(mobile: string, options: MessageScheduleOptions): Promise<Api.Message | Api.TypeUpdates>;
    getScheduledMessages(mobile: string, chatId: string): Promise<import("./TelegramManager").ScheduledMessageItem[]>;
    sendMediaAlbum(mobile: string, album: MediaAlbumOptions): Promise<import("./TelegramManager").AlbumSendResult>;
    sendMessage(mobile: string, params: SendTgMessageDto): Promise<Api.Message>;
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
    getGroupAdmins(mobile: string, groupId: string): Promise<import("./TelegramManager").AdminInfo[]>;
    getGroupBannedUsers(mobile: string, groupId: string): Promise<import("./TelegramManager").BannedUserInfo[]>;
    searchMessages(mobile: string, params: SearchMessagesDto): Promise<import("./dto/message-search.dto").SearchMessagesResponseDto>;
    getFilteredMedia(mobile: string, params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }): Promise<import("./TelegramManager").FilteredMediaListResponse>;
    exportContacts(mobile: string, format: 'vcard' | 'csv', includeBlocked?: boolean): Promise<string>;
    importContacts(mobile: string, contacts: {
        firstName: string;
        lastName?: string;
        phone: string;
    }[]): Promise<import("./TelegramManager").ImportContactResult[]>;
    manageBlockList(mobile: string, userIds: string[], block: boolean): Promise<import("./TelegramManager").BlockListResult[]>;
    getContactStatistics(mobile: string): Promise<import("./TelegramManager").ContactStats>;
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
        options: Record<string, boolean>;
    }>;
    getChatFolders(mobile: string): Promise<import("./TelegramManager").ChatFolder[]>;
    getSessionInfo(mobile: string): Promise<import("./TelegramManager").SessionInfo>;
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
    getDialogs(mobile: string, options: {
        limit?: number;
        offsetDate?: number;
        folderId?: number;
        archived?: boolean;
        peerType?: 'all' | 'user' | 'group' | 'channel';
        ignorePinned?: boolean;
        includePhotos?: boolean;
    }): Promise<import("./TelegramManager").ChatListResult>;
    getFileUrl(mobile: string, url: string, filename: string): Promise<string>;
    getMessageStats(mobile: string, options: {
        chatId: string;
        period: 'day' | 'week' | 'month';
        fromDate?: Date;
    }): Promise<import("./TelegramManager").MessageStats>;
    getChatMediaCounts(mobile: string, chatId: string): Promise<import("./TelegramManager").ChatMediaCounts>;
    getChatCallHistory(mobile: string, chatId: string, limit?: number, includeCalls?: boolean): Promise<import("./TelegramManager").ChatCallHistory>;
    sendViewOnceMedia(mobile: string, options: {
        chatId: string;
        sourceType: 'path' | 'base64' | 'binary';
        path?: string;
        base64Data?: string;
        binaryData?: Buffer;
        caption?: string;
        filename?: string;
    }): Promise<Api.TypeUpdates>;
    getTopPrivateChats(mobile: string, limit?: number, enrichMedia?: boolean, offsetDate?: number): Promise<import("./TelegramManager").TopPrivateChatsResult>;
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
    createBot(mobile: string, createBotDto: CreateTgBotDto): Promise<import("./TelegramManager").BotCreationResult>;
    connect(mobile: string, options?: GetClientOptionsDto): Promise<void>;
    disconnect(mobile: string): Promise<void>;
    disconnectAll(): Promise<void>;
    getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnected: number;
        error: number;
    };
    getClientState(mobile: string): ConnectionStatusDto | undefined;
    getActiveConnectionCount(): number;
}
