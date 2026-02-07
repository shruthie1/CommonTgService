import { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import { TelegramLogger } from '../utils/telegram-logger';
import bigInt from 'big-integer';
export interface TgContext {
    client: TelegramClient;
    phoneNumber: string;
    logger: TelegramLogger;
}
export interface ActiveClientSetup {
    days?: number;
    archiveOld: boolean;
    formalities: boolean;
    newMobile: string;
    existingMobile: string;
    clientId: string;
}
export interface GroupCreationResult {
    id: bigInt.BigInteger;
    accessHash: bigInt.BigInteger;
}
export interface ForwardResult {
    forwardedCount: number;
}
export interface CallLogEntry {
    messageId: number;
    date: number;
    durationSeconds: number;
    video: boolean;
    outgoing: boolean;
}
export interface CallLogChat {
    chatId: string;
    phone?: string;
    username?: string;
    name: string;
    peerType: 'user' | 'group' | 'channel';
    calls: {
        total: number;
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
    };
    totalMessages?: number;
    photoCount?: number;
    videoCount?: number;
    callLog?: CallLogEntry[];
}
export interface CallLogResult {
    totalCalls: number;
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
    chats: CallLogChat[];
}
export interface SelfMessagesInfo {
    photoCount: number;
    videoCount: number;
    movieCount: number;
    total: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    analyzedMessages: number;
}
export interface MediaMetadataItem {
    messageId: number;
    chatId: string;
    type: string;
    date: number;
    caption: string;
    fileSize?: number;
    mimeType?: string;
    filename?: string;
    width?: number;
    height?: number;
    duration?: number;
}
export interface FilteredMediaItem extends MediaMetadataItem {
    thumbnail?: string;
    mediaDetails?: DocumentMediaDetails;
}
export interface DocumentMediaDetails {
    size: bigInt.BigInteger | number;
    mimeType: string;
    fileName: string | null;
    duration: number | null;
    width: number | null;
    height: number | null;
}
export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    nextMaxId?: number;
    prevMaxId?: number;
    firstMessageId?: number;
    lastMessageId?: number;
}
export interface MediaGroupResult {
    type: string;
    count: number;
    items: MediaMetadataItem[];
    pagination: PaginationInfo;
}
export interface MediaListResponse {
    data?: MediaMetadataItem[];
    groups?: MediaGroupResult[];
    pagination: PaginationInfo;
    filters: MediaFilterInfo;
}
export interface FilteredMediaListResponse {
    data?: FilteredMediaItem[];
    groups?: FilteredMediaGroupResult[];
    pagination: PaginationInfo;
    filters: MediaFilterInfo;
}
export interface FilteredMediaGroupResult {
    type: string;
    count: number;
    items: FilteredMediaItem[];
    pagination: PaginationInfo;
}
export interface MediaFilterInfo {
    chatId: string;
    types: string[];
    startDate?: string;
    endDate?: string;
}
export interface ThumbnailResult {
    buffer: Buffer;
    etag: string;
    contentType: string;
    filename: string;
}
export interface MediaFileDownloadInfo {
    fileLocation: Api.TypeInputFileLocation;
    contentType: string;
    filename: string;
    fileSize: number;
    etag: string;
    inputLocation: Api.Photo | Api.Document;
}
export interface MediaFileInfo {
    contentType: string;
    filename: string;
    fileLocation: Api.TypeInputFileLocation;
    fileSize: number;
    inputLocation: Api.Photo | Api.Document;
}
export interface SessionInfo {
    sessions: AppSession[];
    webSessions: WebSession[];
}
export interface AppSession {
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
}
export interface WebSession {
    hash: string;
    domain: string;
    browser: string;
    platform: string;
    dateCreated: Date;
    dateActive: Date;
    ip: string;
    region: string;
}
export interface ChatListItem {
    id: string;
    title: string | null;
    username: string | null;
    type: 'user' | 'group' | 'channel' | 'unknown';
    unreadCount: number;
    lastMessage: {
        id: number;
        text: string;
        date: string;
        senderName: string | null;
    } | null;
    photoBase64: string | null;
    onlineStatus: string | null;
    lastSeen: string | null;
    isMuted: boolean;
    participantCount: number | null;
}
export interface GroupMember {
    tgId: bigInt.BigInteger;
    name: string;
    username: string;
}
export interface AdminInfo {
    userId: string;
    rank?: string;
    permissions: AdminPermissions;
}
export interface AdminPermissions {
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
}
export interface BannedUserInfo {
    userId: string;
    bannedRights: BannedRights;
}
export interface BannedRights {
    viewMessages: boolean;
    sendMessages: boolean;
    sendMedia: boolean;
    sendStickers: boolean;
    sendGifs: boolean;
    sendGames: boolean;
    sendInline: boolean;
    embedLinks: boolean;
    untilDate: number;
}
export interface ContactStats {
    total: number;
    online: number;
    withPhone: number;
    mutual: number;
    lastWeekActive: number;
}
export interface ImportContactResult {
    success: boolean;
    phone: string;
    error?: string;
}
export interface BlockListResult {
    success: boolean;
    userId: string;
    error?: string;
}
export interface ChatFolder {
    id: number;
    title: string;
    includedChatsCount: number;
    excludedChatsCount: number;
}
export interface ChatStatistics {
    period: 'day' | 'week' | 'month';
    totalMessages: number;
    uniqueSenders: number;
    messageTypes: MessageTypeCounts;
    topSenders: TopSenderInfo[];
    mostActiveHours: Array<{
        hour: number;
        count: number;
    }>;
}
export interface MessageTypeCounts {
    text: number;
    photo: number;
    video: number;
    voice: number;
    other: number;
}
export interface MessageStats {
    total: number;
    withMedia: number;
    withLinks: number;
    withForwards: number;
    byHour: number[];
    byType: Record<string, number>;
}
export interface TopPrivateChat {
    chatId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    totalMessages: number;
    interactionScore: number;
    engagementLevel: 'recent' | 'active' | 'dormant';
    lastActivityDays: number;
    calls: CallBreakdown;
    media: MediaBreakdown;
    activityBreakdown: ActivityBreakdown;
}
export interface CallBreakdown {
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
}
export interface MediaBreakdown {
    photos: number;
    videos: number;
    photosByUs: number;
    photosByThem: number;
    videosByUs: number;
    videosByThem: number;
}
export interface ActivityBreakdown {
    videoCalls: number;
    audioCalls: number;
    mediaSharing: number;
    textMessages: number;
}
export interface EngagementWeights {
    videoCall: number;
    incomingCall: number;
    outgoingCall: number;
    sharedVideo: number;
    sharedPhoto: number;
    textMessage: number;
    unreadMessages: number;
}
export interface PerChatCallStats {
    outgoing: number;
    incoming: number;
    video: number;
    total: number;
}
export interface MessageScheduleOptions {
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
export type PrivacyLevel = 'everybody' | 'contacts' | 'nobody';
export interface PrivacyBatchSettings {
    phoneNumber?: PrivacyLevel;
    lastSeen?: PrivacyLevel;
    profilePhotos?: PrivacyLevel;
    forwards?: PrivacyLevel;
    calls?: PrivacyLevel;
    groups?: PrivacyLevel;
}
export interface BotCreationResult {
    botToken: string;
    username: string;
}
export interface AlbumSendResult {
    success: number;
    failed: number;
    errors?: Array<{
        index: number;
        error: string;
    }>;
}
export interface MediaQueryParams {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    maxId?: number;
    minId?: number;
}
export interface CleanupOptions {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
    revoke?: boolean;
}
export interface EditMessageOptions {
    chatId: string;
    messageId: number;
    text?: string;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}
export interface MediaBatchOptions {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video' | 'document';
        url: string;
        caption?: string;
        fileName?: string;
    }>;
    silent?: boolean;
    scheduleDate?: number;
}
export interface ChatSettingsUpdate {
    chatId: string;
    username?: string;
    title?: string;
    about?: string;
    photo?: string;
    slowMode?: number;
    linkedChat?: string;
    defaultSendAs?: string;
}
export interface GroupSettingsUpdate {
    groupId: string;
    title?: string;
    description?: string;
    slowMode?: number;
    memberRestrictions?: Record<string, boolean>;
    username?: string;
}
export interface TerminateSessionOptions {
    hash: string;
    type: 'app' | 'web';
    exceptCurrent?: boolean;
}
export interface DeleteChatParams {
    peer: string | Api.TypeInputPeer;
    maxId?: number;
    justClear?: boolean;
    revoke?: boolean;
    minDate?: number;
    maxDate?: number;
}
export interface BotCreationOptions {
    name: string;
    username: string;
    description?: string;
    aboutText?: string;
    profilePhotoUrl?: string;
}
export interface ChatFolderCreateOptions {
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
}
export interface VoiceMessageOptions {
    chatId: string;
    url: string;
    duration?: number;
    caption?: string;
}
export interface SenderInfo {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    phone: string | null;
    isSelf: boolean;
    peerType: 'user' | 'group' | 'channel' | 'unknown';
}
export interface MediaInfo {
    type: string;
    thumbnail: string | null;
    mimeType: string | null;
    fileName: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
    duration: number | null;
}
export interface MessageReactionItem {
    reaction: string;
    count: number;
}
export interface MessageItem {
    id: number;
    text: string;
    date: string;
    time: string;
    dateUnix: number;
    senderId: string;
    media: MediaInfo | null;
    isEdited: boolean;
    editDate: string | null;
    isPinned: boolean;
    isForwarded: boolean;
    forwardedFrom: string | null;
    replyToMessageId: number | null;
    groupedId: string | null;
    views: number | null;
    forwards: number | null;
    reactions: MessageReactionItem[] | null;
}
export interface ScheduledMessageItem {
    id: number;
    text: string;
    scheduledDate: string;
    media: MediaInfo | null;
    chatId: string;
}
export interface TopSenderInfo {
    id: string;
    name: string;
    username: string | null;
    count: number;
}
export interface SearchMessageItem {
    id: number;
    text: string;
    date: string;
    chatId: string;
    senderName: string | null;
    mediaType: string | null;
}
