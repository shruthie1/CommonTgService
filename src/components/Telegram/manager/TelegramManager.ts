    import { Api, TelegramClient } from 'telegram';
    import { StringSession } from 'telegram/sessions';
    import { NewMessageEvent } from 'telegram/events';
    import { TotalList } from 'telegram/Helpers';
    import bigInt from 'big-integer';
    import { EntityLike } from 'telegram/define';
    import { TgContext, ActiveClientSetup, GroupCreationResult, GroupMember, PaginatedGroupMembers, AdminInfo, BannedUserInfo, SessionInfo, ThumbnailResult, MediaFileDownloadInfo, MediaListResponse, FilteredMediaListResponse, MediaQueryParams, SelfMessagesInfo, TopPrivateChat, TopPrivateChatsResult, ChatStatistics, MessageStats, ChatListResult, ContactStats, ImportContactResult, BlockListResult, ChatFolder, PrivacyBatchSettings, MessageScheduleOptions, EditMessageOptions, MediaBatchOptions, AlbumSendResult, VoiceMessageOptions, BotCreationResult, ChatSettingsUpdate, GroupSettingsUpdate, TerminateSessionOptions, DeleteChatParams, BotCreationOptions, ChatFolderCreateOptions, ForwardResult, MessageItem, PaginatedMessages, ChatMediaCounts, ChatCallHistory, CallHistoryEntry, PerChatCallStats, MediaAlbumOptions, GroupOptions } from './types';
    import { SearchMessagesDto, SearchMessagesResponseDto } from '../dto/message-search.dto';
    import { SendTgMessageDto } from '../dto/send-message.dto';
    import { TelegramLogger } from '../utils/telegram-logger';

    // Domain operation imports
    import * as clientOps from './client-operations';
    import * as messageOps from './message-operations';
    import * as mediaOps from './media-operations';
    import * as channelOps from './channel-operations';
    import * as contactOps from './contact-operations';
    import * as profileOps from './profile-operations';
    import * as authOps from './auth-operations';
    import * as chatOps from './chat-operations';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { Dialog } from 'telegram/tl/custom/dialog';

    class TelegramManager {
        private logger = new TelegramLogger('TgManager');
        private session: StringSession;
        public phoneNumber: string;
        public client: TelegramClient | null;
        public apiId: number;
        public apiHash: string;
        private timeoutErr: NodeJS.Timeout = null;
        private static activeClientSetup: ActiveClientSetup;

        constructor(sessionString: string, phoneNumber: string) {
            this.session = new StringSession(sessionString);
            this.phoneNumber = phoneNumber;
            this.client = null;
        }

        private get ctx(): TgContext {
            return {
                client: this.client,
                phoneNumber: this.phoneNumber,
                logger: this.logger,
            };
        }

        // ---- Static methods ----

        public static getActiveClientSetup(): ActiveClientSetup {
            return TelegramManager.activeClientSetup;
        }

        public static setActiveClientSetup(data: ActiveClientSetup | undefined): void {
            TelegramManager.activeClientSetup = data;
        }

        // ---- Client lifecycle ----

        clearTimeoutErr(): void {
            if (this.timeoutErr) {
                clearTimeout(this.timeoutErr);
                this.timeoutErr = null; // BUG FIX: was == (comparison) instead of = (assignment)
            }
        }

        async errorHandler(error: Error): Promise<void> {
            this.clearTimeoutErr();
            const result = clientOps.handleClientError(this.ctx, error);
            if (result) this.timeoutErr = result;
        }

        async createClient(handler: boolean = true, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient> {
            const { getCredentialsForMobile } = require('../../../utils');
            const tgCreds = await getCredentialsForMobile(this.phoneNumber);
            this.apiHash = tgCreds.apiHash;
            this.apiId = tgCreds.apiId;

            this.client = await clientOps.createClient(this.ctx, this.session, handler, handlerFn);
            return this.client;
        }

        async destroy(): Promise<void> {
            this.clearTimeoutErr();
            await clientOps.destroyClient(this.ctx, this.session);
            this.client = null;
        }

        connected(): boolean {
            return this.client.connected;
        }

        async connect(): Promise<void> {
            await this.client.connect();
        }

        // ---- Chat / Entity operations ----

        async getMe(): Promise<Api.User> {
            return chatOps.getMe(this.ctx);
        }

        async getchatId(username: string): Promise<Api.TypeInputPeer> {
            return chatOps.getchatId(this.ctx, username);
        }

        async getEntity(entity: EntityLike): Promise<Api.User | Api.Chat | Api.Channel> {
            return chatOps.getEntity(this.ctx, entity);
        }

        async getMessages(entityLike: Api.TypeEntityLike, limit: number = 8, offsetId: number = 0): Promise<PaginatedMessages> {
            return chatOps.getMessages(this.ctx, entityLike, limit, offsetId);
        }

        async getAllChats(): ReturnType<typeof chatOps.getAllChats> {
            return chatOps.getAllChats(this.ctx);
        }

        async getMessagesNew(chatId: string, offset: number = 0, limit: number = 20): Promise<PaginatedMessages> {
            return chatOps.getMessagesNew(this.ctx, chatId, offset, limit);
        }

        async safeGetEntity(entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null> {
            return chatOps.safeGetEntityById(this.ctx, entityId);
        }

        async getSelfMSgsInfo(limit: number = 500): Promise<SelfMessagesInfo> {
            return chatOps.getSelfMSgsInfo(this.ctx, limit);
        }

        async getCallLog(maxCalls: number = 1000): Promise<Record<string, CallHistoryEntry[]>> {
            return chatOps.getCallLog(this.ctx, maxCalls);
        }

        async getChatStatistics(chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics> {
            return chatOps.getChatStatistics(this.ctx, chatId, period);
        }

        async getMessageStats(options: { chatId: string; period: 'day' | 'week' | 'month'; fromDate?: Date }): Promise<MessageStats> {
            return chatOps.getMessageStats(this.ctx, options);
        }

        async getChatMediaCounts(chatId: string): Promise<ChatMediaCounts> {
            return chatOps.getChatMediaCounts(this.ctx, chatId);
        }

        async getChatCallHistory(chatId: string, limit?: number, includeCalls?: boolean): Promise<ChatCallHistory> {
            return chatOps.getChatCallHistory(this.ctx, chatId, limit, includeCalls);
        }

        async getCallLogStats(maxCalls: number = 10): Promise<{ totalCalls: number; outgoing: number; incoming: number; video: number; audio: number; chats: (PerChatCallStats & { chatId: string })[] }> {
            return chatOps.getCallLogStats(this.ctx, maxCalls);
        }

        async getDialogs(iterDialogsParams: IterDialogsParams): Promise<TotalList<Dialog>> {
            return await this.ctx.client.getDialogs(iterDialogsParams);
        }

        async getChats(options: { limit?: number; offsetDate?: number; folderId?: number; archived?: boolean; peerType?: 'all' | 'user' | 'group' | 'channel'; ignorePinned?: boolean; includePhotos?: boolean }): Promise<ChatListResult> {
            return chatOps.getChats(this.ctx, options);
        }

        async updateChatSettings(settings: ChatSettingsUpdate): Promise<boolean> {
            return chatOps.updateChatSettings(this.ctx, settings);
        }

        async getTopPrivateChats(limit?: number, enrichMedia?: boolean, offsetDate?: number): Promise<TopPrivateChatsResult> {
            return chatOps.getTopPrivateChats(this.ctx, limit, enrichMedia, offsetDate);
        }

        async createChatFolder(options: ChatFolderCreateOptions): Promise<{ id: number; name: string; options: Record<string, boolean> }> {
            return chatOps.createChatFolder(this.ctx, options);
        }

        async getChatFolders(): Promise<ChatFolder[]> {
            return chatOps.getChatFolders(this.ctx);
        }

        async createBot(options: BotCreationOptions): Promise<BotCreationResult> {
            return chatOps.createBot(this.ctx, options);
        }

        // ---- Message operations ----

        async sendMessage(params: SendTgMessageDto): Promise<Api.Message> {
            return messageOps.sendMessageToChat(this.ctx, params);
        }

        async sendInlineMessage(chatId: string, message: string, url: string): Promise<Api.Message> {
            return messageOps.sendInlineMessage(this.ctx, chatId, message, url);
        }

        async forwardSecretMsgs(fromChatId: string, toChatId: string): Promise<ForwardResult> {
            return messageOps.forwardSecretMsgs(this.ctx, fromChatId, toChatId);
        }

        async forwardMessages(fromChatId: string, toChatId: string, messageIds: number[]): Promise<number> {
            return messageOps.forwardMessages(this.ctx, fromChatId, toChatId, messageIds);
        }

        async forwardMessage(toChatId: string, fromChatId: string, messageId: number): Promise<void> {
            return messageOps.forwardMessage(this.ctx, toChatId, fromChatId, messageId);
        }

        async searchMessages(params: SearchMessagesDto): Promise<SearchMessagesResponseDto> {
            return messageOps.searchMessages(this.ctx, params);
        }

        async scheduleMessageSend(opts: MessageScheduleOptions): Promise<Api.Message | Api.TypeUpdates> {
            return messageOps.scheduleMessageSend(this.ctx, opts);
        }

        async getScheduledMessages(chatId: string): Promise<import('./types').ScheduledMessageItem[]> {
            return messageOps.getScheduledMessages(this.ctx, chatId);
        }

        async sendMediaAlbum(album: MediaAlbumOptions): Promise<AlbumSendResult> {
            return messageOps.sendMediaAlbum(this.ctx, album);
        }

        async sendVoiceMessage(voice: VoiceMessageOptions): Promise<Api.TypeUpdates> {
            return messageOps.sendVoiceMessage(this.ctx, voice);
        }

        async cleanupChat(cleanup: { chatId: string; beforeDate?: Date; onlyMedia?: boolean; excludePinned?: boolean; revoke?: boolean }): Promise<{ deletedCount: number }> {
            return messageOps.cleanupChat(this.ctx, cleanup);
        }

        async editMessage(options: EditMessageOptions): Promise<Api.TypeUpdates> {
            return messageOps.editMessage(this.ctx, options);
        }

        async sendMediaBatch(options: MediaBatchOptions): Promise<Api.TypeUpdates> {
            return messageOps.sendMediaBatch(this.ctx, options);
        }

        async sendViewOnceMedia(chatId: string, buffer: Buffer, caption?: string, isVideo?: boolean, filename?: string): Promise<Api.TypeUpdates> {
            return messageOps.sendViewOnceMedia(this.ctx, chatId, buffer, caption, isVideo, filename);
        }

        async sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void> {
            return messageOps.sendPhotoChat(this.ctx, id, url, caption, filename);
        }

        async sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void> {
            return messageOps.sendFileChat(this.ctx, id, url, caption, filename);
        }

        async deleteChat(params: DeleteChatParams): Promise<void> {
            return messageOps.deleteChat(this.ctx, params);
        }

        // ---- Media operations ----

        async getMediaUrl(message: Api.Message): Promise<string | Buffer> {
            return mediaOps.getMediaUrl(this.ctx, message);
        }

        async getMediaMessages(): Promise<Api.messages.Messages> {
            return mediaOps.getMediaMessages(this.ctx);
        }

        async getThumbnail(messageId: number, chatId: string = 'me'): Promise<ThumbnailResult> {
            return mediaOps.getThumbnail(this.ctx, messageId, chatId);
        }

        async getMediaFileDownloadInfo(messageId: number, chatId: string = 'me'): Promise<MediaFileDownloadInfo> {
            return mediaOps.getMediaFileDownloadInfo(this.ctx, messageId, chatId);
        }

        async *streamMediaFile(
            fileLocation: Api.TypeInputFileLocation,
            offset: bigInt.BigInteger = bigInt(0),
            limit: number = 5 * 1024 * 1024,
            requestSize: number = 512 * 1024
        ): AsyncGenerator<Buffer> {
            yield* mediaOps.streamMediaFile(this.ctx, fileLocation, offset, limit, requestSize);
        }

        async getMediaMetadata(params: MediaQueryParams): Promise<MediaListResponse> {
            return mediaOps.getMediaMetadata(this.ctx, params);
        }

        async getAllMediaMetaData(params: MediaQueryParams): Promise<MediaListResponse> {
            return mediaOps.getAllMediaMetaData(this.ctx, params);
        }

        async getFilteredMedia(params: MediaQueryParams): Promise<FilteredMediaListResponse> {
            return mediaOps.getFilteredMedia(this.ctx, params);
        }

        async getFileUrl(url: string, filename: string): Promise<string> {
            return mediaOps.getFileUrl(this.ctx, url, filename);
        }

        // ---- Channel / Group operations ----

        async createGroup(): Promise<GroupCreationResult> {
            return channelOps.createGroup(this.ctx);
        }

        async archiveChat(id: bigInt.BigInteger, accessHash: bigInt.BigInteger): Promise<Api.TypeUpdates> {
            return channelOps.archiveChat(this.ctx, id, accessHash);
        }

        async forwardMedia(channel: string, fromChatId: string): Promise<void> {
            return channelOps.forwardMedia(this.ctx, channel, fromChatId);
        }

        async joinChannel(entity: EntityLike): Promise<Api.TypeUpdates> {
            return channelOps.joinChannel(this.ctx, entity);
        }

        async leaveChannels(chats: string[]): Promise<void> {
            return channelOps.leaveChannels(this.ctx, chats);
        }

        async getGrpMembers(entity: EntityLike, offset: number = 0, limit: number = 200): Promise<PaginatedGroupMembers> {
            return channelOps.getGrpMembers(this.ctx, entity, offset, limit);
        }

        async addGroupMembers(groupId: string, members: string[]): Promise<void> {
            return channelOps.addGroupMembers(this.ctx, groupId, members);
        }

        async removeGroupMembers(groupId: string, members: string[]): Promise<void> {
            return channelOps.removeGroupMembers(this.ctx, groupId, members);
        }

        async promoteToAdmin(groupId: string, userId: string, permissions?: Partial<{
            changeInfo: boolean; postMessages: boolean; editMessages: boolean;
            deleteMessages: boolean; banUsers: boolean; inviteUsers: boolean;
            pinMessages: boolean; addAdmins: boolean; anonymous: boolean; manageCall: boolean;
        }>, rank?: string): Promise<void> {
            return channelOps.promoteToAdmin(this.ctx, groupId, userId, permissions, rank);
        }

        async demoteAdmin(groupId: string, userId: string): Promise<void> {
            return channelOps.demoteAdmin(this.ctx, groupId, userId);
        }

        async unblockGroupUser(groupId: string, userId: string): Promise<void> {
            return channelOps.unblockGroupUser(this.ctx, groupId, userId);
        }

        async getGroupAdmins(groupId: string): Promise<AdminInfo[]> {
            return channelOps.getGroupAdmins(this.ctx, groupId);
        }

        async getGroupBannedUsers(groupId: string): Promise<BannedUserInfo[]> {
            return channelOps.getGroupBannedUsers(this.ctx, groupId);
        }

        async createGroupOrChannel(options: GroupOptions): Promise<Api.TypeUpdates> {
            return channelOps.createGroupOrChannel(this.ctx, options);
        }

        async createGroupWithOptions(options: GroupOptions): Promise<Api.Chat | Api.Channel> {
            return channelOps.createGroupWithOptions(this.ctx, options);
        }

        async updateGroupSettings(settings: GroupSettingsUpdate): Promise<boolean> {
            return channelOps.updateGroupSettings(this.ctx, settings);
        }

        // ---- Contact operations ----

        async addContact(data: { mobile: string; tgId: string }[], namePrefix: string): Promise<void> {
            return contactOps.addContact(this.ctx, data, namePrefix);
        }

        async addContacts(mobiles: string[], namePrefix: string): Promise<void> {
            return contactOps.addContacts(this.ctx, mobiles, namePrefix);
        }

        async getContacts(): Promise<Api.contacts.TypeContacts> {
            return contactOps.getContacts(this.ctx);
        }

        async blockUser(chatId: string): Promise<void> {
            return contactOps.blockUser(this.ctx, chatId);
        }

        async exportContacts(format: 'vcard' | 'csv', includeBlocked: boolean = false): Promise<string> {
            return contactOps.exportContacts(this.ctx, format, includeBlocked);
        }

        async importContacts(data: { firstName: string; lastName?: string; phone: string }[]): Promise<ImportContactResult[]> {
            return contactOps.importContacts(this.ctx, data);
        }

        async manageBlockList(userIds: string[], block: boolean): Promise<BlockListResult[]> {
            return contactOps.manageBlockList(this.ctx, userIds, block);
        }

        async getContactStatistics(): Promise<ContactStats> {
            return contactOps.getContactStatistics(this.ctx);
        }

        async sendContactsFile(chatId: string, contacts: Api.contacts.Contacts, filename?: string): Promise<void> {
            return contactOps.sendContactsFile(this.ctx, chatId, contacts, filename);
        }

        // ---- Profile operations ----

        async updatePrivacy(): Promise<void> {
            return profileOps.updatePrivacy(this.ctx);
        }

        async updatePrivacyforDeletedAccount(): Promise<void> {
            return profileOps.updatePrivacyforDeletedAccount(this.ctx);
        }

        async updatePrivacyBatch(settings: PrivacyBatchSettings): Promise<boolean> {
            return profileOps.updatePrivacyBatch(this.ctx, settings);
        }

        async updateProfile(firstName: string, about: string): Promise<void> {
            return profileOps.updateProfile(this.ctx, firstName, about);
        }

        async updateUsername(baseUsername: string): Promise<string> {
            return profileOps.updateUsername(this.ctx, baseUsername);
        }

        async updateProfilePic(image: string): Promise<void> {
            return profileOps.updateProfilePic(this.ctx, image);
        }

        async downloadProfilePic(photoIndex: number): Promise<string | undefined> {
            return profileOps.downloadProfilePic(this.ctx, photoIndex);
        }

        async deleteProfilePhotos(): Promise<void> {
            return profileOps.deleteProfilePhotos(this.ctx);
        }

        // ---- Auth / Session operations ----

        async removeOtherAuths(): Promise<void> {
            return authOps.removeOtherAuths(this.ctx);
        }

        async getAuths(): Promise<Api.account.Authorizations> {
            return authOps.getAuths(this.ctx);
        }

        async getLastActiveTime(): Promise<string> {
            return authOps.getLastActiveTime(this.ctx);
        }

        async hasPassword(): Promise<boolean> {
            return authOps.hasPassword(this.ctx);
        }

        async set2fa(): Promise<{ email: string; hint: string; newPassword: string } | void> {
            return authOps.set2fa(this.ctx);
        }

        async createNewSession(): Promise<string> {
            return authOps.createNewSession(this.ctx);
        }

        async waitForOtp(): Promise<string> {
            return authOps.waitForOtp(this.ctx);
        }

        async getSessionInfo(): Promise<SessionInfo> {
            return authOps.getSessionInfo(this.ctx);
        }

        async terminateSession(options: TerminateSessionOptions): Promise<boolean> {
            return authOps.terminateSession(this.ctx, options);
        }

        // ---- Event handling ----

        async handleEvents(event: NewMessageEvent): Promise<void> {
            return clientOps.handleIncomingEvent(this.ctx, event);
        }

        // Dead code removed: forwardMediaToBot (was entirely commented out)
    }

    export default TelegramManager;
